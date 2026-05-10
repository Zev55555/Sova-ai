from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
from typing import Any

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


class MetricSpecExecuteRequest(BaseModel):
    upload_id: str | None = None
    table_name: str | None = None
    metric_spec: dict[str, Any] = Field(default_factory=dict)


@dataclass
class RegisteredTable:
    name: str
    source_name: str
    dataframe: pd.DataFrame


def execute_metric_spec_api(request: MetricSpecExecuteRequest) -> dict[str, Any]:
    if not request.upload_id:
        raise HTTPException(status_code=400, detail="请先提供 upload_id。")

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
    try:
        registered_tables = _register_uploaded_files(connection, uploaded_files)
        table = _select_table(registered_tables, request.table_name)
        result = execute_metric_spec(connection, table.name, request.metric_spec)
    except HTTPException:
        raise
    except Exception as error:
        raise HTTPException(
            status_code=400,
            detail="指标计算执行失败，请检查 metric_spec 和上传数据字段。",
        ) from error
    finally:
        connection.close()

    return {"metric_execution_result": result}


def execute_metric_spec(
    conn: duckdb.DuckDBPyConnection,
    table_name: str,
    metric_spec: dict[str, Any],
) -> dict[str, Any]:
    warnings: list[str] = []
    schema_fields = _table_schema_fields(conn, table_name)
    allowed_fields = _allowed_metric_spec_fields(metric_spec)
    existing_allowed_fields = allowed_fields & schema_fields

    for field in sorted(allowed_fields - schema_fields):
        warnings.append(f"字段 {field} 不存在，已跳过相关计算。")

    numerator = metric_spec.get("numerator", {}) if isinstance(metric_spec.get("numerator"), dict) else {}
    denominator = metric_spec.get("denominator", {}) if isinstance(metric_spec.get("denominator"), dict) else {}
    numerator_field = _safe_field(numerator.get("field"), existing_allowed_fields)
    denominator_field = _safe_field(denominator.get("field"), existing_allowed_fields)
    period_field = _safe_field(metric_spec.get("period_field"), existing_allowed_fields)

    if not numerator_field or not denominator_field:
        warnings.append("缺少可执行的分子或分母字段，无法计算指标率。")
        return _empty_result(metric_spec, warnings)
    if not period_field:
        warnings.append("缺少可执行的周期字段，无法计算本期与基准期对比。")
        return _empty_result(metric_spec, warnings)

    baseline_label, current_label = _resolve_period_labels(
        conn,
        table_name,
        period_field,
        metric_spec,
        warnings,
    )
    if not baseline_label or not current_label:
        return _empty_result(metric_spec, warnings)

    numerator_expr = _aggregation_expr(numerator, numerator_field, "numerator")
    denominator_expr = _aggregation_expr(denominator, denominator_field, "denominator")
    overall = _overall_comparison(
        conn,
        table_name,
        period_field,
        baseline_label,
        current_label,
        numerator_expr,
        denominator_expr,
        metric_spec,
    )
    dimension_breakdowns = _dimension_breakdowns(
        conn,
        table_name,
        metric_spec,
        existing_allowed_fields,
        period_field,
        baseline_label,
        current_label,
        numerator_expr,
        denominator_expr,
        warnings,
    )
    auxiliary_metric_comparisons = _auxiliary_metric_comparisons(
        conn,
        table_name,
        metric_spec,
        existing_allowed_fields,
        schema_fields,
        period_field,
        baseline_label,
        current_label,
        warnings,
    )

    return {
        "overall_metric_comparison": overall,
        "dimension_breakdowns": dimension_breakdowns,
        "top_movers": _top_movers(dimension_breakdowns, overall.get("delta_rate")),
        "auxiliary_metric_comparisons": auxiliary_metric_comparisons,
        "warnings": _deduplicate(warnings),
        "source": "metric_spec_executor",
    }


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


def _select_table(
    registered_tables: list[RegisteredTable],
    requested_table_name: str | None,
) -> RegisteredTable:
    if requested_table_name:
        for table in registered_tables:
            if table.name == requested_table_name:
                return table
        raise HTTPException(status_code=404, detail="未找到指定 table_name 对应的数据表。")
    return registered_tables[0]


