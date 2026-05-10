from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path

import duckdb
import pandas as pd
from fastapi import HTTPException
from pydantic import BaseModel, Field

from services.data_loader import (
    SUPPORTED_EXTENSIONS,
    UPLOAD_ROOT,
    _clean_column_name,
    _clean_table_name,
    _deduplicate_names,
    _read_dataframe,
    _to_json_safe,
)


class ExecuteAnalysisRequest(BaseModel):
    upload_id: str
    analysis_plan: dict = Field(default_factory=dict)
    business_problem: str = ""
    metric_definition: str | None = None
    comparison_period: str | None = None
    dimensions: list[str] = Field(default_factory=list)
    change_factors: list[str] = Field(default_factory=list)


class ResultTable(BaseModel):
    id: str
    title: str
    description: str
    columns: list[str]
    rows: list[dict]


class ExecuteAnalysisResponse(BaseModel):
    execution_summary: str
    tables: list[ResultTable]
    analysis_notes: list[str]
    limitations: list[str]


@dataclass
class RegisteredTable:
    name: str
    source_name: str
    dataframe: pd.DataFrame


KEYWORDS = {
    "time": ["date", "time", "day", "week", "month", "created_at", "order_date", "event_time", "日期", "时间"],
    "user": ["user_id", "uid", "customer_id", "member_id", "用户"],
    "order": ["order_id", "transaction_id", "trade_id", "订单", "交易"],
    "region": ["city", "region", "province", "area", "城市", "地区", "省份", "区域"],
    "channel": ["channel", "source", "utm_source", "campaign_source", "渠道", "来源"],
    "amount": ["amount", "gmv", "revenue", "price", "sales", "pay_amount", "order_amount", "金额", "销售额", "价格"],
    "coupon": ["coupon", "coupon_id", "coupon_used", "is_coupon_used", "receive", "redeem", "used", "优惠券", "核销", "领取", "使用"],
    "coupon_used": ["coupon_used", "is_coupon_used", "redeem", "used", "核销", "使用"],
    "user_type": ["user_type", "is_new_user", "member_level", "segment", "cohort", "用户类型", "新用户", "会员等级", "分层"],
}


def execute_basic_analysis(request: ExecuteAnalysisRequest) -> ExecuteAnalysisResponse:
    upload_dir = UPLOAD_ROOT / request.upload_id
    if not upload_dir.exists() or not upload_dir.is_dir():
        raise HTTPException(status_code=404, detail="未找到对应上传数据，请重新上传。")

    uploaded_files = [
        path
        for path in upload_dir.iterdir()
        if path.is_file() and path.suffix.lower() in SUPPORTED_EXTENSIONS
    ]
    if not uploaded_files:
        raise HTTPException(status_code=404, detail="未找到对应上传数据，请重新上传。")

    connection = duckdb.connect(database=":memory:")
    limitations: list[str] = []

    try:
        registered_tables = _register_uploaded_files(connection, uploaded_files)
        result_tables = _run_fixed_analyses(connection, registered_tables, limitations, request)
    except HTTPException:
        raise
    except Exception as error:
        raise HTTPException(
            status_code=400,
            detail="DuckDB 分析执行失败，请检查上传数据字段或格式。",
        ) from error
    finally:
        connection.close()

    analysis_notes = [
        "当前结果为规则版基础分析，后续可接入更复杂的 SQL 生成和证据链总结。",
        "基础分析用于探索记录数和通用分布；指标结论请优先参考上方“指标计算结果”。",
        "本阶段只返回结果表，不生成图表、证据链或报告。",
    ]

    if len(result_tables) <= 1:
        limitations.append("当前字段暂时不足以执行基础分析，请补充时间、用户、订单、金额或业务对象字段。")

    if request.analysis_plan.get("analysis_limitations"):
        limitations.extend(
            str(item)
            for item in request.analysis_plan.get("analysis_limitations", [])
            if str(item).strip()
        )

    return ExecuteAnalysisResponse(
        execution_summary=(
            "已完成基础指标异动分析。"
            if len(result_tables) > 1
            else "当前字段暂时不足以执行完整基础分析，已返回可用的数据概览。"
        ),
        tables=result_tables,
        analysis_notes=analysis_notes,
        limitations=_deduplicate(limitations),
    )


