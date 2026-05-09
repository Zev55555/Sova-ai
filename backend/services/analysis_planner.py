from __future__ import annotations

from pydantic import BaseModel, Field


class AnalysisPlanRequest(BaseModel):
    business_problem: str = ""
    metric_definition: str | None = None
    comparison_period: str | None = None
    dimensions: list[str] = Field(default_factory=list)
    change_factors: list[str] = Field(default_factory=list)
    uploaded_schema: dict = Field(default_factory=dict)


class FieldMapping(BaseModel):
    analysis_need: str
    matched_field: str | None
    status: str
    note: str


class AnalysisStep(BaseModel):
    step: int
    title: str
    description: str
    required_fields: list[str]
    status: str


class AnalysisPlanResponse(BaseModel):
    analysis_goal: str
    metric_summary: dict[str, str | list[str]]
    field_mapping: list[FieldMapping]
    analysis_steps: list[AnalysisStep]
    analysis_limitations: list[str]
    next_action: str


FIELD_RULES = [
    {
        "need": "时间字段",
        "keywords": ["date", "time", "day", "week", "month", "created_at", "order_date", "event_time", "日期", "时间"],
        "matched_note": "可用于趋势观察和对比周期切分。",
        "missing_note": "缺少时间字段，暂时无法验证趋势和对比周期。",
    },
    {
        "need": "指标相关字段",
        "keywords": [
            "metric",
            "value",
            "count",
            "rate",
            "amount",
            "gmv",
            "revenue",
            "price",
            "sales",
            "coupon",
            "used",
            "redeem",
            "receive",
            "active",
            "login",
            "visit",
            "conversion",
            "refund",
            "指标",
            "金额",
            "销售额",
            "优惠券",
            "核销",
            "领取",
            "使用",
            "活跃",
            "转化",
            "退款",
        ],
        "matched_note": "可用于计算或近似计算当前指标，下一阶段仍需校验字段含义与口径一致性。",
        "missing_note": "缺少明确指标计算字段，后续可能需要补充指标分子 / 分母或聚合值字段。",
    },
    {
        "need": "用户字段",
        "keywords": ["user_id", "uid", "customer_id", "member_id", "用户"],
        "matched_note": "可用于用户维度识别和去重口径校验。",
        "missing_note": "缺少用户字段，暂时无法做用户层面的拆解或去重分析。",
    },
    {
        "need": "订单字段",
        "keywords": ["order_id", "transaction_id", "trade_id", "订单", "交易"],
        "matched_note": "可用于订单维度拆解和订单口径指标计算。",
        "missing_note": "缺少订单字段，暂时无法做订单维度拆解。",
    },
    {
        "need": "城市 / 地区字段",
        "keywords": ["city", "region", "province", "area", "城市", "地区", "省份", "区域"],
        "matched_note": "可用于地区或城市维度拆解。",
        "missing_note": "缺少城市或地区字段，暂时无法做地区拆解。",
    },
    {
        "need": "渠道字段",
        "keywords": ["channel", "source", "utm_source", "campaign_source", "渠道", "来源"],
        "matched_note": "可用于渠道来源拆解。",
        "missing_note": "缺少渠道来源字段，暂时无法做渠道维度拆解。",
    },
    {
        "need": "金额字段",
        "keywords": ["amount", "gmv", "revenue", "price", "sales", "pay_amount", "order_amount", "金额", "销售额", "价格"],
        "matched_note": "可用于金额类指标或贡献变化分析。",
        "missing_note": "缺少金额字段，暂时无法做金额类指标分析。",
    },
    {
        "need": "优惠券字段",
        "keywords": ["coupon", "coupon_id", "coupon_used", "is_coupon_used", "receive", "redeem", "used", "优惠券", "核销", "领取", "使用"],
        "matched_note": "可用于优惠券领取 / 使用相关分析。",
        "missing_note": "缺少优惠券相关字段，暂时无法做优惠券领取 / 使用拆解。",
    },
    {
        "need": "用户类型字段",
        "keywords": ["user_type", "is_new_user", "member_level", "segment", "cohort", "用户类型", "新用户", "会员等级", "分层"],
        "matched_note": "可用于新老用户、会员等级或用户分层拆解。",
        "missing_note": "缺少用户类型或分层字段，暂时无法做用户类型拆解。",
    },
    {
        "need": "商家 / 商品字段",
        "keywords": ["merchant", "merchant_id", "shop", "product", "sku", "category", "商家", "商品", "门店", "类目"],
        "matched_note": "可用于商品、商家或业务对象维度拆解。",
        "missing_note": "缺少商品、商家或内容字段，暂时无法做业务对象维度拆解。",
    },
]