def _table_schema_fields(conn: duckdb.DuckDBPyConnection, table_name: str) -> set[str]:
    rows = conn.execute(f"DESCRIBE {_quote_identifier(table_name)}").fetchall()
    return {str(row[0]) for row in rows}


def _allowed_metric_spec_fields(metric_spec: dict[str, Any]) -> set[str]:
    fields = {
        _clean_field(metric_spec.get("period_field")),
        _clean_field(metric_spec.get("time_field")),
    }
    for key in ["numerator", "denominator"]:
        value = metric_spec.get(key)
        if isinstance(value, dict):
            fields.add(_clean_field(value.get("field")))
    for key in ["dimensions", "auxiliary_fields"]:
        values = metric_spec.get(key)
        if isinstance(values, list):
            for item in values:
                if isinstance(item, dict):
                    fields.add(_clean_field(item.get("field")))
    return {field for field in fields if field}


def _safe_field(value: Any, allowed_fields: set[str]) -> str:
    field = _clean_field(value)
    return field if field in allowed_fields else ""


def _clean_field(value: Any) -> str:
    return str(value or "").strip()


def _resolve_period_labels(
    conn: duckdb.DuckDBPyConnection,
    table_name: str,
    period_field: str,
    metric_spec: dict[str, Any],
    warnings: list[str],
) -> tuple[str, str]:
    period_values = [
        str(row[0])
        for row in conn.execute(
            f"""
            SELECT DISTINCT CAST({_quote_identifier(period_field)} AS VARCHAR) AS period_value
            FROM {_quote_identifier(table_name)}
            WHERE {_quote_identifier(period_field)} IS NOT NULL
            LIMIT 100
            """
        ).fetchall()
    ]
    comparison = metric_spec.get("comparison") if isinstance(metric_spec.get("comparison"), dict) else {}
    baseline_candidates = [
        str(comparison.get("baseline_label") or "").strip(),
        "上周",
        "baseline",
        "last_week",
        "previous_week",
    ]
    current_candidates = [
        str(comparison.get("current_label") or "").strip(),
        "本周",
        "current",
        "this_week",
        "current_week",
    ]
    baseline = _first_period_match(period_values, baseline_candidates)
    current = _first_period_match(period_values, current_candidates)

    if not baseline or not current:
        warnings.append("周期字段中未找到可对比的本期 / 基准期标签，无法计算指标变化。")

    return baseline, current


def _first_period_match(period_values: list[str], candidates: list[str]) -> str:
    normalized_values = {value.lower(): value for value in period_values}
    for candidate in candidates:
        if candidate and candidate.lower() in normalized_values:
            return normalized_values[candidate.lower()]
    return ""


def _aggregation_expr(metric_part: dict[str, Any], field: str, part: str) -> str:
    aggregation = str(metric_part.get("aggregation") or "").lower()
    quoted_field = _quote_identifier(field)
    if aggregation == "count_distinct":
        return f"COUNT(DISTINCT {quoted_field})"
    if aggregation == "count":
        return f"COUNT({quoted_field})"
    if aggregation == "avg":
        return f"AVG(TRY_CAST({quoted_field} AS DOUBLE))"
    if aggregation == "sum":
        return f"SUM(TRY_CAST({quoted_field} AS DOUBLE))"
    if part == "denominator":
        return f"COUNT(DISTINCT {quoted_field})"
    return f"SUM(TRY_CAST({quoted_field} AS DOUBLE))"