def _register_uploaded_files(
    connection: duckdb.DuckDBPyConnection,
    uploaded_files: list[Path],
) -> list[RegisteredTable]:
    registered_tables: list[RegisteredTable] = []
    table_names: list[str] = []

    for path in uploaded_files:
        dataframe = _load_clean_dataframe(path)
        table_name = _unique_table_name(_clean_table_name(path.stem), table_names)
        table_names.append(table_name)
        connection.register(table_name, dataframe)
        registered_tables.append(
            RegisteredTable(
                name=table_name,
                source_name=path.name,
                dataframe=dataframe,
            )
        )

    return registered_tables


def _load_clean_dataframe(path: Path) -> pd.DataFrame:
    dataframe = _read_dataframe(path, path.suffix.lower()).copy()
    original_names = [str(column) for column in dataframe.columns]
    clean_names = _deduplicate_names(
        [_clean_column_name(column, index) for index, column in enumerate(original_names)]
    )
    dataframe.columns = clean_names
    return dataframe


def _run_fixed_analyses(
    connection: duckdb.DuckDBPyConnection,
    registered_tables: list[RegisteredTable],
    limitations: list[str],
    request: ExecuteAnalysisRequest,
) -> list[ResultTable]:
    result_tables: list[ResultTable] = [_overview_table(registered_tables)]
    context_text = _analysis_context_text(request)

    trend_table = _first_table_with_field(registered_tables, "time")
    if trend_table:
        result_tables.append(_overall_trend(connection, trend_table))
    else:
        limitations.append("缺少时间字段，暂时无法执行整体趋势分析。")

    user_table = _first_table_with_field(registered_tables, "user")
    if user_table:
        result_tables.append(_user_breakdown(connection, user_table))
    elif _needs_user_analysis(context_text):
        limitations.append("缺少用户字段，暂时无法执行用户维度分析。")

    region_table = _first_table_with_field(registered_tables, "region")
    if region_table:
        result_tables.append(_region_breakdown(connection, region_table))
    else:
        limitations.append("缺少城市或地区字段，暂时无法执行地区 / 城市分析。")

    channel_spec = _channel_analysis_spec(registered_tables, context_text)
    if channel_spec:
        result_tables.append(_channel_breakdown(connection, *channel_spec))
    elif _needs_channel_analysis(context_text):
        limitations.append("缺少渠道来源字段，暂时无法执行渠道分析。")

    amount_table = _first_table_with_field(registered_tables, "amount")
    if amount_table and _is_commerce_context(context_text):
        result_tables.append(_amount_summary(connection, amount_table))
    elif _is_commerce_context(context_text):
        limitations.append("缺少金额字段，暂时无法执行金额分析。")

    coupon_table = _first_table_with_field(registered_tables, "coupon")
    if coupon_table and _is_coupon_context(context_text):
        result_tables.append(_coupon_summary(connection, coupon_table))
    elif _is_coupon_context(context_text):
        limitations.append("缺少优惠券相关字段，暂时无法执行优惠券相关分析。")

    return result_tables


def _overview_table(registered_tables: list[RegisteredTable]) -> ResultTable:
    rows = [
        {
            "表名": table.name,
            "来源文件": table.source_name,
            "行数": int(len(table.dataframe)),
            "字段数": int(len(table.dataframe.columns)),
        }
        for table in registered_tables
    ]
    return ResultTable(
        id="data_overview",
        title="数据基础概览",
        description="展示已注册到 DuckDB 的表名、来源文件、行数和字段数。",
        columns=["表名", "来源文件", "行数", "字段数"],
        rows=rows,
    )


