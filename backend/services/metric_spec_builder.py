from __future__ import annotations

from typing import Any, Literal

from pydantic import BaseModel


Confidence = Literal["high", "medium", "low"]


class MetricSpecRequest(BaseModel):
    business_problem: str = ""
    metric_definition: str | None = None
    semantic_context: dict[str, Any] | None = None
    analysis_plan: dict[str, Any] | None = None
    upload_schema: dict[str, Any] | None = None


def build_metric_spec(
    business_problem: str,
    metric_definition: str | None,
    semantic_context: dict[str, Any] | None,
    analysis_plan: dict[str, Any] | None,
    upload_schema: dict[str, Any] | None,
) -> dict[str, Any]:
    semantic_context = semantic_context or {}
    analysis_plan = analysis_plan or {}
    upload_schema = upload_schema or {}
    fields = _flatten_upload_fields(upload_schema)
    field_lookup = {field["field"]: field for field in fields}
    field_roles = [
        role for role in semantic_context.get("field_roles", []) if isinstance(role, dict)
    ]
    primary_metric = (
        semantic_context.get("primary_metric")
        if isinstance(semantic_context.get("primary_metric"), dict)
        else {}
    )
    metric_name = (
        str(primary_metric.get("name") or "").strip()
        or _metric_name_from_plan(analysis_plan)
        or "业务指标"
    )
    context_text = " ".join(
        str(item)
        for item in [
            business_problem,
            metric_definition or "",
            metric_name,
            semantic_context.get("business_domain", ""),
            semantic_context.get("scenario_match", {}).get("scenario_id", "")
            if isinstance(semantic_context.get("scenario_match"), dict)
            else "",
        ]
    ).lower()

    numerator = _build_numerator(primary_metric, field_roles, field_lookup, context_text)
    denominator = _build_denominator(
        primary_metric,
        field_roles,
        field_lookup,
        context_text,
        numerator.get("field", ""),
    )
    period_field = _choose_period_field(fields, field_roles)
    time_field = _choose_time_field(fields, field_roles)
    dimensions = _build_dimensions(field_roles, field_lookup)
    auxiliary_fields = _build_auxiliary_fields(field_roles, field_lookup)
    limitations = [
        "当前 metric_spec 只定义计算口径，不执行 SQL。",
        "当前结果不能直接作为因果结论。",
    ]

    confidence = _overall_confidence(numerator, denominator, period_field, time_field)
    if numerator["confidence"] == "low":
        limitations.append("指标分子字段需要人工确认后再进入正式计算。")
    if denominator["confidence"] == "low":
        limitations.append("指标分母字段需要人工确认后再进入正式计算。")
    if not period_field and not time_field:
        limitations.append("当前未识别到稳定的周期或日期字段，暂不能可靠进行本期与基准期对比。")

    return {
        "metric_name": metric_name,
        "metric_formula": _metric_formula(metric_name, numerator, denominator),
        "period_field": period_field,
        "time_field": time_field,
        "comparison": _comparison(period_field),
        "numerator": numerator,
        "denominator": denominator,
        "rate": {
            "unit": "%",
            "calculation": "numerator / denominator * 100",
        },
        "dimensions": dimensions,
        "auxiliary_fields": auxiliary_fields,
        "limitations": _deduplicate(limitations),
        "source": "semantic_context",
        "confidence": confidence,
    }


def build_metric_spec_response(request: MetricSpecRequest) -> dict[str, Any]:
    metric_spec = build_metric_spec(
        business_problem=request.business_problem,
        metric_definition=request.metric_definition,
        semantic_context=request.semantic_context,
        analysis_plan=request.analysis_plan,
        upload_schema=request.upload_schema,
    )
    return {
        "metric_spec": metric_spec,
        "source": metric_spec.get("source", "semantic_context"),
        "warnings": metric_spec.get("limitations", []),
        "limitations": metric_spec.get("limitations", []),
    }