def _overall_comparison(
    conn: duckdb.DuckDBPyConnection,
    table_name: str,
    period_field: str,
    baseline_label: str,
    current_label: str,
    numerator_expr: str,
    denominator_expr: str,
    metric_spec: dict[str, Any],
) -> dict[str, Any]:
    rows = _period_aggregate(
        conn,
        table_name,
        period_field,
        baseline_label,
        current_label,
        numerator_expr,
        denominator_expr,
    )
    baseline = rows.get(baseline_label, {"numerator": 0.0, "denominator": 0.0})
    current = rows.get(current_label, {"numerator": 0.0, "denominator": 0.0})
    baseline_rate = _rate(baseline["numerator"], baseline["denominator"])
    current_rate = _rate(current["numerator"], current["denominator"])

    return {
        "metric_name": metric_spec.get("metric_name", "业务指标"),
        "baseline_label": baseline_label,
        "current_label": current_label,
        "baseline": {
            "denominator": _round_count(baseline["denominator"]),
            "numerator": _round_count(baseline["numerator"]),
            "rate": baseline_rate,
        },
        "current": {
            "denominator": _round_count(current["denominator"]),
            "numerator": _round_count(current["numerator"]),
            "rate": current_rate,
        },
        "delta_rate": _delta(current_rate, baseline_rate),
        "delta_numerator": _round_count(current["numerator"] - baseline["numerator"]),
        "delta_denominator": _round_count(current["denominator"] - baseline["denominator"]),
    }


def _period_aggregate(
    conn: duckdb.DuckDBPyConnection,
    table_name: str,
    period_field: str,
    baseline_label: str,
    current_label: str,
    numerator_expr: str,
    denominator_expr: str,
) -> dict[str, dict[str, float]]:
    query = f"""
        SELECT
            CAST({_quote_identifier(period_field)} AS VARCHAR) AS period_value,
            {numerator_expr} AS numerator,
            {denominator_expr} AS denominator
        FROM {_quote_identifier(table_name)}
        WHERE CAST({_quote_identifier(period_field)} AS VARCHAR) IN (?, ?)
        GROUP BY 1
    """
    dataframe = conn.execute(query, [baseline_label, current_label]).df()
    return {
        str(row["period_value"]): {
            "numerator": float(row["numerator"] or 0),
            "denominator": float(row["denominator"] or 0),
        }
        for row in dataframe.to_dict("records")
    }


def _dimension_breakdowns(
    conn: duckdb.DuckDBPyConnection,
    table_name: str,
    metric_spec: dict[str, Any],
    existing_allowed_fields: set[str],
    period_field: str,
    baseline_label: str,
    current_label: str,
    numerator_expr: str,
    denominator_expr: str,
    warnings: list[str],
) -> list[dict[str, Any]]:
    breakdowns = []
    dimensions = metric_spec.get("dimensions") if isinstance(metric_spec.get("dimensions"), list) else []

    for dimension in dimensions:
        if not isinstance(dimension, dict):
            continue
        dimension_field = _safe_field(dimension.get("field"), existing_allowed_fields)
        if not dimension_field:
            warnings.append(f"维度字段 {dimension.get('field', '')} 不存在，已跳过该维度拆解。")
            continue
        rows = _dimension_rows(
            conn,
            table_name,
            period_field,
            dimension_field,
            baseline_label,
            current_label,
            numerator_expr,
            denominator_expr,
        )
        breakdowns.append(
            {
                "dimension_field": dimension_field,
                "dimension_label": str(dimension.get("label") or dimension_field),
                "rows": rows,
            }
        )

    return breakdowns