def _overall_trend(
    connection: duckdb.DuckDBPyConnection,
    table: RegisteredTable,
) -> ResultTable:
    time_field = _find_field(table.dataframe.columns, "time")
    amount_field = _find_field(table.dataframe.columns, "amount")
    order_field = _find_field(table.dataframe.columns, "order")
    select_parts = [
        f"TRY_CAST({_quote_identifier(time_field)} AS DATE) AS 日期",
        "COUNT(*) AS 记录数",
    ]

    if amount_field:
        select_parts.append(f"SUM(TRY_CAST({_quote_identifier(amount_field)} AS DOUBLE)) AS 金额总和")
    if order_field:
        select_parts.append(f"COUNT(DISTINCT {_quote_identifier(order_field)}) AS 订单数")

    query = f"""
        SELECT {", ".join(select_parts)}
        FROM {_quote_identifier(table.name)}
        WHERE TRY_CAST({_quote_identifier(time_field)} AS DATE) IS NOT NULL
        GROUP BY 1
        ORDER BY 1
        LIMIT 200
    """

    return _query_table(
        connection,
        "overall_trend",
        "整体趋势分析",
        "按日期聚合记录数，并在字段可用时补充金额总和和订单数。",
        query,
    )


def _user_breakdown(
    connection: duckdb.DuckDBPyConnection,
    table: RegisteredTable,
) -> ResultTable:
    user_field = _find_field(table.dataframe.columns, "user")
    user_type_field = _find_field(table.dataframe.columns, "user_type")

    if user_type_field:
        query = f"""
            SELECT
                COALESCE(CAST({_quote_identifier(user_type_field)} AS VARCHAR), '空值') AS 用户类型,
                COUNT(*) AS 记录数,
                COUNT(DISTINCT {_quote_identifier(user_field)}) AS 用户数
            FROM {_quote_identifier(table.name)}
            GROUP BY 1
            ORDER BY 记录数 DESC
            LIMIT 200
        """
        description = "按用户类型或分层聚合记录数和去重用户数。"
    else:
        query = f"""
            SELECT
                COUNT(*) AS 记录数,
                COUNT(DISTINCT {_quote_identifier(user_field)}) AS 用户数
            FROM {_quote_identifier(table.name)}
        """
        description = "统计整体记录数和去重用户数；当前缺少用户类型字段，未做分层拆解。"

    return _query_table(
        connection,
        "user_breakdown",
        "用户维度分析",
        description,
        query,
    )


def _region_breakdown(
    connection: duckdb.DuckDBPyConnection,
    table: RegisteredTable,
) -> ResultTable:
    region_field = _find_field(table.dataframe.columns, "region")
    amount_field = _find_field(table.dataframe.columns, "amount")
    select_parts = [
        f"COALESCE(CAST({_quote_identifier(region_field)} AS VARCHAR), '空值') AS 地区",
        "COUNT(*) AS 记录数",
    ]
    if amount_field:
        select_parts.append(f"SUM(TRY_CAST({_quote_identifier(amount_field)} AS DOUBLE)) AS 金额总和")

    query = f"""
        SELECT {", ".join(select_parts)}
        FROM {_quote_identifier(table.name)}
        GROUP BY 1
        ORDER BY 记录数 DESC
        LIMIT 200
    """
    return _query_table(
        connection,
        "region_breakdown",
        "地区 / 城市分析",
        "按城市、地区、省份或区域聚合记录数，并在字段可用时补充金额总和。",
        query,
    )


def _channel_breakdown(
    connection: duckdb.DuckDBPyConnection,
    table: RegisteredTable,
    channel_field: str,
    title: str,
    description: str,
    value_label: str,
) -> ResultTable:
    amount_field = _find_field(table.dataframe.columns, "amount")
    select_parts = [
        f"COALESCE(CAST({_quote_identifier(channel_field)} AS VARCHAR), '空值') AS {_quote_identifier(value_label)}",
        "COUNT(*) AS 记录数",
    ]
    if amount_field:
        select_parts.append(f"SUM(TRY_CAST({_quote_identifier(amount_field)} AS DOUBLE)) AS 金额总和")

    query = f"""
        SELECT {", ".join(select_parts)}
        FROM {_quote_identifier(table.name)}
        GROUP BY 1
        ORDER BY 记录数 DESC
        LIMIT 200
    """
    return _query_table(
        connection,
        "channel_breakdown",
        title,
        description,
        query,
    )


