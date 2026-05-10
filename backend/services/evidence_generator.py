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
    metric_execution_result: dict | None = None


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
    if request.metric_execution_result:
        return _generate_metric_execution_evidence(request)

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


def _generate_metric_execution_evidence(request: EvidenceRequest) -> EvidenceResponse:
    metric_result = request.metric_execution_result or {}
    overall = metric_result.get("overall_metric_comparison", {})
    top_movers = metric_result.get("top_movers", [])
    auxiliary_comparisons = metric_result.get("auxiliary_metric_comparisons", [])
    warnings = metric_result.get("warnings", [])
    baseline = overall.get("baseline", {})
    current = overall.get("current", {})
    baseline_label = overall.get("baseline_label", "上周")
    current_label = overall.get("current_label", "本周")
    metric_name = overall.get("metric_name", "当前指标")
    top_mover_text = _top_mover_summary(top_movers)

    evidence_chains = [
        EvidenceChain(
            id="metric_overall_change",
            title="整体指标变化已经直接计算",
            finding=(
                f"{metric_name}从 {baseline_label}的 {_format_rate(baseline.get('rate'))} "
                f"变化到 {current_label}的 {_format_rate(current.get('rate'))}，"
                f"变化 {_format_delta_rate(overall.get('delta_rate'))}。"
            ),
            evidence=[
                f"{baseline_label}分母：{_format_number(baseline.get('denominator'))}，分子：{_format_number(baseline.get('numerator'))}，指标率：{_format_rate(baseline.get('rate'))}。",
                f"{current_label}分母：{_format_number(current.get('denominator'))}，分子：{_format_number(current.get('numerator'))}，指标率：{_format_rate(current.get('rate'))}。",
                f"变化百分点：{_format_delta_rate(overall.get('delta_rate'))}。",
            ],
            related_table_ids=["metric_spec_execution"],
            related_chart="指标计算结果",
            confidence_level="高",
            suggested_next_check="继续检查高异动分组是否集中在特定业务环节，并补充过程字段验证原因。",
        ),
        EvidenceChain(
            id="metric_numerator_denominator_change",
            title="分子分母变化解释了指标直接变化",
            finding=(
                f"总量从 {_format_number(baseline.get('denominator'))} 变为 "
                f"{_format_number(current.get('denominator'))}，分子从 "
                f"{_format_number(baseline.get('numerator'))} 变为 "
                f"{_format_number(current.get('numerator'))}。"
            ),
            evidence=[
                f"分母变化：{_format_number(baseline.get('denominator'))} → {_format_number(current.get('denominator'))}，变化 {_format_signed_number(overall.get('delta_denominator'))}。",
                f"分子变化：{_format_number(baseline.get('numerator'))} → {_format_number(current.get('numerator'))}，变化 {_format_signed_number(overall.get('delta_numerator'))}。",
                "当前数据支持先把指标变化拆成分子和分母变化，再继续排查分子变化背后的结构性来源。",
            ],
            related_table_ids=["metric_spec_execution"],
            related_chart="指标计算结果",
            confidence_level="高",
            suggested_next_check="优先确认分子口径字段是否稳定，并检查分子增加是否集中在少数维度组合。",
        ),
    ]

    if top_movers:
        evidence_chains.append(
            EvidenceChain(
                id="metric_top_movers",
                title="Top 异动分组显示结构性异常",
                finding=f"当前高异动分组包括：{top_mover_text}。",
                evidence=[
                    _format_mover_evidence(item)
                    for item in top_movers[:5]
                ],
                related_table_ids=["metric_spec_execution"],
                related_chart="Top 异动分组",
                confidence_level="高",
                suggested_next_check="围绕这些高异动分组做交叉验证，例如承运商、仓库区域、包裹大小、服务等级和天气的组合拆解。",
            )
        )

    if auxiliary_comparisons:
        prioritized_auxiliary = _prioritized_auxiliary(auxiliary_comparisons)
        evidence_chains.append(
            EvidenceChain(
                id="metric_auxiliary_comparison",
                title="辅助指标变化可作为补充观察",
                finding=_auxiliary_finding(prioritized_auxiliary, overall),
                evidence=[
                    _format_auxiliary_evidence(item)
                    for item in prioritized_auxiliary[:5]
                ],
                related_table_ids=["metric_spec_execution"],
                related_chart="辅助指标对比",
                confidence_level="中",
                suggested_next_check="将辅助指标变化与主指标变化幅度对照，继续从地图、队列、服务器、攻防方等结构维度排查。",
            )
        )

    limitations = [
        "当前结果说明相关性和结构性异常，不代表最终因果结论。",
        "如果要确认根因，还需要仓库出库时效、承运商运力、天气强度、路况 / 节点时效等过程字段。",
    ]
    limitations.extend(str(item) for item in warnings if str(item).strip())

    return EvidenceResponse(
        summary=(
            f"系统已优先使用指标计算结果生成证据链。{metric_name}"
            f"从 {_format_rate(baseline.get('rate'))} 变化到 "
            f"{_format_rate(current.get('rate'))}，变化 "
            f"{_format_delta_rate(overall.get('delta_rate'))}。"
        ),
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


def _top_mover_summary(top_movers: list[dict]) -> str:
    labels = [
        f"{item.get('dimension_label', item.get('dimension_field', '维度'))}={item.get('value', '未知')}（{_format_delta_rate(item.get('delta_rate'))}）"
        for item in top_movers[:5]
    ]
    return "、".join(labels) if labels else "暂无明显高异动分组"


def _auxiliary_summary(auxiliary_comparisons: list[dict]) -> str:
    labels = [
        f"{item.get('label', item.get('field', '辅助指标'))} "
        f"{_format_number(item.get('baseline_avg'))} → {_format_number(item.get('current_avg'))}"
        for item in auxiliary_comparisons[:5]
    ]
    return "、".join(labels) if labels else "暂无辅助指标均值对比"


def _auxiliary_finding(auxiliary_comparisons: list[dict], overall: dict) -> str:
    acs_item = _find_auxiliary_by_keywords(auxiliary_comparisons, ["acs"])
    if acs_item:
        return (
            f"ACS 从 {_format_number(acs_item.get('baseline_avg'))} 下降到 "
            f"{_format_number(acs_item.get('current_avg'))}，"
            f"变化 {_format_signed_number(acs_item.get('delta_avg'))}；"
            f"相比主指标变化 {_format_delta_rate(overall.get('delta_rate'))}，"
            "表现指标变化幅度相对较小，后续应继续从地图、排队类型、服务器地区、攻防方等结构维度排查。"
        )
    return f"当前已计算辅助指标均值对比：{_auxiliary_summary(auxiliary_comparisons)}。"


def _prioritized_auxiliary(auxiliary_comparisons: list[dict]) -> list[dict]:
    priority_keywords = ["acs", "adr", "k/d", "kd", "死亡", "deaths"]
    return sorted(
        auxiliary_comparisons,
        key=lambda item: _auxiliary_priority(item, priority_keywords),
    )


def _auxiliary_priority(item: dict, priority_keywords: list[str]) -> int:
    text = f"{item.get('field', '')} {item.get('label', '')}".lower()
    for index, keyword in enumerate(priority_keywords):
        if keyword.lower() in text:
            return index
    return len(priority_keywords)


def _find_auxiliary_by_keywords(auxiliary_comparisons: list[dict], keywords: list[str]) -> dict | None:
    for item in auxiliary_comparisons:
        text = f"{item.get('field', '')} {item.get('label', '')}".lower()
        if any(keyword.lower() in text for keyword in keywords):
            return item
    return None


def _format_auxiliary_evidence(item: dict) -> str:
    return (
        f"{item.get('label', item.get('field', '辅助指标'))}："
        f"{_format_number(item.get('baseline_avg'))} → "
        f"{_format_number(item.get('current_avg'))}，"
        f"变化 {_format_signed_number(item.get('delta_avg'))}，"
        f"变化比例 {_format_pct(item.get('delta_pct'))}。"
    )


def _format_mover_evidence(item: dict) -> str:
    return (
        f"{item.get('dimension_label', item.get('dimension_field', '维度'))}："
        f"{item.get('value', '未知')}，"
        f"{_format_rate(item.get('baseline_rate'))} → {_format_rate(item.get('current_rate'))}，"
        f"变化 {_format_delta_rate(item.get('delta_rate'))}，"
        f"当前分母 {_format_number(item.get('current_denominator'))}，"
        f"当前分子 {_format_number(item.get('current_numerator'))}。"
    )


def _format_rate(value) -> str:
    if value is None:
        return "无法计算"
    try:
        return f"{float(value):.2f}%"
    except (TypeError, ValueError):
        return "无法计算"


def _format_delta_rate(value) -> str:
    if value is None:
        return "无法计算"
    try:
        number = float(value)
    except (TypeError, ValueError):
        return "无法计算"
    sign = "+" if number > 0 else ""
    return f"{sign}{number:.2f}pp"


def _format_number(value) -> str:
    if value is None:
        return "0"
    try:
        number = float(value)
    except (TypeError, ValueError):
        return str(value)
    return str(int(number)) if number.is_integer() else f"{number:.2f}"


def _format_pct(value) -> str:
    if value is None:
        return "无法计算"
    try:
        number = float(value)
    except (TypeError, ValueError):
        return "无法计算"
    sign = "+" if number > 0 else ""
    return f"{sign}{number:.2f}%"


def _format_signed_number(value) -> str:
    if value is None:
        return "0"
    try:
        number = float(value)
    except (TypeError, ValueError):
        return str(value)
    sign = "+" if number > 0 else ""
    text = str(int(number)) if number.is_integer() else f"{number:.2f}"
    return f"{sign}{text}"


def _deduplicate(values: list[str]) -> list[str]:
    result = []
    seen = set()

    for value in values:
        if value and value not in seen:
            seen.add(value)
            result.append(value)

    return result