def _dimension_rows(
    conn: duckdb.DuckDBPyConnection,
    table_name: str,
    period_field: str,
    dimension_field: str,
    baseline_label: str,
    current_label: str,
    numerator_expr: str,
    denominator_expr: str,
) -> list[dict[str, Any]]:
    query = f"""
        SELECT
            COALESCE(CAST({_quote_identifier(dimension_field)} AS VARCHAR), '空值') AS dimension_value,
            CAST({_quote_identifier(period_field)} AS VARCHAR) AS period_value,
            {numerator_expr} AS numerator,
            {denominator_expr} AS denominator
        FROM {_quote_identifier(table_name)}
        WHERE CAST({_quote_identifier(period_field)} AS VARCHAR) IN (?, ?)
        GROUP BY 1, 2
    """
    dataframe = conn.execute(query, [baseline_label, current_label]).df()
    grouped: dict[str, dict[str, dict[str, float]]] = {}
    current_total_denominator = 0.0

    for row in dataframe.to_dict("records"):
        value = str(row["dimension_value"])
        period = str(row["period_value"])
        grouped.setdefault(value, {})[period] = {
            "numerator": float(row["numerator"] or 0),
            "denominator": float(row["denominator"] or 0),
        }
        if period == current_label:
            current_total_denominator += float(row["denominator"] or 0)

    rows = []
    for value, periods in grouped.items():
        baseline = periods.get(baseline_label, {"numerator": 0.0, "denominator": 0.0})
        current = periods.get(current_label, {"numerator": 0.0, "denominator": 0.0})
        baseline_rate = _rate(baseline["numerator"], baseline["denominator"])
        current_rate = _rate(current["numerator"], current["denominator"])
        current_share = (
            round(current["denominator"] / current_total_denominator * 100, 2)
            if current_total_denominator
            else None
        )
        rows.append(
            {
                "value": value,
                "baseline_denominator": _round_count(baseline["denominator"]),
                "baseline_numerator": _round_count(baseline["numerator"]),
                "baseline_rate": baseline_rate,
                "current_denominator": _round_count(current["denominator"]),
                "current_numerator": _round_count(current["numerator"]),
                "current_rate": current_rate,
                "delta_rate": _delta(current_rate, baseline_rate),
                "delta_numerator": _round_count(current["numerator"] - baseline["numerator"]),
                "current_share": current_share,
            }
        )

    return sorted(
        rows,
        key=lambda item: (
            item["delta_rate"] if item["delta_rate"] is not None else -999999,
            item["delta_numerator"],
        ),
        reverse=True,
    )[:100]


def _top_movers(
    dimension_breakdowns: list[dict[str, Any]],
    overall_delta_rate: float | None,
) -> list[dict[str, Any]]:
    movers = []
    direction = _overall_direction(overall_delta_rate)
    for breakdown in dimension_breakdowns:
        for row in breakdown.get("rows", []):
            if row.get("current_denominator", 0) < 20:
                continue
            if row.get("delta_rate") is None:
                continue
            movers.append(
                {
                    "dimension_field": breakdown.get("dimension_field", ""),
                    "dimension_label": breakdown.get("dimension_label", ""),
                    "value": row.get("value"),
                    "baseline_rate": row.get("baseline_rate"),
                    "current_rate": row.get("current_rate"),
                    "delta_rate": row.get("delta_rate"),
                    "current_denominator": row.get("current_denominator"),
                    "current_numerator": row.get("current_numerator"),
                    "reason": _mover_reason(direction),
                }
            )

    return sorted(movers, key=lambda item: _mover_sort_key(item, direction))[:10]


def _overall_direction(overall_delta_rate: float | None) -> str:
    if overall_delta_rate is None or abs(float(overall_delta_rate)) < 0.0001:
        return "flat"
    return "down" if overall_delta_rate < 0 else "up"


def _mover_sort_key(item: dict[str, Any], direction: str) -> tuple[float, float]:
    delta_rate = item.get("delta_rate")
    delta = float(delta_rate) if delta_rate is not None else 0.0
    current_numerator = float(item.get("current_numerator") or 0)
    if direction == "down":
        return (delta, -current_numerator)
    if direction == "up":
        return (-delta, -current_numerator)
    return (-abs(delta), -current_numerator)


def _mover_reason(direction: str) -> str:
    if direction == "down":
        return "该分组本周指标率下降明显，且当前样本量足够观察。"
    return "该分组本周指标率上升明显，且当前样本量足够观察。"


def _auxiliary_metric_comparisons(
    conn: duckdb.DuckDBPyConnection,
    table_name: str,
    metric_spec: dict[str, Any],
    existing_allowed_fields: set[str],
    schema_fields: set[str],
    period_field: str,
    baseline_label: str,
    current_label: str,
    warnings: list[str],
) -> list[dict[str, Any]]:
    comparisons: list[dict[str, Any]] = []
    auxiliary_fields = (
        metric_spec.get("auxiliary_fields")
        if isinstance(metric_spec.get("auxiliary_fields"), list)
        else []
    )

    for auxiliary in auxiliary_fields:
        if not isinstance(auxiliary, dict):
            continue
        raw_field = _clean_field(auxiliary.get("field"))
        field = _safe_field(raw_field, existing_allowed_fields)
        if not field:
            if raw_field and raw_field in schema_fields:
                warnings.append(f"辅助字段 {raw_field} 未进入 metric_spec 白名单，已跳过均值对比。")
            continue
        comparison = _auxiliary_metric_comparison(
            conn,
            table_name,
            period_field,
            baseline_label,
            current_label,
            field,
            str(auxiliary.get("label") or field),
            warnings,
        )
        if comparison:
            comparisons.append(comparison)

    return comparisons


