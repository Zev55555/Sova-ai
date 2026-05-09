from __future__ import annotations

from pydantic import BaseModel, Field


class EvidenceRequest(BaseModel):
    business_problem: str = ""
    metric_definition: str | None = None
    comparison_period: str | None = None
    dimensions: list[str] = Field(default_factory=list)
    change_factors: list[str] = Field(default_factory=list)
    analysis_plan: dict = Field(default_factory=dict)
    execution_result: dict = Field(default_factory=dict)


class EvidenceChain(BaseModel):
    id: str
    title: str
    finding: str
    evidence: list[str]
    related_table_ids: list[str]
    related_chart: str | None = None
    confidence_level: str
    suggested_next_check: str


class EvidenceResponse(BaseModel):
    summary: str
    evidence_chains: list[EvidenceChain]
    limitations: list[str]


TABLE_EVIDENCE_RULES = {
    "overall_trend": {
        "id": "trend_evidence",
        "title": "整体趋势存在可检查的波动",
        "finding": "当前数据已支持从时间维度观察指标变化趋势。",
        "evidence": [
            "来源结果表：整体趋势分析",
            "已检测到时间字段和对应聚合结果",
        ],
        "related_chart": "整体趋势变化",
        "suggested_next_check": "继续检查异动是否集中在特定日期、活动期或版本发布时间附近。",
    },
    "user_breakdown": {
        "id": "user_evidence",
        "title": "用户维度可能存在差异",
        "finding": "当前数据支持按用户相关字段观察不同用户群体的表现差异。",
        "evidence": [
            "来源结果表：用户维度分析",
            "已检测到用户字段或用户分层聚合结果",
        ],
        "related_chart": "用户维度拆解",
        "suggested_next_check": "进一步比较不同用户类型、新老用户或会员层级的指标变化。",
    },
    "region_breakdown": {
        "id": "region_evidence",
        "title": "地区 / 城市维度值得进一步检查",
        "finding": "当前数据支持按地区或城市观察指标表现差异。",
        "evidence": [
            "来源结果表：地区 / 城市分析",
            "已检测到地区或城市维度聚合结果",
        ],
        "related_chart": "地区 / 城市拆解",
        "suggested_next_check": "检查是否由少数地区贡献了主要变化。",
    },
    "channel_breakdown": {
        "id": "channel_evidence",
        "title": "渠道来源变化可能值得关注",
        "finding": "当前数据支持按渠道来源观察指标表现差异。",
        "evidence": [
            "来源结果表：渠道分析",
            "已检测到渠道来源维度聚合结果",
        ],
        "related_chart": "渠道来源拆解",
        "suggested_next_check": "结合近期投放变化，进一步检查流量结构是否发生变化。",
    },
    "amount_summary": {
        "id": "amount_evidence",
        "title": "金额指标已完成基础概览",
        "finding": "当前数据支持观察金额类指标的总量、均值和极值。",
        "evidence": [
            "来源结果表：金额分析",
            "已检测到金额字段的基础统计结果",
        ],
        "related_chart": "金额指标概览",
        "suggested_next_check": "进一步结合订单数、用户数或渠道维度判断金额变化来源。",
    },
    "coupon_summary": {
        "id": "coupon_evidence",
        "title": "优惠券相关字段已支持初步检查",
        "finding": "当前数据包含优惠券相关字段，可以支持初步观察优惠券领取、使用或核销相关表现。",
        "evidence": [
            "来源结果表：优惠券相关分析",
            "已检测到优惠券相关字段的基础统计结果",
        ],
        "related_chart": "优惠券相关分析",
        "suggested_next_check": "进一步确认领取口径和使用口径是否完整，避免混淆核销率分母。",
    },
}


DIMENSION_TABLE_MAP = [
    (["用户类型", "新老用户", "会员"], "user_breakdown"),
    (["地区", "城市"], "region_breakdown"),
    (["渠道"], "channel_breakdown"),
    (["时间粒度", "时间"], "overall_trend"),
    (["商品", "商家", "内容"], "business_object_breakdown"),
]


def generate_evidence(request: EvidenceRequest) -> EvidenceResponse:
    tables = request.execution_result.get("tables", [])
    table_ids = {str(table.get("id")) for table in tables if table.get("id")}
    limitations = [
        "当前证据链由规则生成，尚未接入真实 LLM。",
        "当前结果只能支持初步判断，不能直接证明因果关系。",
    ]
    limitations.extend(_dimension_limitations(request.dimensions, table_ids))

    evidence_chains = [
        _build_chain(table_id, request.execution_result)
        for table_id in TABLE_EVIDENCE_RULES
        if table_id in table_ids
    ]

    if not evidence_chains:
        limitations.append("当前结果暂不足以生成证据链，请补充更多字段或重新执行分析。")

    return EvidenceResponse(
        summary="系统基于当前结果表生成了初步证据链，以下发现仅代表当前数据支持的分析方向。",
        evidence_chains=evidence_chains,
        limitations=_deduplicate(limitations),
    )


def _build_chain(table_id: str, execution_result: dict) -> EvidenceChain:
    rule = TABLE_EVIDENCE_RULES[table_id]
    confidence_level = _confidence_level(table_id, execution_result)

    return EvidenceChain(
        id=rule["id"],
        title=rule["title"],
        finding=rule["finding"],
        evidence=rule["evidence"],
        related_table_ids=[table_id],
        related_chart=rule["related_chart"],
        confidence_level=confidence_level,
        suggested_next_check=rule["suggested_next_check"],
    )


def _confidence_level(table_id: str, execution_result: dict) -> str:
    table = next(
        (table for table in execution_result.get("tables", []) if table.get("id") == table_id),
        None,
    )
    row_count = len(table.get("rows", [])) if table else 0
    limitation_count = len(execution_result.get("limitations", []))

    if row_count == 0 or limitation_count >= 5:
        return "低"

    return "中"


def _dimension_limitations(dimensions: list[str], table_ids: set[str]) -> list[str]:
    limitations: list[str] = []

    for dimension in dimensions:
        expected_table_id = _expected_table_for_dimension(dimension)
        if expected_table_id and expected_table_id not in table_ids:
            limitations.append(
                f"用户选择了 {dimension} 维度，但当前字段不足，暂时无法生成该维度证据。"
            )

    return limitations


def _expected_table_for_dimension(dimension: str) -> str | None:
    for keywords, table_id in DIMENSION_TABLE_MAP:
        if any(keyword in dimension for keyword in keywords):
            return table_id

    if dimension.strip():
        return f"custom_{dimension}_breakdown"

    return None


def _deduplicate(values: list[str]) -> list[str]:
    result = []
    seen = set()

    for value in values:
        if value and value not in seen:
            seen.add(value)
            result.append(value)

    return result