def _flatten_upload_fields(upload_schema: dict[str, Any]) -> list[dict[str, Any]]:
    fields: list[dict[str, Any]] = []
    for file_result in upload_schema.get("files", []):
        for column in file_result.get("columns", []):
            clean_name = str(column.get("clean_name", "")).strip()
            if not clean_name:
                continue
            fields.append(
                {
                    "field": clean_name,
                    "original_name": str(column.get("original_name", clean_name)),
                    "dtype": str(column.get("dtype", "")),
                    "sample_values": column.get("sample_values", []),
                }
            )
    return fields


def _metric_name_from_plan(analysis_plan: dict[str, Any]) -> str:
    metric_summary = analysis_plan.get("metric_summary")
    if not isinstance(metric_summary, dict):
        return ""
    return str(metric_summary.get("metric_definition") or "").strip()


def _build_numerator(
    primary_metric: dict[str, Any],
    field_roles: list[dict[str, Any]],
    field_lookup: dict[str, dict[str, Any]],
    context_text: str,
) -> dict[str, Any]:
    candidates = _candidate_fields(primary_metric, field_roles, "numerator")
    field = _first_existing(candidates, field_lookup)
    role = _role_for_field(field_roles, field)
    confidence = _confidence_for_choice(field, candidates, role)
    aggregation = _numerator_aggregation(field, field_lookup.get(field), context_text)
    positive_value = 1 if aggregation == "sum" and _is_flag_field(field, field_lookup.get(field)) else None

    result = {
        "field": field,
        "aggregation": aggregation,
        "label": _counter_label(context_text, "numerator", field),
        "confidence": confidence,
    }
    if positive_value is not None:
        result["positive_value"] = positive_value
    return result


def _build_denominator(
    primary_metric: dict[str, Any],
    field_roles: list[dict[str, Any]],
    field_lookup: dict[str, dict[str, Any]],
    context_text: str,
    numerator_field: str,
) -> dict[str, Any]:
    candidates = _candidate_fields(primary_metric, field_roles, "denominator")
    field = _choose_denominator(candidates, field_lookup, context_text, numerator_field)
    role = _role_for_field(field_roles, field)
    return {
        "field": field,
        "aggregation": _denominator_aggregation(field, field_lookup.get(field)),
        "label": _counter_label(context_text, "denominator", field),
        "confidence": _confidence_for_choice(field, candidates, role),
    }


def _candidate_fields(
    primary_metric: dict[str, Any],
    field_roles: list[dict[str, Any]],
    part: Literal["numerator", "denominator"],
) -> list[str]:
    primary_key = (
        "candidate_numerator_fields"
        if part == "numerator"
        else "candidate_denominator_fields"
    )
    role_name = "metric_numerator" if part == "numerator" else "metric_denominator"
    candidates = [
        str(field).strip()
        for field in primary_metric.get(primary_key, [])
        if str(field).strip()
    ]
    candidates.extend(
        str(role.get("field", "")).strip()
        for role in field_roles
        if role.get("role") == role_name and str(role.get("field", "")).strip()
    )
    return _deduplicate(candidates)


def _choose_denominator(
    candidates: list[str],
    field_lookup: dict[str, dict[str, Any]],
    context_text: str,
    numerator_field: str,
) -> str:
    existing = [field for field in candidates if field in field_lookup and field != numerator_field]
    if not existing:
        return ""

    priority_groups = [
        (
            ["saas", "激活", "注册", "新用户", "产品", "onboarding", "试用", "activation", "signup"],
            ["user_id", "registered_user_id", "trial_user_id", "signup_id", "account_id", "workspace_id"],
        ),
        (["logistics", "物流", "配送", "履约", "shipment"], ["shipment_id", "tracking_id", "package_id", "order_id"]),
        (["education", "教育", "作业", "提交"], ["submission_id", "assignment_id", "student_id"]),
        (["game", "游戏", "胜率", "对局"], ["match_id", "game_id", "round_id"]),
        (["客服", "sla", "工单", "support"], ["ticket_id", "case_id", "request_id"]),
        (["预约", "到场", "reservation"], ["reservation_id", "booking_id", "appointment_id"]),
        (["退款", "电商", "订单", "ecommerce"], ["order_id", "transaction_id", "trade_id"]),
        (["完播", "播放", "content"], ["play_count", "view_count", "impression_count", "video_id"]),
    ]
    for context_keywords, field_priorities in priority_groups:
        if _has_any(context_text, context_keywords):
            for priority in field_priorities:
                for field in existing:
                    if priority == field or priority in field:
                        return field

    id_fields = [field for field in existing if _is_id_field(field)]
    return id_fields[0] if id_fields else existing[0]