def _auxiliary_metric_comparison(
    conn: duckdb.DuckDBPyConnection,
    table_name: str,
    period_field: str,
    baseline_label: str,
    current_label: str,
    field: str,
    label: str,
    warnings: list[str],
) -> dict[str, Any] | None:
    query = f"""
        SELECT
            CAST({_quote_identifier(period_field)} AS VARCHAR) AS period_value,
            AVG(TRY_CAST({_quote_identifier(field)} AS DOUBLE)) AS avg_value,
            COUNT(TRY_CAST({_quote_identifier(field)} AS DOUBLE)) AS numeric_count
        FROM {_quote_identifier(table_name)}
        WHERE CAST({_quote_identifier(period_field)} AS VARCHAR) IN (?, ?)
        GROUP BY 1
    """
    dataframe = conn.execute(query, [baseline_label, current_label]).df()
    values = {
        str(row["period_value"]): {
            "avg": row["avg_value"],
            "count": int(row["numeric_count"] or 0),
        }
        for row in dataframe.to_dict("records")
    }
    baseline = values.get(baseline_label, {"avg": None, "count": 0})
    current = values.get(current_label, {"avg": None, "count": 0})
    if baseline["count"] == 0 or current["count"] == 0:
        warnings.append(f"辅助字段 {field} 不是可稳定聚合的数值字段，已跳过均值对比。")
        return None

    baseline_avg = _round_metric(float(baseline["avg"]))
    current_avg = _round_metric(float(current["avg"]))
    delta_avg = _round_metric(current_avg - baseline_avg)
    delta_pct = (
        _round_metric(delta_avg / baseline_avg * 100)
        if baseline_avg != 0
        else None
    )
    return {
        "field": field,
        "label": label,
        "baseline_avg": baseline_avg,
        "current_avg": current_avg,
        "delta_avg": delta_avg,
        "delta_pct": delta_pct,
    }


def _empty_result(metric_spec: dict[str, Any], warnings: list[str]) -> dict[str, Any]:
    comparison = metric_spec.get("comparison") if isinstance(metric_spec.get("comparison"), dict) else {}
    return {
        "overall_metric_comparison": {
            "metric_name": metric_spec.get("metric_name", "业务指标"),
            "baseline_label": comparison.get("baseline_label", "上周"),
            "current_label": comparison.get("current_label", "本周"),
            "baseline": {"denominator": 0, "numerator": 0, "rate": None},
            "current": {"denominator": 0, "numerator": 0, "rate": None},
            "delta_rate": None,
            "delta_numerator": 0,
            "delta_denominator": 0,
        },
        "dimension_breakdowns": [],
        "top_movers": [],
        "auxiliary_metric_comparisons": [],
        "warnings": _deduplicate(warnings),
        "source": "metric_spec_executor",
    }


def _rate(numerator: float, denominator: float) -> float | None:
    if denominator == 0:
        return None
    return round(numerator / denominator * 100, 2)


def _delta(current: float | None, baseline: float | None) -> float | None:
    if current is None or baseline is None:
        return None
    return round(current - baseline, 2)


def _round_count(value: float) -> int | float:
    rounded = round(float(value), 4)
    return int(rounded) if rounded.is_integer() else rounded


def _round_metric(value: float) -> float:
    return round(float(value), 2)


def _quote_identifier(identifier: str) -> str:
    return f'"{identifier.replace(chr(34), chr(34) + chr(34))}"'


def _unique_table_name(table_name: str, existing_names: list[str]) -> str:
    if table_name not in existing_names:
        return table_name

    index = 2
    while f"{table_name}_{index}" in existing_names:
        index += 1
    return f"{table_name}_{index}"


def _deduplicate(values: list[str]) -> list[str]:
    result = []
    seen = set()
    for value in values:
        if value and value not in seen:
            seen.add(value)
            result.append(value)
    return result
