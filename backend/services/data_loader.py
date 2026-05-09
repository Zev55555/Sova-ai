from __future__ import annotations

import json
import re
import shutil
from pathlib import Path
from uuid import uuid4

import pandas as pd
from fastapi import HTTPException, UploadFile


UPLOAD_ROOT = Path(__file__).resolve().parent.parent / "uploads"
SUPPORTED_EXTENSIONS = {".csv", ".xlsx", ".xls"}


def process_uploaded_files(
    upload_files: list[UploadFile],
    dimensions_payload: str | None = None,
) -> dict:
    if not upload_files:
        raise HTTPException(status_code=400, detail="请先选择需要上传的数据文件。")

    upload_id = str(uuid4())
    upload_dir = UPLOAD_ROOT / upload_id
    upload_dir.mkdir(parents=True, exist_ok=True)

    file_results = []
    all_clean_columns: list[str] = []

    for upload_file in upload_files:
        filename = Path(upload_file.filename or "uploaded_file").name
        extension = Path(filename).suffix.lower()

        if extension not in SUPPORTED_EXTENSIONS:
            raise HTTPException(
                status_code=400,
                detail="暂不支持该文件格式，请上传 CSV 或 Excel 文件。",
            )

        saved_path = upload_dir / filename
        upload_file.file.seek(0)
        with saved_path.open("wb") as output:
            shutil.copyfileobj(upload_file.file, output)

        dataframe = _read_dataframe(saved_path, extension)
        file_schema = _build_file_schema(filename, saved_path, dataframe)
        file_results.append(file_schema)
        all_clean_columns.extend(
            column["clean_name"] for column in file_schema["columns"]
        )

    dimensions = _parse_dimensions(dimensions_payload)
    supported_analysis = _detect_supported_analysis(all_clean_columns)
    missing_requirements = _detect_missing_requirements(
        all_clean_columns,
        dimensions,
    )

    return {
        "upload_id": upload_id,
        "files": file_results,
        "supported_analysis": supported_analysis,
        "missing_requirements": missing_requirements,
    }


def _read_dataframe(path: Path, extension: str) -> pd.DataFrame:
    try:
        if extension == ".csv":
            return _read_csv_with_fallback(path)

        return pd.read_excel(path, sheet_name=0)
    except Exception as error:
        raise HTTPException(
            status_code=400,
            detail="文件读取失败，请检查文件格式或编码。",
        ) from error


def _read_csv_with_fallback(path: Path) -> pd.DataFrame:
    last_error: Exception | None = None

    for encoding in ("utf-8-sig", "utf-8", "gbk"):
        try:
            return pd.read_csv(path, encoding=encoding, low_memory=False)
        except UnicodeDecodeError as error:
            last_error = error
            continue

    if last_error:
        raise last_error

    return pd.read_csv(path, low_memory=False)


def _build_file_schema(filename: str, path: Path, dataframe: pd.DataFrame) -> dict:
    original_names = [str(column) for column in dataframe.columns]
    clean_names = _deduplicate_names(
        [_clean_column_name(column, index) for index, column in enumerate(original_names)]
    )
    dataframe = dataframe.copy()
    dataframe.columns = clean_names

    columns = []
    row_count = int(len(dataframe))

    for original_name, clean_name in zip(original_names, clean_names):
        series = dataframe[clean_name]
        sample_values = [
            _to_json_safe(value) for value in series.dropna().head(5).tolist()
        ]
        columns.append(
            {
                "original_name": original_name,
                "clean_name": clean_name,
                "dtype": _normalize_dtype(series),
                "missing_rate": round(float(series.isna().mean()), 4)
                if row_count
                else 0.0,
                "sample_values": sample_values,
            }
        )

    return {
        "filename": filename,
        "table_name": _clean_table_name(path.stem),
        "row_count": row_count,
        "column_count": int(len(clean_names)),
        "columns": columns,
        "sample_rows": _sample_rows(dataframe),
    }


def _clean_column_name(name: str, index: int) -> str:
    clean_name = name.strip().lower()
    clean_name = re.sub(r"\s+", "_", clean_name)
    clean_name = re.sub(r"[^0-9a-zA-Z\u4e00-\u9fff]+", "_", clean_name)
    clean_name = re.sub(r"_+", "_", clean_name).strip("_")
    return clean_name or f"column_{index + 1}"


def _clean_table_name(name: str) -> str:
    clean_name = _clean_column_name(name, 0)
    return clean_name or "uploaded_table"


def _deduplicate_names(names: list[str]) -> list[str]:
    seen: dict[str, int] = {}
    result = []

    for name in names:
        count = seen.get(name, 0) + 1
        seen[name] = count
        result.append(name if count == 1 else f"{name}_{count}")

    return result