def generate_analysis_plan(request: AnalysisPlanRequest) -> AnalysisPlanResponse:
    clean_columns = _extract_clean_columns(request.uploaded_schema)
    field_mapping = _build_field_mapping(clean_columns, request.dimensions)
    mapping_by_need = {item.analysis_need: item for item in field_mapping}
    analysis_steps = _build_analysis_steps(request, mapping_by_need)
    limitations = _build_limitations(
        request.uploaded_schema,
        field_mapping,
        analysis_steps,
    )

    return AnalysisPlanResponse(
        analysis_goal=_build_analysis_goal(request.business_problem),
        metric_summary={
            "metric_definition": request.metric_definition or "待确认",
            "comparison_period": request.comparison_period or "待确认",
            "dimensions": request.dimensions,
            "change_factors": request.change_factors,
        },
        field_mapping=field_mapping,
        analysis_steps=analysis_steps,
        analysis_limitations=limitations,
        next_action="下一阶段将基于该分析计划生成 DuckDB SQL 并执行分析。",
    )


def _extract_clean_columns(uploaded_schema: dict) -> list[str]:
    columns: list[str] = []

    for file_schema in uploaded_schema.get("files", []):
        for column in file_schema.get("columns", []):
            clean_name = str(column.get("clean_name", "")).strip()
            if clean_name:
                columns.append(clean_name)

    return columns


def _build_field_mapping(
    clean_columns: list[str],
    dimensions: list[str],
) -> list[FieldMapping]:
    mappings = [_match_rule(rule, clean_columns) for rule in FIELD_RULES]

    known_dimensions = ["用户类型", "地区", "城市", "渠道", "商品", "商家", "内容", "时间粒度"]
    custom_dimensions = [
        dimension
        for dimension in dimensions
        if dimension and not any(keyword in dimension for keyword in known_dimensions)
    ]

    for dimension in custom_dimensions:
        matched_field = _find_field(clean_columns, [_normalize_text(dimension), dimension])
        mappings.append(
            FieldMapping(
                analysis_need=f"{dimension}字段",
                matched_field=matched_field,
                status="matched" if matched_field else "missing",
                note=(
                    f"可用于按{dimension}拆解指标变化。"
                    if matched_field
                    else f"缺少与{dimension}相关的字段，暂时无法做该自定义维度拆解。"
                ),
            )
        )

    return mappings


def _match_rule(rule: dict, clean_columns: list[str]) -> FieldMapping:
    matched_field = _find_field(clean_columns, rule["keywords"])
    return FieldMapping(
        analysis_need=rule["need"],
        matched_field=matched_field,
        status="matched" if matched_field else "missing",
        note=rule["matched_note"] if matched_field else rule["missing_note"],
    )


def _build_analysis_steps(
    request: AnalysisPlanRequest,
    mapping_by_need: dict[str, FieldMapping],
) -> list[AnalysisStep]:
    steps = [
        _build_step(
            1,
            "确认指标异动是否真实存在",
            "根据对比周期计算当前期与对照期的指标差异。该步骤用于验证异常是否真实存在，而不是直接判断原因。",
            ["时间字段", "指标相关字段"],
            mapping_by_need,
        ),
        _build_step(
            2,
            "拆解整体指标变化贡献",
            "围绕已确认指标口径，比较不同分组对整体变化的贡献。当前数据支持的字段会优先进入拆解。",
            ["指标相关字段"],
            mapping_by_need,
        ),
    ]

    next_step = 3
    for dimension in request.dimensions:
        dimension_step = _dimension_step(next_step, dimension, mapping_by_need)
        if dimension_step:
            steps.append(dimension_step)
            next_step += 1

    if request.change_factors:
        required_fields = ["时间字段"]
        if any("渠道" in factor for factor in request.change_factors):
            required_fields.append("渠道字段")
        if any("运营" in factor or "规则" in factor for factor in request.change_factors):
            required_fields.append("指标相关字段")

        steps.append(
            _build_step(
                next_step,
                "结合近期变化因素设置验证方向",
                "该步骤用于把近期业务变化作为待验证假设，不把活动、投放或版本变化直接当作原因。",
                required_fields,
                mapping_by_need,
            )
        )

    return steps