def _numerator_aggregation(
    field: str,
    field_info: dict[str, Any] | None,
    context_text: str,
) -> str:
    if not field:
        return "unknown"
    if _is_flag_field(field, field_info):
        return "sum"
    if _has_any(field, ["amount", "count", "num", "total", "金额", "数量"]):
        return "sum"
    if _has_any(context_text, ["平均", "avg", "时长", "耗时"]) and _has_any(
        field,
        ["minutes", "hours", "duration", "seconds", "time_spent", "时长", "耗时"],
    ):
        return "avg"
    return "sum"


def _denominator_aggregation(field: str, field_info: dict[str, Any] | None) -> str:
    if not field:
        return "unknown"
    if _is_id_field(field):
        return "count_distinct"
    if _has_any(field, ["count", "num", "total", "play_count", "view_count", "impressions"]):
        return "sum"
    if _is_flag_field(field, field_info):
        return "sum"
    return "count"


def _choose_period_field(fields: list[dict[str, Any]], field_roles: list[dict[str, Any]]) -> str:
    for field in ["week_group", "period", "month_group", "date_group"]:
        if any(item["field"] == field for item in fields):
            return field
    for role in field_roles:
        field = str(role.get("field", ""))
        if role.get("role") == "period" and field:
            return field
    return ""


def _choose_time_field(fields: list[dict[str, Any]], field_roles: list[dict[str, Any]]) -> str:
    priorities = [
        "signup_date",
        "ship_date",
        "submit_date",
        "order_date",
        "match_date",
        "created_date",
        "publish_date",
        "booking_date",
        "created_at",
        "event_time",
        "date",
        "time",
    ]
    for priority in priorities:
        for field in fields:
            field_name = field["field"]
            if field_name == priority or priority in field_name:
                return field_name
    for role in field_roles:
        field = str(role.get("field", ""))
        if role.get("role") == "time" and field:
            return field
    return ""


def _build_dimensions(
    field_roles: list[dict[str, Any]],
    field_lookup: dict[str, dict[str, Any]],
) -> list[dict[str, Any]]:
    dimensions = []
    for role in field_roles:
        field = str(role.get("field", "")).strip()
        if role.get("role") != "dimension" or not field or field not in field_lookup:
            continue
        dimensions.append(
            {
                "field": field,
                "label": str(role.get("semantic_label") or role.get("matched_user_need") or field),
                "role": "breakdown",
                "confidence": _normalize_confidence(role.get("confidence")),
            }
        )
    return _deduplicate_objects(dimensions, "field")


def _build_auxiliary_fields(
    field_roles: list[dict[str, Any]],
    field_lookup: dict[str, dict[str, Any]],
) -> list[dict[str, Any]]:
    auxiliary_fields = []
    for role in field_roles:
        field = str(role.get("field", "")).strip()
        if role.get("role") not in {"auxiliary_metric", "explanatory_field", "status"}:
            continue
        if not field or field not in field_lookup:
            continue
        auxiliary_fields.append(
            {
                "field": field,
                "label": str(role.get("semantic_label") or field),
                "role": str(role.get("role") or "auxiliary_metric"),
            }
        )
    return _deduplicate_objects(auxiliary_fields, "field")


def _comparison(period_field: str) -> dict[str, str]:
    if period_field and "month" in period_field:
        return {"current_label": "本月", "baseline_label": "上月"}
    return {"current_label": "本周", "baseline_label": "上周"}


def _metric_formula(metric_name: str, numerator: dict[str, Any], denominator: dict[str, Any]) -> str:
    numerator_label = numerator.get("label") or "分子"
    denominator_label = denominator.get("label") or "分母"
    if numerator.get("field") and denominator.get("field"):
        return f"{numerator_label} / {denominator_label} × 100%"
    return f"{metric_name} 的计算口径需要人工确认"