def _amount_summary(
    connection: duckdb.DuckDBPyConnection,
    table: RegisteredTable,
) -> ResultTable:
    amount_field = _find_field(table.dataframe.columns, "amount")
    amount_expr = f"TRY_CAST({_quote_identifier(amount_field)} AS DOUBLE)"
    query = f"""
        SELECT
            COUNT({amount_expr}) AS 有效金额记录数,
            SUM({amount_expr}) AS 总金额,
            AVG({amount_expr}) AS 平均金额,
            MAX({amount_expr}) AS 最大值,
            MIN({amount_expr}) AS 最小值
        FROM {_quote_identifier(table.name)}
    """
    return _query_table(
        connection,
        "amount_summary",
        "金额分析",
        "计算金额字段的总和、均值、最大值和最小值。",
        query,
    )


def _coupon_summary(
    connection: duckdb.DuckDBPyConnection,
    table: RegisteredTable,
) -> ResultTable:
    coupon_field = _find_field(table.dataframe.columns, "coupon")
    coupon_used_field = _find_field(table.dataframe.columns, "coupon_used")
    coupon_count_expr = f"COUNT({_quote_identifier(coupon_field)})"

    if coupon_used_field:
        used_case = f"""
            CASE
                WHEN LOWER(CAST({_quote_identifier(coupon_used_field)} AS VARCHAR)) IN
                    ('true', '1', 'yes', 'y', 'used', 'redeemed', '是', '已使用', '使用', '已核销', '核销')
                THEN 1
                ELSE 0
            END
        """
        query = f"""
            SELECT
                COUNT(*) AS 总记录数,
                {coupon_count_expr} AS 有优惠券字段记录数,
                SUM({used_case}) AS 可能使用记录数,
                ROUND(SUM({used_case}) * 1.0 / NULLIF(COUNT(*), 0), 4) AS 可能使用率,
                '当前字段支持优惠券使用相关分析，但领取口径和使用口径仍需进一步确认。' AS 口径提示
            FROM {_quote_identifier(table.name)}
        """
    else:
        query = f"""
            SELECT
                COUNT(*) AS 总记录数,
                {coupon_count_expr} AS 有优惠券字段记录数,
                '当前字段支持优惠券相关分析，但未识别到明确使用 / 核销字段。' AS 口径提示
            FROM {_quote_identifier(table.name)}
        """

    return _query_table(
        connection,
        "coupon_summary",
        "优惠券相关分析",
        "基于优惠券相关字段统计记录数，并在字段可用时尝试计算可能使用率。",
        query,
    )


def _channel_analysis_spec(
    registered_tables: list[RegisteredTable],
    context_text: str,
) -> tuple[RegisteredTable, str, str, str, str] | None:
    checks: list[tuple[list[str], list[str], str, str, str]] = []
    if _is_game_context(context_text):
        checks.append(
            (
                ["map_channel", "map", "地图"],
                ["map_channel", "map"],
                "地图拆解",
                "按地图聚合记录数，用于避免把游戏地图字段误展示为渠道分析。",
                "地图",
            )
        )
    if _is_saas_context(context_text):
        checks.append(
            (
                ["signup_channel", "acquisition_channel", "注册来源", "获客渠道"],
                ["signup_channel", "acquisition_channel"],
                "注册来源渠道分析",
                "按注册来源或获客渠道聚合记录数，用于观察新用户来源结构。",
                "注册来源渠道",
            )
        )
    if _is_support_context(context_text):
        checks.append(
            (
                ["support_channel", "客服渠道", "支持渠道"],
                ["support_channel"],
                "支持渠道分析",
                "按客服支持渠道聚合记录数，用于观察不同支持入口的结构分布。",
                "支持渠道",
            )
        )
    if _is_commerce_context(context_text) or _needs_channel_analysis(context_text):
        checks.append(
            (
                ["channel", "source", "utm_source", "campaign_source", "渠道", "来源"],
                [],
                "渠道分析",
                "按渠道来源聚合记录数，并在字段可用时补充金额总和。",
                "渠道",
            )
        )

    for keywords, excluded_keywords, title, description, value_label in checks:
        for table in registered_tables:
            field = _find_field(table.dataframe.columns, keywords)
            if not field:
                continue
            normalized_field = _normalize_text(field)
            if excluded_keywords and not any(
                keyword in normalized_field for keyword in [_normalize_text(item) for item in excluded_keywords]
            ):
                continue
            return table, field, title, description, value_label

    return None