def _normalize_dtype(series: pd.Series) -> str:
    if pd.api.types.is_datetime64_any_dtype(series):
        return "datetime"
    if pd.api.types.is_integer_dtype(series):
        return "int"
    if pd.api.types.is_float_dtype(series):
        return "float"
    if pd.api.types.is_bool_dtype(series):
        return "bool"

    return "object"


def _sample_rows(dataframe: pd.DataFrame) -> list[dict]:
    rows = dataframe.head(5).where(pd.notnull(dataframe), None).to_dict("records")
    return [
        {key: _to_json_safe(value) for key, value in row.items()} for row in rows
    ]


def _to_json_safe(value):
    if pd.isna(value):
        return None
    if hasattr(value, "isoformat"):
        return value.isoformat()
    if hasattr(value, "item"):
        return value.item()
    return value


def _parse_dimensions(dimensions_payload: str | None) -> list[str]:
    if not dimensions_payload:
        return []

    try:
        parsed = json.loads(dimensions_payload)
        if isinstance(parsed, list):
            return [str(item).strip() for item in parsed if str(item).strip()]
    except json.JSONDecodeError:
        pass

    return [
        item.strip()
        for item in re.split(r"[,，、;\n]+", dimensions_payload)
        if item.strip()
    ]


def _detect_supported_analysis(clean_columns: list[str]) -> list[str]:
    checks = [
        ("时间趋势分析", _has_any(clean_columns, ["date", "time", "created_at", "order_date", "日期", "时间"])),
        ("用户维度拆解", _has_any(clean_columns, ["user_id", "uid", "customer_id", "用户"])),
        ("地区 / 城市拆解", _has_any(clean_columns, ["city", "region", "province", "城市", "地区", "省份"])),
        ("渠道来源拆解", _has_any(clean_columns, ["channel", "source", "utm_source", "渠道", "来源"])),
        ("金额类指标分析", _has_any(clean_columns, ["amount", "gmv", "revenue", "price", "sales", "金额", "销售额", "价格"])),
        ("订单维度分析", _has_any(clean_columns, ["order_id", "transaction_id", "订单", "交易"])),
        (
            "优惠券领取 / 使用相关分析",
            _has_any(
                clean_columns,
                [
                    "coupon",
                    "coupon_id",
                    "coupon_used",
                    "is_coupon_used",
                    "receive",
                    "redeem",
                    "used",
                    "优惠券",
                    "核销",
                    "领取",
                    "使用",
                ],
            ),
        ),
    ]

    return [label for label, is_supported in checks if is_supported]


def _detect_missing_requirements(
    clean_columns: list[str],
    dimensions: list[str],
) -> list[str]:
    missing_requirements: list[str] = []

    if _dimension_selected(dimensions, ["地区", "城市"]) and not _has_any(
        clean_columns,
        ["city", "region", "province", "城市", "地区", "省份"],
    ):
        missing_requirements.append("缺少城市或地区字段，暂时无法做地区维度拆解。")

    if _dimension_selected(dimensions, ["渠道"]) and not _has_any(
        clean_columns,
        ["channel", "source", "utm_source", "渠道", "来源"],
    ):
        missing_requirements.append("缺少渠道来源字段，暂时无法做渠道维度拆解。")

    if _dimension_selected(dimensions, ["用户类型"]) and not _has_any(
        clean_columns,
        ["user_type", "is_new_user", "member_level", "用户类型", "新用户", "会员等级"],
    ):
        missing_requirements.append("缺少用户类型或分层字段，暂时无法做用户类型拆解。")

    if _dimension_selected(dimensions, ["商品", "商家", "内容"]) and not _has_any(
        clean_columns,
        ["product", "sku", "category", "merchant", "shop", "content", "商品", "商家", "内容", "类目"],
    ):
        missing_requirements.append("缺少商品、商家或内容字段，暂时无法做业务对象维度拆解。")

    if _dimension_selected(dimensions, ["时间粒度"]) and not _has_any(
        clean_columns,
        ["date", "time", "created_at", "order_date", "日期", "时间"],
    ):
        missing_requirements.append("缺少日期或时间字段，暂时无法做时间粒度拆解。")

    return missing_requirements


def _dimension_selected(dimensions: list[str], keywords: list[str]) -> bool:
    return any(
        keyword.lower() in dimension.lower()
        for dimension in dimensions
        for keyword in keywords
    )


def _has_any(clean_columns: list[str], keywords: list[str]) -> bool:
    return any(
        keyword.lower() in column.lower()
        for column in clean_columns
        for keyword in keywords
    )