def _counter_label(context_text: str, part: Literal["numerator", "denominator"], field: str) -> str:
    if part == "denominator":
        if _has_any(context_text, ["激活", "注册", "新用户", "saas", "activation", "signup"]):
            return "注册用户数"
        if _has_any(context_text, ["物流", "配送", "shipment"]):
            return "总运单数"
        if _has_any(context_text, ["作业", "提交", "education"]):
            return "作业提交记录数"
        if _has_any(context_text, ["游戏", "胜率", "match"]):
            return "总对局数"
        if _has_any(context_text, ["客服", "sla", "ticket"]):
            return "总工单数"
        if _has_any(context_text, ["退款", "电商", "订单"]):
            return "总订单数"
        if _has_any(context_text, ["完播", "播放"]):
            return "播放量"
        return "总记录数"

    if _has_any(context_text, ["激活", "注册", "新用户", "saas", "activation", "signup"]):
        return "激活用户数"
    if _has_any(context_text, ["物流", "配送", "延迟", "shipment"]):
        return "延迟运单数"
    if _has_any(context_text, ["作业", "按时", "提交", "education"]):
        return "按时提交作业数"
    if _has_any(context_text, ["游戏", "胜率", "match"]):
        return "获胜对局数"
    if _has_any(context_text, ["客服", "sla", "超时"]):
        return "SLA 超时工单数"
    if _has_any(context_text, ["退款", "电商"]):
        return "退款订单数"
    if _has_any(context_text, ["完播"]):
        return "完播数"
    return field or "指标分子"


def _role_for_field(field_roles: list[dict[str, Any]], field: str) -> dict[str, Any]:
    for role in field_roles:
        if role.get("field") == field:
            return role
    return {}


def _confidence_for_choice(
    field: str,
    candidates: list[str],
    role: dict[str, Any],
) -> Confidence:
    if not field:
        return "low"
    if _normalize_confidence(role.get("confidence")) == "high":
        return "high"
    if field in candidates:
        return "high"
    return "medium"


def _overall_confidence(
    numerator: dict[str, Any],
    denominator: dict[str, Any],
    period_field: str,
    time_field: str,
) -> Confidence:
    if numerator.get("confidence") == "high" and denominator.get("confidence") == "high":
        return "high" if period_field or time_field else "medium"
    if numerator.get("field") and denominator.get("field"):
        return "medium"
    return "low"


def _first_existing(candidates: list[str], field_lookup: dict[str, dict[str, Any]]) -> str:
    for field in candidates:
        if field in field_lookup:
            return field
    return ""


def _is_flag_field(field: str, field_info: dict[str, Any] | None) -> bool:
    dtype = str((field_info or {}).get("dtype", "")).lower()
    return (
        dtype == "bool"
        or _has_any(
            field,
            [
                "is_",
                "_flag",
                "flag",
                "result_win",
                "submitted_on_time",
                "checked_in",
                "breached",
                "converted",
                "refunded",
                "delayed",
                "activated",
                "activation",
                "completed_activation",
                "completed_core_setup",
                "setup_completed",
                "onboarding_completed",
            ],
        )
    )


def _is_id_field(field: str) -> bool:
    return field.endswith("_id") or field == "id"


def _normalize_confidence(value: Any) -> Confidence:
    return value if value in {"high", "medium", "low"} else "medium"


def _has_any(text: str, keywords: list[str]) -> bool:
    normalized = str(text or "").lower()
    return any(keyword.lower() in normalized for keyword in keywords)


def _deduplicate(values: list[str]) -> list[str]:
    result = []
    seen = set()
    for value in values:
        if value and value not in seen:
            seen.add(value)
            result.append(value)
    return result


def _deduplicate_objects(items: list[dict[str, Any]], key: str) -> list[dict[str, Any]]:
    result = []
    seen = set()
    for item in items:
        value = item.get(key)
        if value and value not in seen:
            seen.add(value)
            result.append(item)
    return result