def _dimension_step(
    step_number: int,
    dimension: str,
    mapping_by_need: dict[str, FieldMapping],
) -> AnalysisStep | None:
    if "用户类型" in dimension:
        return _build_step(
            step_number,
            "按用户类型拆解指标变化",
            "该步骤用于验证指标异动是否集中在新老用户、会员等级或用户分层等群体。",
            ["用户类型字段", "指标相关字段"],
            mapping_by_need,
        )

    if "地区" in dimension or "城市" in dimension:
        return _build_step(
            step_number,
            "按城市或地区拆解指标变化",
            "该步骤用于验证指标异动是否主要由特定城市、区域或省份贡献。",
            ["城市 / 地区字段", "指标相关字段"],
            mapping_by_need,
        )

    if "渠道" in dimension:
        return _build_step(
            step_number,
            "按渠道来源拆解指标变化",
            "该步骤用于验证指标异动是否与流量来源、投放渠道或入口变化有关。",
            ["渠道字段", "指标相关字段"],
            mapping_by_need,
        )

    if "商品" in dimension or "商家" in dimension or "内容" in dimension:
        return _build_step(
            step_number,
            "按商品、商家或业务对象拆解指标变化",
            "该步骤用于验证指标异动是否由部分业务对象表现变化带动。",
            ["商家 / 商品字段", "指标相关字段"],
            mapping_by_need,
        )

    if "时间粒度" in dimension:
        return _build_step(
            step_number,
            "按时间粒度观察指标异动",
            "该步骤用于验证指标异动是否集中在某些日期、小时或活动节点。",
            ["时间字段", "指标相关字段"],
            mapping_by_need,
        )

    custom_need = f"{dimension}字段"
    return _build_step(
        step_number,
        f"按{dimension}拆解指标变化",
        f"该步骤用于验证指标异动是否与{dimension}有关，当前只作为自定义维度验证方向。",
        [custom_need, "指标相关字段"],
        mapping_by_need,
    )


def _build_step(
    step_number: int,
    title: str,
    description: str,
    required_fields: list[str],
    mapping_by_need: dict[str, FieldMapping],
) -> AnalysisStep:
    required_statuses = [
        mapping_by_need.get(required_field).status
        for required_field in required_fields
        if mapping_by_need.get(required_field)
    ]

    if required_statuses and all(status == "matched" for status in required_statuses):
        status = "ready"
    elif any(status == "matched" for status in required_statuses):
        status = "partial"
    else:
        status = "blocked"

    return AnalysisStep(
        step=step_number,
        title=title,
        description=description,
        required_fields=required_fields,
        status=status,
    )


def _build_limitations(
    uploaded_schema: dict,
    field_mapping: list[FieldMapping],
    analysis_steps: list[AnalysisStep],
) -> list[str]:
    limitations = list(uploaded_schema.get("missing_requirements", []))

    for mapping in field_mapping:
        if mapping.status == "missing" and mapping.analysis_need in {
            "时间字段",
            "指标相关字段",
            "用户类型字段",
            "城市 / 地区字段",
            "渠道字段",
            "商家 / 商品字段",
        }:
            limitations.append(mapping.note)

    for step in analysis_steps:
        if step.status == "blocked":
            limitations.append(f"“{step.title}”缺少关键字段，当前暂不支持完整执行。")
        elif step.status == "partial":
            limitations.append(f"“{step.title}”仅部分字段就绪，后续需要谨慎解释结果。")

    unique_limitations = _deduplicate(limitations)
    if unique_limitations:
        return unique_limitations

    return ["当前未发现明显字段限制，仍需在下一阶段校验字段含义与指标口径是否一致。"]


def _build_analysis_goal(business_problem: str) -> str:
    problem = business_problem.strip()
    if problem:
        return f"分析“{problem}”背后的主要指标异动方向和可能贡献因素。"

    return "分析当前业务指标异动的主要方向和可能贡献因素。"


def _find_field(clean_columns: list[str], keywords: list[str]) -> str | None:
    normalized_keywords = [_normalize_text(keyword) for keyword in keywords if keyword]

    for column in clean_columns:
        normalized_column = _normalize_text(column)
        if any(keyword and keyword in normalized_column for keyword in normalized_keywords):
            return column

    return None


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