def _analysis_context_text(request: ExecuteAnalysisRequest) -> str:
    parts = [
        request.business_problem,
        request.metric_definition or "",
        request.comparison_period or "",
        " ".join(request.dimensions),
        " ".join(request.change_factors),
    ]
    metric_summary = request.analysis_plan.get("metric_summary")
    if isinstance(metric_summary, dict):
        parts.extend(str(value) for value in metric_summary.values())
    return " ".join(parts).lower()


def _is_game_context(text: str) -> bool:
    return _has_text_any(text, ["游戏", "valorant", "胜率", "对局", "地图", "排位"])


def _is_saas_context(text: str) -> bool:
    return _has_text_any(text, ["saas", "激活", "新注册", "新用户", "onboarding", "核心配置", "试用"])


def _is_support_context(text: str) -> bool:
    return _has_text_any(text, ["客服", "工单", "sla", "支持渠道", "support"])


def _is_commerce_context(text: str) -> bool:
    return _has_text_any(text, ["电商", "订单", "退款", "交易", "商品", "商家", "gmv", "金额", "销售额"])


def _is_coupon_context(text: str) -> bool:
    return _has_text_any(text, ["优惠券", "核销", "coupon"])


def _needs_user_analysis(text: str) -> bool:
    return _has_text_any(text, ["用户维度", "用户类型", "用户分层", "新老用户", "会员", "用户字段"])


def _needs_channel_analysis(text: str) -> bool:
    if _is_game_context(text):
        return False
    return _has_text_any(text, ["渠道", "来源", "投放", "获客", "support_channel", "signup_channel"])


def _has_text_any(text: str, keywords: list[str]) -> bool:
    normalized = str(text or "").lower()
    return any(keyword.lower() in normalized for keyword in keywords)


def _query_table(
    connection: duckdb.DuckDBPyConnection,
    table_id: str,
    title: str,
    description: str,
    query: str,
) -> ResultTable:
    dataframe = connection.sql(query).df()
    rows = [
        {column: _to_json_safe(value) for column, value in row.items()}
        for row in dataframe.to_dict("records")
    ]
    return ResultTable(
        id=table_id,
        title=title,
        description=description,
        columns=[str(column) for column in dataframe.columns],
        rows=rows,
    )


def _first_table_with_field(
    registered_tables: list[RegisteredTable],
    field_type: str,
) -> RegisteredTable | None:
    for table in registered_tables:
        if _find_field(table.dataframe.columns, field_type):
            return table
    return None


def _find_field(columns, field_type: str | list[str]) -> str | None:
    keywords = KEYWORDS[field_type] if isinstance(field_type, str) else field_type
    for column in columns:
        normalized_column = _normalize_text(str(column))
        if any(_normalize_text(keyword) in normalized_column for keyword in keywords):
            return str(column)
    return None


def _quote_identifier(identifier: str) -> str:
    return f'"{identifier.replace(chr(34), chr(34) + chr(34))}"'


def _unique_table_name(table_name: str, existing_names: list[str]) -> str:
    if table_name not in existing_names:
        return table_name

    index = 2
    while f"{table_name}_{index}" in existing_names:
        index += 1
    return f"{table_name}_{index}"


def _normalize_text(value: str) -> str:
    return value.strip().lower().replace(" ", "_").replace("/", "_")


def _deduplicate(values: list[str]) -> list[str]:
    result = []
    seen = set()
    for value in values:
        if value and value not in seen:
            seen.add(value)
            result.append(value)
    return result
