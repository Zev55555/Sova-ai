from __future__ import annotations

import json
import re
import shutil
from pathlib import Path
from typing import Any
from uuid import uuid4

import pandas as pd
from fastapi import HTTPException, UploadFile

from services.llm_client import (
    call_chat_completion,
    describe_http_error,
    has_hosted_llm_default,
    resolve_llm_config,
)
from services.scenario_profiles import get_scenario_profile, match_scenario_profile


UPLOAD_ROOT = Path(__file__).resolve().parent.parent / "uploads"
SUPPORTED_EXTENSIONS = {".csv", ".xlsx", ".xls"}


def process_uploaded_files(
    upload_files: list[UploadFile],
    dimensions_payload: str | None = None,
    business_context_payload: str | None = None,
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
    business_context = _parse_business_context(business_context_payload)
    semantic_context = _safe_build_semantic_context(
        file_results,
        dimensions,
        business_context,
    )
    supported_analysis = [
        title
        for item in semantic_context.get("supported_analysis", [])
        if isinstance(item, dict)
        for title in [str(item.get("title") or item.get("module") or "").strip()]
        if title
    ]
    missing_requirements = [
        reason
        for item in semantic_context.get("unsupported_analysis", [])
        if isinstance(item, dict)
        for reason in [str(item.get("reason") or item.get("title") or "").strip()]
        if reason
    ]

    return {
        "upload_id": upload_id,
        "files": file_results,
        "supported_analysis": supported_analysis,
        "missing_requirements": missing_requirements,
        "semantic_context": semantic_context,
    }


def _safe_build_semantic_context(
    file_results: list[dict],
    dimensions: list[str],
    business_context: dict,
) -> dict:
    try:
        return _build_semantic_context(file_results, dimensions, business_context)
    except Exception as error:
        return _build_minimal_semantic_context(
            file_results,
            fallback_reason=f"字段语义理解失败，已保留基础 Schema 结果。{type(error).__name__}",
        )


def _build_minimal_semantic_context(
    file_results: list[dict],
    fallback_reason: str,
) -> dict:
    fields = _flatten_schema_fields(file_results)
    return {
        "source": "fallback",
        "fallback_reason": fallback_reason,
        "scenario_match": None,
        "business_domain": "通用业务",
        "primary_metric": {
            "name": "业务指标",
            "definition": "待确认",
            "numerator_meaning": "指标分子或目标结果",
            "denominator_meaning": "指标分母或基准记录",
            "candidate_numerator_fields": [],
            "candidate_denominator_fields": [],
        },
        "field_roles": [
            {
                "field": field.get("field", ""),
                "original_name": field.get("original_name", ""),
                "semantic_label": "未明确字段",
                "role": "unknown",
                "matched_user_need": "",
                "confidence": "low",
                "reason": "字段语义理解失败，已保留基础字段识别结果。",
            }
            for field in fields
        ],
        "supported_analysis": [],
        "unsupported_analysis": [],
        "irrelevant_modules": [],
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


def _parse_business_context(payload: str | None) -> dict:
    if not payload:
        return {}

    try:
        parsed = json.loads(payload)
        return parsed if isinstance(parsed, dict) else {}
    except json.JSONDecodeError:
        return {}


def _build_semantic_context(
    file_results: list[dict],
    dimensions: list[str],
    business_context: dict,
) -> dict:
    fields = _flatten_schema_fields(file_results)
    scenario_support = _build_scenario_support(fields, business_context)
    fallback = _build_rule_based_semantic_context(
        file_results,
        dimensions,
        business_context,
        fallback_reason=None,
    )
    llm_settings = _read_llm_settings(business_context)

    if not llm_settings:
        return _build_rule_based_semantic_context(
            file_results,
            dimensions,
            business_context,
            fallback_reason="未配置可用 AI 设置，已使用本地规则生成字段语义理解。",
        )

    try:
        raw_response = call_chat_completion(
            api_key=llm_settings["api_key"],
            base_url=llm_settings["base_url"],
            model=llm_settings["model"],
            messages=[
                {
                    "role": "system",
                    "content": (
                        "你是一个资深中文数据分析师。你的任务是根据业务问题、已确认指标口径、"
                        "用户选择的分析维度和上传字段结构，生成通用字段语义映射 semantic_context。"
                        "不要套用固定行业模板，不要生成 SQL，不要重新计算数据。"
                        "请严格返回 JSON，不要 Markdown，不要解释。"
                    ),
                },
                {
                    "role": "user",
                    "content": _build_semantic_prompt(
                        file_results,
                        dimensions,
                        business_context,
                    ),
                },
            ],
            max_tokens=3200,
            temperature=0.2,
            response_format_json=True,
        )
        parsed = _parse_json_object(_extract_llm_content(raw_response))
        return _apply_scenario_profile_to_semantic_context(
            _validate_semantic_context(parsed),
            fields,
            scenario_support,
        )
    except Exception as error:
        return _build_rule_based_semantic_context(
            file_results,
            dimensions,
            business_context,
            fallback_reason=_semantic_failure_reason(error),
        )


def _build_rule_based_semantic_context(
    file_results: list[dict],
    dimensions: list[str],
    business_context: dict,
    fallback_reason: str | None,
) -> dict:
    fields = _flatten_schema_fields(file_results)
    scenario_support = _build_scenario_support(fields, business_context)
    scenario_profile = scenario_support.get("profile")
    scenario_match = scenario_support.get("match")
    context_text = _semantic_context_text(business_context, dimensions)
    matched_domain_label = (
        scenario_match.get("domain_label")
        if scenario_match and scenario_match.get("score", 0) >= 0.25
        else ""
    )
    business_domain = matched_domain_label or _business_context_value(
        business_context,
        "businessDomain",
        "business_domain",
    ) or _infer_business_domain(context_text)
    metric_name = _business_context_value(
        business_context,
        "metricName",
        "metric_name",
    ) or _infer_metric_name(context_text, scenario_profile)
    metric_definition = _business_context_value(
        business_context,
        "metricDefinition",
        "metric_definition",
    )
    selected_dimensions = _clean_text_list(
        business_context.get("selectedDimensions")
        or business_context.get("selected_dimensions")
        or dimensions
    )
    selected_change_factors = _clean_text_list(
        business_context.get("selectedChangeFactors")
        or business_context.get("selected_change_factors")
    )
    data_requirements = _clean_text_list(
        business_context.get("dataRequirements")
        or business_context.get("data_requirements")
    )

    primary_metric = _build_primary_metric(
        metric_name,
        metric_definition,
        context_text,
        fields,
        scenario_profile,
    )
    field_roles = [
        _classify_field(
            field,
            selected_dimensions,
            selected_change_factors,
            context_text,
            primary_metric,
            scenario_profile,
        )
        for field in fields
    ]
    supported_analysis = _build_supported_semantic_analysis(
        field_roles,
        selected_dimensions,
        context_text,
        primary_metric,
    )
    unsupported_analysis = _build_unsupported_semantic_analysis(
        field_roles,
        selected_dimensions,
        context_text,
        primary_metric,
        data_requirements,
    )
    supported_analysis = _filter_analysis_items_for_profile(
        supported_analysis,
        scenario_profile,
    )
    unsupported_analysis = _filter_analysis_items_for_profile(
        unsupported_analysis,
        scenario_profile,
    )

    semantic_context = {
        "source": "fallback",
        "fallback_reason": fallback_reason,
        "scenario_match": _public_scenario_match(scenario_match),
        "business_domain": business_domain,
        "primary_metric": primary_metric,
        "field_roles": field_roles,
        "supported_analysis": supported_analysis,
        "unsupported_analysis": unsupported_analysis,
        "irrelevant_modules": _build_irrelevant_modules(context_text, scenario_profile),
    }
    return semantic_context


def _flatten_schema_fields(file_results: list[dict]) -> list[dict]:
    fields = []
    for file_result in file_results:
        for column in file_result.get("columns", []):
            fields.append(
                {
                    "file": file_result.get("filename", ""),
                    "field": column.get("clean_name", ""),
                    "original_name": column.get("original_name", ""),
                    "dtype": column.get("dtype", ""),
                    "missing_rate": column.get("missing_rate", 0),
                    "sample_values": column.get("sample_values", []),
                }
            )
    return fields


def _build_scenario_support(fields: list[dict], business_context: dict) -> dict:
    business_problem = _business_context_value(
        business_context,
        "businessProblem",
        "business_problem",
    )
    metric_definition = " ".join(
        item
        for item in [
            _business_context_value(business_context, "metricName", "metric_name"),
            _business_context_value(
                business_context,
                "metricDefinition",
                "metric_definition",
            ),
        ]
        if item
    )
    field_names = [
        name
        for field in fields
        for name in [field.get("field", ""), field.get("original_name", "")]
        if name
    ]
    scenario_match = match_scenario_profile(
        business_problem=business_problem,
        metric_definition=metric_definition,
        field_names=field_names,
    )
    if scenario_match.get("score", 0) < 0.25:
        return {"match": scenario_match, "profile": None}

    return {
        "match": scenario_match,
        "profile": get_scenario_profile(scenario_match.get("scenario_id", "")),
    }


def _public_scenario_match(scenario_match: dict | None) -> dict | None:
    if not scenario_match or scenario_match.get("score", 0) < 0.25:
        return None
    return {
        "scenario_id": scenario_match.get("scenario_id", ""),
        "score": scenario_match.get("score", 0.0),
        "domain_label": scenario_match.get("domain_label", ""),
        "matched_reasons": scenario_match.get("matched_reasons", []),
    }


def _matching_profile_fields(fields: list[dict], hints: list[str]) -> list[str]:
    matched_fields: list[str] = []
    for field in fields:
        if _profile_hint_label(_field_text(field), {hint: hint for hint in hints}):
            matched_fields.append(field.get("field", ""))
    return _deduplicate(matched_fields)


def _profile_hint_label(field_text: str, hints: dict) -> str:
    normalized_field_text = str(field_text or "").lower()
    field_tokens = set(_ascii_tokens(normalized_field_text))

    for keyword, label in hints.items():
        normalized_keyword = str(keyword).strip().lower()
        if normalized_keyword and normalized_keyword in field_tokens:
            return str(label).strip()

    sorted_hints = sorted(
        hints.items(),
        key=lambda item: len(str(item[0])),
        reverse=True,
    )
    for keyword, label in sorted_hints:
        normalized_keyword = str(keyword).strip().lower()
        if normalized_keyword and normalized_keyword in normalized_field_text:
            return str(label).strip()
    return ""


def _apply_scenario_profile_to_semantic_context(
    semantic_context: dict,
    fields: list[dict],
    scenario_support: dict,
) -> dict:
    scenario_profile = scenario_support.get("profile")
    scenario_match = scenario_support.get("match")
    if not scenario_profile or not scenario_match or scenario_match.get("score", 0) < 0.25:
        semantic_context["scenario_match"] = None
        return semantic_context

    semantic_context["business_domain"] = scenario_match.get(
        "domain_label",
        semantic_context.get("business_domain", "通用业务"),
    )
    semantic_context["scenario_match"] = _public_scenario_match(scenario_match)

    primary_metric_value = semantic_context.get("primary_metric")
    primary_metric = primary_metric_value if isinstance(primary_metric_value, dict) else {}
    if primary_metric:
        numerator_fields = primary_metric.get("candidate_numerator_fields")
        denominator_fields = primary_metric.get("candidate_denominator_fields")
        primary_metric["candidate_numerator_fields"] = _deduplicate(
            (numerator_fields if isinstance(numerator_fields, list) else [])
            + _matching_profile_fields(
                fields,
                scenario_profile.get("likely_numerator_fields", []),
            )
        )
        primary_metric["candidate_denominator_fields"] = _deduplicate(
            (denominator_fields if isinstance(denominator_fields, list) else [])
            + _matching_profile_fields(
                fields,
                scenario_profile.get("likely_denominator_fields", []),
            )
        )

    field_roles = semantic_context.get("field_roles")
    if isinstance(field_roles, list):
        for role in field_roles:
            if not isinstance(role, dict):
                continue
            role_text = f"{role.get('field', '')} {role.get('original_name', '')}".lower()
            if role.get("field") in primary_metric.get("candidate_numerator_fields", []):
                role["role"] = "metric_numerator"
                role["confidence"] = "high"
                role["semantic_label"] = primary_metric.get("numerator_meaning", "指标分子")
                role["reason"] = "字段命中当前业务场景原型中的指标分子语义提示。"
                continue
            if role.get("field") in primary_metric.get("candidate_denominator_fields", []):
                role["role"] = "metric_denominator"
                role["confidence"] = "high"
                role["semantic_label"] = primary_metric.get("denominator_meaning", "指标分母")
                role["reason"] = "字段命中当前业务场景原型中的指标分母语义提示。"
                continue
            dimension_label = _profile_hint_label(
                role_text,
                scenario_profile.get("dimension_hints", {}),
            )
            auxiliary_label = _profile_hint_label(
                role_text,
                scenario_profile.get("auxiliary_hints", {}),
            )
            if dimension_label:
                role["role"] = "dimension"
                role["semantic_label"] = dimension_label
                role["matched_user_need"] = role.get("matched_user_need") or dimension_label
                role["confidence"] = "medium"
                role["reason"] = "字段命中当前业务场景原型中的维度语义提示。"
            elif auxiliary_label:
                role["role"] = "auxiliary_metric"
                role["semantic_label"] = auxiliary_label
                role["confidence"] = "medium"
                role["reason"] = "字段命中当前业务场景原型中的辅助指标语义提示。"

    semantic_context["supported_analysis"] = _filter_analysis_items_for_profile(
        semantic_context.get("supported_analysis", []),
        scenario_profile,
    )
    semantic_context["unsupported_analysis"] = _filter_analysis_items_for_profile(
        _remove_unsupported_items_with_matched_fields(
            semantic_context.get("unsupported_analysis", []),
            semantic_context.get("field_roles", []),
        ),
        scenario_profile,
    )
    semantic_context["irrelevant_modules"] = _build_irrelevant_modules("", scenario_profile)
    return semantic_context


def _build_primary_metric(
    metric_name: str,
    metric_definition: str,
    context_text: str,
    fields: list[dict],
    scenario_profile: dict | None = None,
) -> dict:
    numerator_meaning, denominator_meaning = _infer_metric_parts(
        metric_name,
        metric_definition,
        context_text,
    )
    candidate_numerator_fields = [
        field["field"]
        for field in fields
        if _matches_metric_part(field, numerator_meaning, context_text, "numerator")
    ]
    candidate_denominator_fields = [
        field["field"]
        for field in fields
        if _matches_metric_part(field, denominator_meaning, context_text, "denominator")
    ]
    if scenario_profile:
        candidate_numerator_fields.extend(
            _matching_profile_fields(fields, scenario_profile.get("likely_numerator_fields", []))
        )
        candidate_denominator_fields.extend(
            _matching_profile_fields(fields, scenario_profile.get("likely_denominator_fields", []))
        )
    candidate_numerator_fields = _prioritize_metric_numerator_candidates(
        candidate_numerator_fields,
        context_text,
    )

    return {
        "name": metric_name or "业务指标",
        "definition": metric_definition or "待确认",
        "numerator_meaning": numerator_meaning,
        "denominator_meaning": denominator_meaning,
        "candidate_numerator_fields": _deduplicate(candidate_numerator_fields),
        "candidate_denominator_fields": _deduplicate(candidate_denominator_fields),
    }


def _prioritize_metric_numerator_candidates(candidates: list[str], context_text: str) -> list[str]:
    if not _has_text_any(
        context_text,
        [
            "7日激活率",
            "7 日激活率",
            "七日激活率",
            "激活率",
            "新用户激活",
            "产品激活",
            "试用激活",
            "activated_within_7d",
            "activation",
        ],
    ):
        return candidates

    direct_activation_fields = [
        field
        for field in candidates
        if _has_text_any(
            field.lower(),
            [
                "activated_within_7d",
                "is_activated",
                "activation_flag",
                "completed_activation",
                "activated_user",
                "activation_status",
            ],
        )
    ]
    if not direct_activation_fields:
        return candidates

    setup_or_onboarding_fields = [
        "attended_onboarding",
        "onboarding_status",
        "completed_core_setup",
        "setup_completed",
        "onboarding_completed",
    ]
    return [
        field
        for field in candidates
        if field in direct_activation_fields
        or not _has_text_any(field.lower(), setup_or_onboarding_fields)
    ]


def _infer_metric_parts(
    metric_name: str,
    metric_definition: str,
    context_text: str,
) -> tuple[str, str]:
    if "/" in metric_definition:
        numerator, denominator = metric_definition.split("/", 1)
        return numerator.strip() or "指标分子", denominator.strip() or "指标分母"

    text = f"{metric_name} {metric_definition} {context_text}".lower()
    if _has_text_any(text, ["作业按时提交率", "按时提交率", "迟交率", "作业提交", "submitted_on_time"]):
        return "按时提交记录", "作业提交记录"
    if _has_text_any(
        text,
        [
            "7日激活率",
            "7 日激活率",
            "七日激活率",
            "激活率",
            "新用户激活",
            "产品激活",
            "试用激活",
            "activated_within_7d",
            "completed_activation",
        ],
    ):
        return "激活用户", "注册用户记录"
    if _has_text_any(text, ["sla超时率", "sla 超时率", "is_sla_breached", "客服", "工单"]):
        return "SLA 超时工单", "客服工单记录"
    if _has_text_any(text, ["到场率", "预约到场", "签到率", "checked in", "check-in"]):
        return "到场或签到记录", "预约记录"
    if _has_text_any(text, ["胜率", "win rate", "胜负", "valorant", "排位"]):
        return "胜利或胜负结果", "对局记录"
    if _has_text_any(text, ["退款率", "退款", "refund"]):
        return "退款记录或退款订单", "支付订单或订单记录"
    if _has_text_any(text, ["完播率", "完播", "complete play", "completion"]):
        return "完播数", "播放数"
    if _has_text_any(text, ["转化率", "conversion"]):
        return "目标转化行为", "基准行为或曝光访问"

    return "指标分子或目标结果", "指标分母或基准记录"


def _matches_metric_part(
    field: dict,
    meaning: str,
    context_text: str,
    part: str,
) -> bool:
    text = _field_text(field)
    meaning_text = f"{meaning} {context_text}".lower()

    if part == "denominator":
        if _has_text_any(meaning_text, ["激活", "注册用户", "新用户", "trial", "signup", "user"]):
            return _has_text_any(
                text,
                [
                    "user_id",
                    "account_id",
                    "signup_id",
                    "workspace_id",
                    "trial_user_id",
                    "registered_user_id",
                    "registered_user",
                    "用户",
                    "注册",
                ],
            )
        if _has_text_any(meaning_text, ["预约", "booking", "reservation"]):
            return _has_text_any(
                text,
                ["reservation_id", "booking_id", "reservation_count", "booking_count", "total_reservation", "总预约"],
            )
        if _has_text_any(meaning_text, ["胜率", "排位", "对局", "match", "game"]):
            return _has_text_any(text, ["match_id", "game_id", "match_count", "total_match", "对局"])
        if _has_text_any(meaning_text, ["订单", "支付订单", "order", "transaction"]):
            return _has_text_any(text, ["order_id", "transaction_id", "trade_id", "order_count", "paid_order"])
        if _has_text_any(meaning_text, ["播放", "play", "view"]):
            return _has_text_any(text, ["play_count", "view_count", "播放"])

    if part == "numerator" and _has_text_any(meaning_text, ["退款订单", "退款记录", "refunded order"]):
        return _has_text_any(text, ["is_refunded", "refund_order", "refunded_order", "退款订单"]) and not _has_text_any(text, ["amount", "金额"])

    if part == "numerator" and _has_text_any(meaning_text, ["退款金额", "refund amount"]):
        return _has_text_any(text, ["refund_amount", "退款金额"])

    if part == "numerator":
        groups = [
            ["activated_within_7d", "is_activated", "activation_flag", "completed_activation", "activated_user", "activation_status", "activated", "激活用户"],
            ["completed_core_setup", "setup_completed", "onboarding_completed", "core_setup", "核心配置", "onboarding"],
            ["checked_in", "checkin", "attend", "attendance", "到场", "签到"],
            ["result_win", "win", "won", "victory", "胜利", "胜负"],
            ["is_refunded", "refund", "退款", "退货"],
            ["complete_play_count", "complete", "completion", "完播"],
            ["converted", "conversion", "pay", "submit", "完成", "转化"],
        ]
    else:
        groups = [
            ["user_id", "account_id", "signup_id", "workspace_id", "trial_user_id", "registered_user_id", "user", "account", "signup", "注册用户", "新用户"],
            ["reservation_id", "booking_id", "reservation", "booking", "预约"],
            ["match_id", "match", "game_id", "对局"],
            ["order_id", "transaction_id", "trade_id", "order", "订单"],
            ["play_count", "play", "view", "播放"],
            ["visit", "exposure", "impression", "访问", "曝光"],
        ]

    return any(
        _has_text_any(meaning_text, group) and _has_text_any(text, group)
        for group in groups
    )


def _classify_field(
    field: dict,
    selected_dimensions: list[str],
    selected_change_factors: list[str],
    context_text: str,
    primary_metric: dict,
    scenario_profile: dict | None = None,
) -> dict:
    field_name = field.get("field", "")
    text = _field_text(field)
    profile_dimension_label = _profile_hint_label(
        text,
        scenario_profile.get("dimension_hints", {}) if scenario_profile else {},
    )
    profile_auxiliary_label = _profile_hint_label(
        text,
        scenario_profile.get("auxiliary_hints", {}) if scenario_profile else {},
    )
    matched_need, matched_score = _best_dimension_match(
        text,
        selected_dimensions,
        profile_dimension_label,
    )
    semantic_label = (
        profile_dimension_label
        or profile_auxiliary_label
        or _semantic_label_for_field(text, matched_need, context_text, scenario_profile)
    )
    role = "unknown"
    confidence = "low"
    reason = "当前字段名和样例值不足以明确判断语义。"

    if field_name in primary_metric.get("candidate_numerator_fields", []):
        role = "metric_numerator"
        confidence = "high"
        semantic_label = primary_metric.get("numerator_meaning") or semantic_label
        matched_need = primary_metric.get("name", "")
        reason = "字段语义与当前指标分子含义匹配。"
    elif field_name in primary_metric.get("candidate_denominator_fields", []):
        role = "metric_denominator"
        confidence = "high"
        semantic_label = primary_metric.get("denominator_meaning") or semantic_label
        matched_need = primary_metric.get("name", "")
        reason = "字段语义与当前指标分母或基准记录匹配。"
    elif matched_need:
        role = "dimension"
        confidence = "high" if matched_score >= 4 else "medium"
        semantic_label = profile_dimension_label or matched_need
        reason = f"字段语义与用户选择的“{matched_need}”维度匹配。"
    elif profile_dimension_label:
        role = "dimension"
        confidence = "medium"
        semantic_label = profile_dimension_label
        matched_need = profile_dimension_label
        reason = "字段命中当前业务场景原型中的维度语义提示。"
    elif profile_auxiliary_label:
        role = "auxiliary_metric"
        confidence = "medium"
        semantic_label = profile_auxiliary_label
        reason = "字段命中当前业务场景原型中的辅助指标语义提示。"
    elif _is_time_semantic(text):
        role = "time"
        confidence = "high"
        semantic_label = "时间字段"
        matched_need = "时间趋势或对比周期"
        reason = "字段名体现日期、时间、周期或发布时间语义。"
    elif _is_identifier_semantic(text):
        role = "id"
        confidence = "medium"
        semantic_label = _id_label_for_field(text, context_text)
        reason = "字段名体现记录、主体或业务对象 ID 语义。"
    elif _is_status_semantic(text):
        role = "status"
        confidence = "medium"
        reason = "字段名体现状态、结果或布尔标记语义。"
    elif _is_auxiliary_metric_semantic(text, context_text):
        role = "auxiliary_metric"
        confidence = "medium"
        reason = "字段可作为解释指标变化的辅助数值或表现字段。"
    elif _is_explanatory_semantic(text, selected_change_factors):
        role = "explanatory_field"
        confidence = "medium"
        reason = "字段语义与近期变化因素或外部解释变量相关。"

    return {
        "field": field_name,
        "original_name": field.get("original_name", ""),
        "semantic_label": semantic_label,
        "role": role,
        "matched_user_need": matched_need or "",
        "confidence": confidence,
        "reason": reason,
    }


def _build_supported_semantic_analysis(
    field_roles: list[dict],
    selected_dimensions: list[str],
    context_text: str,
    primary_metric: dict,
) -> list[dict]:
    supported: list[dict] = []
    numerator_fields = primary_metric.get("candidate_numerator_fields", [])
    denominator_fields = primary_metric.get("candidate_denominator_fields", [])

    if _fields_by_role(field_roles, "time"):
        supported.append(
            {
                "title": "时间趋势分析",
                "reason": "当前数据包含时间或周期字段，可用于观察指标异动在时间上的分布。",
                "related_fields": _fields_by_role(field_roles, "time"),
            }
        )

    if numerator_fields or denominator_fields:
        supported.append(
            {
                "title": "核心指标口径验证",
                "reason": "当前数据中存在与指标分子或分母含义相近的字段，可用于后续计算或校验指标。",
                "related_fields": _deduplicate(numerator_fields + denominator_fields),
            }
        )

    for dimension in selected_dimensions:
        related_fields = [
            role["field"]
            for role in field_roles
            if role.get("role") == "dimension"
            and role.get("matched_user_need") == dimension
        ]
        if related_fields:
            supported.append(
                {
                    "title": f"{dimension}拆解",
                    "reason": f"字段语义与用户选择的“{dimension}”维度匹配。",
                    "related_fields": _deduplicate(related_fields),
                }
            )

    for role in field_roles:
        if role.get("role") != "auxiliary_metric":
            continue
        label = role.get("semantic_label") or "辅助指标"
        title = f"{label}辅助分析"
        if not any(item["title"] == title for item in supported):
            supported.append(
                {
                    "title": title,
                    "reason": "该字段可作为解释指标异动的辅助指标，但不单独推断因果关系。",
                    "related_fields": [role["field"]],
                }
            )

    return _deduplicate_analysis_items(supported)


def _build_unsupported_semantic_analysis(
    field_roles: list[dict],
    selected_dimensions: list[str],
    context_text: str,
    primary_metric: dict,
    data_requirements: list[str],
) -> list[dict]:
    unsupported: list[dict] = []

    for dimension in selected_dimensions:
        has_dimension_field = _has_matched_dimension_field(field_roles, dimension)
        if not has_dimension_field:
            unsupported.append(
                {
                    "title": f"{dimension}拆解暂不支持",
                    "reason": f"缺少能明确对应“{dimension}”的字段，暂时无法做该维度拆解。",
                    "required_fields_or_context": [dimension],
                }
            )

    if not primary_metric.get("candidate_numerator_fields"):
        unsupported.append(
            {
                "title": "指标分子字段暂不明确",
                "reason": f"当前字段中暂未识别到可代表“{primary_metric.get('numerator_meaning', '指标分子')}”的字段。",
                "required_fields_or_context": [primary_metric.get("numerator_meaning", "指标分子")],
            }
        )

    if not primary_metric.get("candidate_denominator_fields"):
        unsupported.append(
            {
                "title": "指标分母字段暂不明确",
                "reason": f"当前字段中暂未识别到可代表“{primary_metric.get('denominator_meaning', '指标分母')}”的字段。",
                "required_fields_or_context": [primary_metric.get("denominator_meaning", "指标分母")],
            }
        )

    return _deduplicate_analysis_items(unsupported)


def _has_matched_dimension_field(field_roles: list[dict], dimension: str) -> bool:
    dimension_text = str(dimension or "").lower()

    for role in field_roles:
        if role.get("role") != "dimension":
            continue

        role_text = " ".join(
            str(role.get(key, ""))
            for key in ["field", "original_name", "semantic_label", "matched_user_need"]
        ).lower()
        if role.get("matched_user_need") == dimension:
            return True
        if dimension_text and dimension_text in role_text:
            return True
        if _semantic_match_score(role_text, dimension_text) >= 3:
            return True

    return False


def _remove_unsupported_items_with_matched_fields(
    unsupported_items: list[dict],
    field_roles: list[dict],
) -> list[dict]:
    matched_dimension_texts = [
        " ".join(
            str(role.get(key, ""))
            for key in ["field", "original_name", "semantic_label", "matched_user_need"]
        ).lower()
        for role in field_roles
        if isinstance(role, dict) and role.get("role") == "dimension"
    ]

    if not matched_dimension_texts:
        return unsupported_items

    filtered: list[dict] = []
    for item in unsupported_items:
        required_texts = [
            str(value).lower()
            for value in item.get("required_fields_or_context", [])
            if str(value).strip()
        ]
        if any(
            _unsupported_requirement_is_matched(required_text, matched_dimension_texts)
            for required_text in required_texts
        ):
            continue
        filtered.append(item)

    return filtered


def _unsupported_requirement_is_matched(
    required_text: str,
    matched_dimension_texts: list[str],
) -> bool:
    if not required_text:
        return False

    required_tokens = _ascii_tokens(required_text)
    for matched_text in matched_dimension_texts:
        if required_text in matched_text:
            return True
        if _semantic_match_score(matched_text, required_text) >= 3:
            return True
        if required_tokens and any(token in matched_text for token in required_tokens):
            return True

    return False


def _best_dimension_match(
    field_text: str,
    dimensions: list[str],
    profile_dimension_label: str = "",
) -> tuple[str, int]:
    if profile_dimension_label:
        profile_label_text = profile_dimension_label.lower()
        for dimension in dimensions:
            dimension_text = dimension.lower()
            if profile_label_text == dimension_text:
                return dimension, 8

    best_dimension = ""
    best_score = 0

    for dimension in dimensions:
        score = _specific_dimension_match_score(field_text, dimension)
        score += _semantic_match_score(field_text, dimension)
        if profile_dimension_label:
            profile_label_text = profile_dimension_label.lower()
            dimension_text = dimension.lower()
            if profile_label_text == dimension_text:
                score += 8
            elif profile_label_text in dimension_text or dimension_text in profile_label_text:
                score += 6
            elif _semantic_match_score(profile_label_text, dimension) >= 3:
                score += 4
        if score > best_score:
            best_dimension = dimension
            best_score = score

    return (best_dimension, best_score) if best_score >= 3 else ("", 0)


def _specific_dimension_match_score(field_text: str, need: str) -> int:
    need_text = need.lower()
    specific_rules = [
        (["signup_channel", "acquisition_channel"], ["注册来源渠道", "注册来源", "获客渠道", "渠道"], 5),
        (["industry"], ["用户所属行业", "行业"], 5),
        (["company_size"], ["公司规模", "规模"], 5),
        (["plan_type"], ["套餐类型", "套餐"], 5),
        (["queue_type", "party_type"], ["排队类型", "队列类型", "排队", "队列"], 5),
        (["party_size"], ["组队人数", "组队"], 5),
        (["premade_type"], ["组队类型", "预组队"], 5),
        (["agent_team", "support_team", "assigned_team", "agent_group", "team_name"], ["处理团队", "客服团队", "团队"], 5),
        (["attended_onboarding", "onboarding_status"], ["onboarding", "引导"], 5),
        (["completed_core_setup", "setup_status"], ["核心配置", "配置"], 5),
        (["used_template"], ["模板"], 5),
        (["activation_blocker_reason"], ["激活阻塞原因", "阻塞原因", "原因"], 5),
        (["booking_source", "source", "entry", "entrance"], ["预约入口", "入口", "来源"], 4),
        (["time_slot", "slot", "hour"], ["时间段", "时段"], 4),
        (["seat", "seat_area", "seat_type"], ["座位", "座位类型"], 5),
        (["campus", "campus_zone", "study_area", "zone"], ["学习区域", "校区", "区域"], 4),
        (["student", "student_group", "cohort"], ["学生", "学生群体", "群体"], 4),
        (["weather"], ["天气"], 5),
        (["publish", "publish_date", "publish_time"], ["发布时间", "发布"], 5),
        (["author", "author_type"], ["作者", "作者类型"], 4),
        (["duration", "video_duration"], ["视频时长", "时长"], 4),
        (["traffic_source", "source"], ["流量来源", "来源"], 4),
        (["merchant", "merchant_id", "shop"], ["商家", "店铺"], 4),
        (["category", "product", "sku"], ["商品", "类目", "商品类目"], 4),
    ]

    return sum(
        weight
        for field_terms, need_terms, weight in specific_rules
        if _has_text_any(field_text, field_terms) and _has_text_any(need_text, need_terms)
    )


def _semantic_match_score(field_text: str, need: str) -> int:
    need_text = need.lower()
    score = 0

    for group in SEMANTIC_GROUPS:
        field_has = _has_text_any(field_text, group)
        need_has = _has_text_any(need_text, group)
        if field_has and need_has:
            score += 4

    for token in _ascii_tokens(need_text):
        if token and token in field_text:
            score += 1

    return score


def _semantic_label_for_field(
    field_text: str,
    matched_need: str,
    context_text: str,
    scenario_profile: dict | None = None,
) -> str:
    if matched_need:
        return matched_need

    profile_dimension_label = _profile_hint_label(
        field_text,
        scenario_profile.get("dimension_hints", {}) if scenario_profile else {},
    )
    if profile_dimension_label:
        return profile_dimension_label

    profile_auxiliary_label = _profile_hint_label(
        field_text,
        scenario_profile.get("auxiliary_hints", {}) if scenario_profile else {},
    )
    if profile_auxiliary_label:
        return profile_auxiliary_label

    label_rules = [
        ("是否到场", ["checked_in", "checkin", "attendance", "attend", "到场", "签到"]),
        ("预约记录", ["reservation_id", "booking_id", "reservation", "booking", "预约"]),
        ("胜负结果", ["result_win", "win", "won", "victory", "胜利", "胜负"]),
        ("对局记录", ["match_id", "match", "对局"]),
        ("地图", ["map", "地图"]),
        ("ACS / 表现指标", ["acs", "combat_score", "rating", "评分"]),
        ("退款金额", ["refund_amount", "退款金额"]),
        ("退款状态", ["is_refunded", "refund", "退款"]),
        ("订单金额 / GMV", ["order_amount", "gmv", "revenue", "sales", "金额"]),
        ("完播数", ["complete_play_count", "complete", "完播"]),
        ("播放量", ["play_count", "play", "播放"]),
        ("平均观看时长", ["avg_watch_seconds", "watch_seconds", "avg_watch", "观看时长"]),
        ("视频时长", ["video_duration_sec", "video_duration", "duration", "视频时长"]),
        ("发布时间", ["publish_date", "publish_time", "发布时间"]),
    ]
    for label, keywords in label_rules:
        if _has_text_any(field_text, keywords):
            return label

    return "未明确字段"


def _is_time_semantic(text: str) -> bool:
    return _has_text_any(
        text,
        ["date", "time", "day", "week", "month", "created_at", "event_time", "publish_date", "日期", "时间", "周期"],
    )


def _is_identifier_semantic(text: str) -> bool:
    return bool(re.search(r"(^|_)id($|_)", text)) or _has_text_any(text, ["编号", "记录"])


def _is_status_semantic(text: str) -> bool:
    return _has_text_any(text, ["status", "state", "result", "is_", "flag", "是否", "状态", "结果"])


def _is_auxiliary_metric_semantic(text: str, context_text: str) -> bool:
    if _has_text_any(text, ["acs", "rating", "duration", "watch_seconds", "avg_", "count", "ratio", "rate", "评分", "时长"]):
        return True
    if _has_text_any(context_text, ["教育", "学习", "课程", "作业", "学生"]) and _has_text_any(
        text,
        ["score", "grade", "成绩", "得分"],
    ):
        return True
    if _has_commerce_context(context_text) and _has_text_any(
        text,
        ["amount", "gmv", "revenue", "price", "sales", "pay_amount", "order_amount", "refund_amount", "金额"],
    ):
        return True
    return False


def _is_explanatory_semantic(text: str, selected_change_factors: list[str]) -> bool:
    change_text = " ".join(selected_change_factors).lower()
    return any(
        _semantic_match_score(text, factor) >= 3 for factor in selected_change_factors
    ) or _has_text_any(text, ["weather", "version", "campaign", "experiment", "天气", "版本", "活动", "实验"])


def _id_label_for_field(text: str, context_text: str) -> str:
    if _has_text_any(text, ["reservation", "booking", "预约"]):
        return "预约记录 ID"
    if _has_text_any(text, ["match", "game", "对局"]):
        return "对局 ID"
    if _has_text_any(text, ["order", "trade", "transaction", "订单"]):
        return "订单 ID"
    if _has_text_any(text, ["video", "content", "内容", "视频"]):
        return "内容 ID"
    if _has_text_any(text, ["user", "student", "member", "用户", "学生"]):
        return "主体 ID"
    return "记录 ID"


def _fields_by_role(field_roles: list[dict], role: str) -> list[str]:
    return _deduplicate([item["field"] for item in field_roles if item.get("role") == role])


def _filter_analysis_items_for_profile(items: list[dict], scenario_profile: dict | None) -> list[dict]:
    if not scenario_profile:
        return items

    forbidden_terms = [
        str(term).lower() for term in scenario_profile.get("forbidden_terms", []) if term
    ]
    if not forbidden_terms:
        return items

    filtered = []
    for item in items:
        item_text = json.dumps(item, ensure_ascii=False).lower()
        if any(term in item_text for term in forbidden_terms):
            continue
        filtered.append(item)
    return filtered


def _build_irrelevant_modules(context_text: str, scenario_profile: dict | None = None) -> list[dict]:
    modules = []
    if scenario_profile:
        return [
            {
                "module": "其他行业固定模板",
                "reason": "当前已匹配到更接近的业务场景原型，因此不会默认展示无关行业的固定分析模块。",
            }
        ]

    if not _has_commerce_context(context_text):
        modules.append(
            {
                "module": "固定电商交易模板",
                "reason": "当前业务问题和已选维度未体现交易、退款、销售额或商户语义，因此不会默认展示该类分析模块。",
            }
        )
    if not _has_text_any(context_text, ["游戏", "valorant", "胜率", "acs", "对局"]):
        modules.append(
            {
                "module": "固定游戏表现模板",
                "reason": "当前业务问题和已选维度未体现游戏对局、胜率或表现评分语义，因此不会默认展示该类分析模块。",
            }
        )
    return modules


def _read_llm_settings(context: dict) -> dict | None:
    settings = context.get("llmSettings") or context.get("llm_settings")
    if not isinstance(settings, dict):
        if has_hosted_llm_default():
            api_key, base_url, model = resolve_llm_config()
            return {"api_key": api_key, "base_url": base_url, "model": model}
        return None

    api_key = str(settings.get("apiKey") or settings.get("api_key") or "").strip()
    base_url = str(settings.get("baseUrl") or settings.get("base_url") or "").strip()
    model = str(settings.get("model") or "").strip()

    if not api_key or not base_url or not model:
        if not api_key and has_hosted_llm_default():
            api_key, base_url, model = resolve_llm_config()
            return {"api_key": api_key, "base_url": base_url, "model": model}
        return None

    return {"api_key": api_key, "base_url": base_url, "model": model}


def _build_semantic_prompt(
    file_results: list[dict],
    dimensions: list[str],
    business_context: dict,
) -> str:
    compact_schema = [
        {
            "filename": file_result.get("filename"),
            "row_count": file_result.get("row_count"),
            "columns": [
                {
                    "original_name": column.get("original_name"),
                    "clean_name": column.get("clean_name"),
                    "dtype": column.get("dtype"),
                    "missing_rate": column.get("missing_rate"),
                    "sample_values": column.get("sample_values", [])[:3],
                }
                for column in file_result.get("columns", [])
            ],
        }
        for file_result in file_results
    ]
    safe_context = {
        key: value
        for key, value in business_context.items()
        if key not in {"llmSettings", "llm_settings"}
    }
    return (
        "请根据以下上下文生成 semantic_context。回复必须以 { 开头，以 } 结尾。\n"
        f"业务上下文：{json.dumps(safe_context, ensure_ascii=False)}\n"
        f"用户选择的分析维度：{json.dumps(dimensions, ensure_ascii=False)}\n"
        f"上传字段结构：{json.dumps(compact_schema, ensure_ascii=False)}\n"
        "返回 JSON 字段必须包含：business_domain、primary_metric、field_roles、"
        "supported_analysis、unsupported_analysis、irrelevant_modules。"
    )


def _validate_semantic_context(parsed: dict[str, Any]) -> dict:
    required = [
        "business_domain",
        "primary_metric",
        "field_roles",
        "supported_analysis",
        "unsupported_analysis",
        "irrelevant_modules",
    ]
    for key in required:
        if key not in parsed:
            raise ValueError(f"semantic_context 返回字段缺失：{key}")

    parsed["primary_metric"] = _normalize_semantic_primary_metric(
        parsed.get("primary_metric"),
    )
    parsed["field_roles"] = _normalize_semantic_field_roles(
        parsed.get("field_roles"),
    )
    parsed["supported_analysis"] = _normalize_semantic_analysis_items(
        parsed.get("supported_analysis"),
    )
    parsed["unsupported_analysis"] = _normalize_semantic_analysis_items(
        parsed.get("unsupported_analysis"),
    )
    parsed["irrelevant_modules"] = _normalize_semantic_modules(
        parsed.get("irrelevant_modules"),
    )
    parsed["source"] = "llm"
    parsed["fallback_reason"] = None
    return parsed


def _normalize_semantic_primary_metric(value: Any) -> dict:
    if not isinstance(value, dict):
        value = {}
    return {
        "name": str(value.get("name") or "业务指标"),
        "definition": str(value.get("definition") or "待确认"),
        "numerator_meaning": str(value.get("numerator_meaning") or "待确认"),
        "denominator_meaning": str(value.get("denominator_meaning") or "待确认"),
        "candidate_numerator_fields": _string_list(
            value.get("candidate_numerator_fields"),
        ),
        "candidate_denominator_fields": _string_list(
            value.get("candidate_denominator_fields"),
        ),
    }


def _normalize_semantic_field_roles(value: Any) -> list[dict]:
    items = _list_from_llm_value(value)
    normalized: list[dict] = []
    for item in items:
        if not isinstance(item, dict):
            continue
        field = str(item.get("field") or item.get("name") or "").strip()
        if not field:
            continue
        normalized.append(
            {
                "field": field,
                "original_name": str(item.get("original_name") or field),
                "semantic_label": str(item.get("semantic_label") or field),
                "role": str(item.get("role") or "unknown"),
                "matched_user_need": str(item.get("matched_user_need") or ""),
                "confidence": str(item.get("confidence") or "medium"),
                "reason": str(item.get("reason") or ""),
            }
        )
    return normalized


def _normalize_semantic_analysis_items(value: Any) -> list[dict]:
    items = _list_from_llm_value(value)
    normalized: list[dict] = []
    for item in items:
        if isinstance(item, str):
            title = item.strip()
            if title:
                normalized.append({"title": title, "reason": "", "related_fields": []})
            continue
        if not isinstance(item, dict):
            continue
        title = str(item.get("title") or item.get("module") or "").strip()
        reason = str(item.get("reason") or item.get("description") or "").strip()
        if title or reason:
            normalized.append(
                {
                    "title": title or reason,
                    "reason": reason,
                    "related_fields": _string_list(item.get("related_fields")),
                    "required_fields_or_context": _string_list(
                        item.get("required_fields_or_context"),
                    ),
                }
            )
    return normalized


def _normalize_semantic_modules(value: Any) -> list[dict]:
    items = _list_from_llm_value(value)
    normalized: list[dict] = []
    for item in items:
        if not isinstance(item, dict):
            continue
        module = str(item.get("module") or item.get("title") or "").strip()
        reason = str(item.get("reason") or "").strip()
        if module or reason:
            normalized.append({"module": module or reason, "reason": reason})
    return normalized


def _list_from_llm_value(value: Any) -> list:
    if isinstance(value, list):
        return value
    if isinstance(value, dict):
        return list(value.values())
    if isinstance(value, str) and value.strip():
        return [value.strip()]
    return []


def _string_list(value: Any) -> list[str]:
    return [str(item).strip() for item in _list_from_llm_value(value) if str(item).strip()]


def _extract_llm_content(raw_response: dict[str, Any]) -> str:
    choices = raw_response.get("choices")
    if not isinstance(choices, list) or not choices:
        raise ValueError("模型返回内容缺少 choices")
    message = choices[0].get("message") if isinstance(choices[0], dict) else None
    content = message.get("content") if isinstance(message, dict) else None
    if not isinstance(content, str) or not content.strip():
        raise ValueError("模型返回内容为空")
    return content


def _parse_json_object(content: str) -> dict[str, Any]:
    stripped = content.strip()
    try:
        parsed = json.loads(stripped)
        if isinstance(parsed, dict):
            return parsed
    except json.JSONDecodeError:
        pass

    block = re.search(r"```(?:json)?\s*(\{.*?\})\s*```", stripped, re.S)
    if block:
        try:
            parsed = json.loads(block.group(1))
            if isinstance(parsed, dict):
                return parsed
        except json.JSONDecodeError:
            pass

    start = stripped.find("{")
    end = stripped.rfind("}")
    if start != -1 and end != -1 and end > start:
        parsed = json.loads(stripped[start : end + 1])
        if isinstance(parsed, dict):
            return parsed

    raise ValueError("模型返回内容不是合法 JSON")


def _semantic_failure_reason(error: Exception) -> str:
    if isinstance(error, ValueError):
        return str(error)
    if hasattr(error, "code"):
        return describe_http_error(error)  # type: ignore[arg-type]
    return "字段语义理解 AI 调用失败，已使用本地规则生成。"


def _business_context_value(context: dict, *keys: str) -> str:
    for key in keys:
        value = context.get(key)
        if isinstance(value, str) and value.strip():
            return value.strip()
    return ""


def _semantic_context_text(context: dict, dimensions: list[str]) -> str:
    parts: list[str] = []
    for key, value in context.items():
        if key in {"llmSettings", "llm_settings"}:
            continue
        if isinstance(value, str):
            parts.append(value)
        elif isinstance(value, list):
            parts.extend(str(item) for item in value)
    parts.extend(dimensions)
    return " ".join(parts).lower()


def _infer_business_domain(context_text: str) -> str:
    if _has_text_any(context_text, ["图书馆", "自习室", "预约", "到场", "签到", "座位"]):
        return "学习空间预约"
    if _has_text_any(context_text, ["游戏", "valorant", "胜率", "acs", "对局", "地图"]):
        return "游戏表现"
    if _has_commerce_context(context_text):
        return "电商交易"
    if _has_text_any(context_text, ["短视频", "视频", "完播", "播放", "作者", "内容"]):
        return "内容运营"
    if _has_text_any(context_text, ["课程", "作业", "学生", "学习", "班级", "考试"]):
        return "教育学习"
    return "通用业务"


def _infer_metric_name(context_text: str, scenario_profile: dict | None = None) -> str:
    metric_rules = [
        ("7日激活率", ["7日激活率", "7 日激活率", "七日激活率", "新用户激活", "产品激活", "试用激活", "activated_within_7d"]),
        ("激活率", ["激活率", "activation rate"]),
        ("作业按时提交率", ["作业按时提交率", "按时提交率", "迟交率", "提交率"]),
        ("SLA 超时率", ["sla超时率", "sla 超时率", "超时率", "sla"]),
        ("预约到场率", ["预约到场率", "到场率", "签到率"]),
        ("排位胜率", ["排位胜率", "胜率", "valorant"]),
        ("退款率", ["退款率", "退款"]),
        ("完播率", ["完播率", "完播"]),
        ("配送延迟率", ["配送延迟率", "延迟率", "配送超时率", "履约延迟"]),
        ("转化率", ["转化率"]),
        ("GMV / 销售额", ["gmv", "销售额"]),
    ]
    for metric_name, keywords in metric_rules:
        if _has_text_any(context_text, keywords):
            return metric_name
    if scenario_profile and scenario_profile.get("scenario_id") == "education_assignment":
        return "作业按时提交率"
    if scenario_profile and scenario_profile.get("scenario_id") == "customer_support_sla":
        return "SLA 超时率"
    if scenario_profile and scenario_profile.get("scenario_id") == "saas_product_usage":
        return "激活率"
    return "业务指标"


def _clean_text_list(value: Any) -> list[str]:
    if not isinstance(value, list):
        return []
    return [str(item).strip() for item in value if str(item).strip()]


def _field_text(field: dict) -> str:
    sample_text = " ".join(str(value) for value in field.get("sample_values", [])[:3])
    return (
        f"{field.get('field', '')} {field.get('original_name', '')} {sample_text}"
    ).lower()


def _has_text_any(text: str, keywords: list[str]) -> bool:
    return any(keyword.lower() in text for keyword in keywords)


def _has_commerce_context(text: str) -> bool:
    return _has_text_any(
        text,
        ["电商", "退款", "订单", "gmv", "销售额", "交易", "支付", "商品", "商家", "店铺"],
    )


def _ascii_tokens(text: str) -> list[str]:
    return [token for token in re.split(r"[^0-9a-zA-Z_]+", text.lower()) if token]


def _deduplicate_analysis_items(items: list[dict]) -> list[dict]:
    result = []
    seen = set()
    for item in items:
        key = item.get("title") or item.get("reason")
        if key and key not in seen:
            seen.add(key)
            result.append(item)
    return result


SEMANTIC_GROUPS = [
    ["booking_source", "reservation_source", "source", "entry", "entrance", "入口", "来源", "预约入口"],
    ["seat", "seat_type", "seat_area", "座位", "座位类型"],
    ["campus", "zone", "area", "campus_zone", "study_area", "学习区域", "区域"],
    ["checked_in", "checkin", "attendance", "attend", "到场", "签到"],
    ["reservation_id", "booking_id", "reservation", "booking", "预约记录", "预约"],
    ["result_win", "win", "won", "victory", "result", "胜负", "胜利", "结果"],
    ["match_id", "match", "game_id", "对局"],
    ["map", "map_channel", "地图"],
    ["agent", "hero", "character", "role", "英雄", "特工", "角色", "定位"],
    ["side", "attack", "defense", "attacker", "defender", "攻防"],
    ["server", "region", "server_region", "服务器", "地区"],
    ["acs", "combat_score", "score", "rating", "表现", "评分"],
    ["refund", "is_refunded", "refund_amount", "退款", "退货"],
    ["order_id", "order_amount", "order", "订单"],
    ["gmv", "revenue", "price", "sales", "pay_amount", "金额", "销售额"],
    ["product", "sku", "category", "商品", "类目"],
    ["merchant", "shop", "seller", "商家", "店铺"],
    ["channel", "source", "utm", "traffic_source", "渠道", "来源"],
    ["city", "province", "region", "城市", "地区"],
    ["user_type", "is_new_user", "member_level", "segment", "cohort", "用户类型", "学生群体"],
    ["content_type", "content", "内容类型"],
    ["author_type", "author", "creator", "作者类型", "作者"],
    ["duration", "video_duration_sec", "视频时长", "时长"],
    ["complete_play_count", "complete", "completion", "完播"],
    ["play_count", "play", "view", "播放"],
    ["publish_date", "publish_time", "发布时间"],
    ["weather", "天气"],
    ["signup_channel", "acquisition_channel", "注册来源", "获客渠道"],
    ["industry", "行业"],
    ["company_size", "公司规模"],
    ["plan_type", "套餐类型", "套餐"],
    ["queue_type", "party_type", "排队类型", "队列类型"],
    ["party_size", "组队人数"],
    ["premade_type", "组队类型"],
    ["agent_team", "support_team", "assigned_team", "agent_group", "team_name", "处理团队", "客服团队"],
    ["attended_onboarding", "onboarding_status", "onboarding", "引导"],
    ["completed_core_setup", "setup_status", "核心配置", "配置"],
    ["used_template", "模板"],
    ["activation_blocker_reason", "阻塞原因"],
]


def _detect_supported_analysis(
    clean_columns: list[str],
    dimensions: list[str],
    business_context: dict,
) -> list[str]:
    supported_analysis: list[str] = []
    context_text = _context_text(business_context)

    if _has_time_field(clean_columns):
        supported_analysis.append("时间趋势分析")

    for dimension in dimensions:
        keywords = _dimension_keywords(dimension)
        if keywords and _has_any(clean_columns, keywords):
            supported_analysis.append(_dimension_supported_label(dimension))

    if _is_game_context(context_text):
        game_checks = [
            ("胜负结果 / 胜率分析", ["win", "won", "result", "match_result", "victory", "胜负", "胜利", "结果"]),
            ("地图维度拆解", ["map", "地图"]),
            ("英雄 / 特工拆解", ["agent", "hero", "character", "role", "英雄", "特工", "角色", "定位"]),
            ("攻防方拆解", ["side", "attack", "defense", "attacker", "defender", "攻防", "进攻", "防守"]),
            ("服务器地区拆解", ["server", "region", "ping", "latency", "服务器", "地区", "延迟"]),
            ("ACS 辅助表现分析", ["acs", "combat_score", "score", "rating", "战斗评分", "评分"]),
        ]
        supported_analysis.extend(
            label for label, keywords in game_checks if _has_any(clean_columns, keywords)
        )

    if _is_ecommerce_context(context_text):
        ecommerce_checks = [
            ("订单维度分析", ["order_id", "transaction_id", "trade_id", "订单", "交易"]),
            ("金额类指标分析", ["amount", "gmv", "revenue", "price", "sales", "pay_amount", "order_amount", "金额", "销售额", "价格"]),
            ("商品 / 商家维度拆解", ["product", "sku", "category", "merchant", "shop", "商品", "商家", "店铺", "类目"]),
            ("退款相关分析", ["refund", "refund_amount", "refund_reason", "退款", "退货", "售后"]),
        ]
        supported_analysis.extend(
            label for label, keywords in ecommerce_checks if _has_any(clean_columns, keywords)
        )

        if _is_coupon_context(context_text) and _has_any(
            clean_columns,
            ["coupon", "coupon_id", "coupon_used", "is_coupon_used", "receive", "redeem", "used", "优惠券", "核销", "领取", "使用"],
        ):
            supported_analysis.append("优惠券领取 / 使用相关分析")

    if _is_content_context(context_text):
        content_checks = [
            ("内容表现指标分析", ["view", "play", "read", "click", "like", "share", "播放", "阅读", "点击", "互动"]),
            ("内容类型拆解", ["content_type", "type", "内容类型", "类型"]),
            ("作者 / 账号拆解", ["author", "creator", "account", "作者", "账号"]),
            ("推荐位置拆解", ["position", "slot", "feed", "recommend", "推荐位", "位置", "频道"]),
        ]
        supported_analysis.extend(
            label for label, keywords in content_checks if _has_any(clean_columns, keywords)
        )

    if _is_education_context(context_text):
        education_checks = [
            ("学习完成情况分析", ["complete", "completion", "submit", "完成", "提交"]),
            ("成绩 / 得分分析", ["score", "grade", "accuracy", "成绩", "得分", "正确率"]),
            ("课程维度拆解", ["course", "lesson", "chapter", "课程", "章节"]),
            ("班级 / 学生分层拆解", ["class", "student", "grade_level", "班级", "学生", "年级"]),
        ]
        supported_analysis.extend(
            label for label, keywords in education_checks if _has_any(clean_columns, keywords)
        )

    return _deduplicate(supported_analysis)


def _detect_missing_requirements(
    clean_columns: list[str],
    dimensions: list[str],
    business_context: dict,
) -> list[str]:
    missing_requirements: list[str] = []

    for dimension in dimensions:
        keywords = _dimension_keywords(dimension)
        if not keywords:
            continue

        if not _has_any(clean_columns, keywords):
            missing_requirements.append(
                f"缺少{dimension}相关字段，暂时无法做{dimension}拆解。"
            )

    context_text = _context_text(business_context)
    if _is_game_context(context_text) and not _has_any(
        clean_columns,
        ["win", "won", "result", "match_result", "victory", "胜负", "胜利", "结果"],
    ):
        missing_requirements.append("缺少胜负结果字段，暂时无法验证胜率变化。")

    return _deduplicate(missing_requirements)


def _dimension_keywords(dimension: str) -> list[str]:
    normalized = dimension.lower()
    keyword_rules = [
        (["时间", "日期", "周期"], ["date", "time", "day", "week", "month", "created_at", "event_time", "日期", "时间"]),
        (["地图"], ["map", "地图"]),
        (["英雄", "特工", "角色", "定位"], ["agent", "hero", "character", "role", "英雄", "特工", "角色", "定位"]),
        (["攻防"], ["side", "attack", "defense", "attacker", "defender", "攻防", "进攻", "防守"]),
        (["服务器", "延迟"], ["server", "region", "ping", "latency", "服务器", "地区", "延迟"]),
        (["acs", "评分", "表现"], ["acs", "combat_score", "score", "rating", "战斗评分", "评分"]),
        (["用户类型", "用户分层", "新老用户", "会员"], ["user_type", "is_new_user", "member_level", "segment", "cohort", "用户类型", "新用户", "会员等级"]),
        (["地区", "城市", "区域"], ["city", "region", "province", "area", "城市", "地区", "省份", "区域"]),
        (["渠道", "来源", "订单来源"], ["channel", "source", "utm_source", "campaign_source", "渠道", "来源"]),
        (["商品", "商家", "店铺", "类目", "sku"], ["product", "sku", "category", "merchant", "shop", "商品", "商家", "店铺", "类目"]),
        (["退款原因", "售后"], ["refund_reason", "refund", "after_sales", "退款原因", "退款", "售后"]),
        (["内容类型", "内容"], ["content_type", "content", "type", "内容类型", "内容"]),
        (["作者", "账号"], ["author", "creator", "account", "作者", "账号"]),
        (["推荐位置", "推荐位"], ["position", "slot", "feed", "recommend", "推荐位", "位置", "频道"]),
        (["课程", "章节"], ["course", "lesson", "chapter", "课程", "章节"]),
        (["班级", "学生", "年级"], ["class", "student", "grade_level", "班级", "学生", "年级"]),
        (["作业", "测验", "考试"], ["assignment", "quiz", "exam", "作业", "测验", "考试"]),
    ]

    for labels, keywords in keyword_rules:
        if any(label.lower() in normalized for label in labels):
            return keywords

    return [token for token in re.split(r"[\s/／、,，_-]+", dimension) if token.strip()]


def _dimension_supported_label(dimension: str) -> str:
    if "时间" in dimension:
        return "时间趋势分析"
    if "ACS" in dimension.upper() or "评分" in dimension:
        return "ACS 辅助表现分析"
    return f"{dimension}拆解"


def _context_text(context: dict) -> str:
    parts = []
    for key in ["businessProblem", "business_problem", "businessDomain", "business_domain", "metricName", "metric_name", "detectedScenario", "detected_scenario"]:
        value = context.get(key)
        if isinstance(value, str):
            parts.append(value)
    for key in ["dataRequirements", "data_requirements"]:
        value = context.get(key)
        if isinstance(value, list):
            parts.extend(str(item) for item in value)
    return " ".join(parts).lower()


def _has_time_field(clean_columns: list[str]) -> bool:
    return _has_any(clean_columns, ["date", "time", "day", "week", "month", "created_at", "order_date", "event_time", "日期", "时间"])


def _is_game_context(text: str) -> bool:
    return any(keyword in text for keyword in ["游戏", "valorant", "瓦罗兰特", "无畏契约", "排位", "胜率", "英雄", "特工", "地图", "acs"])


def _is_ecommerce_context(text: str) -> bool:
    return any(keyword in text for keyword in ["电商", "订单", "退款", "退货", "gmv", "销售额", "商品", "商家", "优惠券", "售后"])


def _is_coupon_context(text: str) -> bool:
    return any(keyword in text for keyword in ["优惠券", "核销", "coupon"])


def _is_content_context(text: str) -> bool:
    return any(keyword in text for keyword in ["内容", "视频", "播放", "阅读", "完播", "推荐", "作者"])


def _is_education_context(text: str) -> bool:
    return any(keyword in text for keyword in ["课程", "作业", "学生", "学习", "班级", "考试", "成绩"])


def _has_any(clean_columns: list[str], keywords: list[str]) -> bool:
    return any(
        keyword.lower() in column.lower()
        for column in clean_columns
        for keyword in keywords
    )


def _deduplicate(values: list[str]) -> list[str]:
    result = []
    seen = set()
    for value in values:
        if value and value not in seen:
            seen.add(value)
            result.append(value)
    return result
