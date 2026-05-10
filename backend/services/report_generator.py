from __future__ import annotations

from pydantic import BaseModel, Field


class ReportRequest(BaseModel):
    business_problem: str = ""
    metric_definition: str | None = None
    comparison_period: str | None = None
    dimensions: list[str] = Field(default_factory=list)
    change_factors: list[str] = Field(default_factory=list)
    analysis_plan: dict = Field(default_factory=dict)
    execution_result: dict = Field(default_factory=dict)
    metric_execution_result: dict | None = None
    evidence_result: dict = Field(default_factory=dict)


class ReportSection(BaseModel):
    heading: str
    content: str


class ReportResponse(BaseModel):
    title: str
    sections: list[ReportSection]
    disclaimer: str


TABLE_DIRECTION_MAP = {
    "metric_spec_execution": "指标计算结果",
    "data_overview": "数据基础概览",
    "overall_trend": "时间趋势分析",
    "user_breakdown": "用户维度拆解",
    "region_breakdown": "地区 / 城市拆解",
    "channel_breakdown": "渠道来源拆解",
    "amount_summary": "金额类指标分析",
    "coupon_summary": "优惠券相关分析",
}


def generate_report(request: ReportRequest) -> ReportResponse:
    return ReportResponse(
        title="指标异动分析报告草稿",
        sections=[
            ReportSection(heading="一、分析背景", content=_background(request)),
            ReportSection(heading="二、当前已确认信息", content=_confirmed_info(request)),
            ReportSection(heading="三、数据与字段情况", content=_data_context(request)),
            ReportSection(heading="四、初步分析发现", content=_initial_findings(request)),
            ReportSection(heading="五、证据链摘要", content=_evidence_summary(request)),
            ReportSection(heading="六、可能原因", content=_possible_reasons(request)),
            ReportSection(heading="七、当前限制", content=_limitations(request)),
            ReportSection(heading="八、建议下一步验证", content=_next_validations(request)),
        ],
        disclaimer="本报告为基于当前上传数据和规则分析生成的草稿，仅用于辅助分析，不代表最终因果结论。",
    )


def _background(request: ReportRequest) -> str:
    metric_definition = request.metric_definition or "当前指标口径仍需进一步确认"
    comparison_period = request.comparison_period or "当前对比周期仍需进一步确认"
    business_problem = request.business_problem or "用户提出了一个业务指标异动问题"

    return "\n".join(
        [
            f"本次分析围绕用户提出的业务指标异动问题展开：{business_problem}",
            "目标是初步判断该指标在指定对比周期内是否存在可检查的变化，并探索可能的维度差异。",
            f"当前使用的指标口径为：{metric_definition}。",
            f"当前确认的对比周期为：{comparison_period}。",
            "以下内容为规则版分析草稿，用于整理分析思路和后续验证方向。",
        ]
    )


def _confirmed_info(request: ReportRequest) -> str:
    analysis_goal = request.analysis_plan.get("analysis_goal") or "指标异动原因初步排查"

    return "\n".join(
        [
            f"- 分析目标：{analysis_goal}",
            f"- 指标口径：{request.metric_definition or '待进一步确认'}",
            f"- 对比周期：{request.comparison_period or '待进一步确认'}",
            f"- 优先拆解维度：{_join_or_default(request.dimensions, '暂未指定')}",
            f"- 近期变化因素：{_join_or_default(request.change_factors, '暂未确认')}",
        ]
    )


def _data_context(request: ReportRequest) -> str:
    if request.metric_execution_result:
        overall = _metric_overall(request)
        top_movers = _metric_top_movers(request)
        auxiliary = _metric_auxiliary_comparisons(request)
        auxiliary = _prioritized_auxiliary(auxiliary)
        return "\n".join(
            [
                "当前已完成指标计算规格执行，系统已直接生成本期与基准期的指标率对比、分子分母变化和维度拆解结果。",
                _metric_overall_sentence(overall),
                f"当前 Top 异动分组包括：{_join_or_default(_top_mover_labels(top_movers), '暂无明显高异动分组')}。",
                f"辅助指标对比：{_join_or_default(_auxiliary_labels(auxiliary), '暂无可用辅助指标均值对比')}。",
                "这些结果会优先用于证据链和报告草稿；旧的基础分析结果仍可作为补充背景。",
            ]
        )

    table_ids = _table_ids(request.execution_result)
    supported_directions = [
        label for table_id, label in TABLE_DIRECTION_MAP.items() if table_id in table_ids
    ]
    content = [
        "当前已上传数据并完成字段识别，系统已基于上传文件执行规则版基础分析。",
        f"当前结果表支持的分析方向包括：{_join_or_default(supported_directions, '暂未识别到可直接支持的方向')}。",
    ]

    data_overview = _find_table(request.execution_result, "data_overview")
    if data_overview:
        content.append("当前结果中包含数据基础概览，可用于查看表名、行数和字段数量。")

    limitations = _deduplicate(
        [
            *_list_from_dict(request.analysis_plan, "analysis_limitations"),
            *_list_from_dict(request.execution_result, "limitations"),
        ]
    )
    if limitations:
        content.append("以下字段或数据条件可能限制进一步分析：")
        content.extend(f"- {item}" for item in limitations[:6])
    else:
        content.append("当前规则暂未识别到明显字段缺口，后续仍建议结合业务口径继续校验字段含义。")

    return "\n".join(content)


def _initial_findings(request: ReportRequest) -> str:
    if request.metric_execution_result:
        overall = _metric_overall(request)
        baseline = overall.get("baseline", {})
        current = overall.get("current", {})
        auxiliary = _metric_auxiliary_comparisons(request)
        auxiliary = _prioritized_auxiliary(auxiliary)
        auxiliary_line = (
            _auxiliary_contrast_sentence(auxiliary, overall)
            if auxiliary
            else "当前未识别到可稳定均值对比的辅助指标。"
        )
        return "\n".join(
            [
                _metric_overall_sentence(overall),
                (
                    f"分母从 {_format_number(baseline.get('denominator'))} 变为 "
                    f"{_format_number(current.get('denominator'))}，"
                    f"分子从 {_format_number(baseline.get('numerator'))} 变为 "
                    f"{_format_number(current.get('numerator'))}。"
                ),
                auxiliary_line,
                "当前数据支持将指标异动优先拆解为分子分母变化和结构性分组变化，但这些发现仍不代表最终因果结论。",
            ]
        )

    evidence_chains = _evidence_chains(request)
    if evidence_chains:
        covered_topics = _covered_topics(evidence_chains)
        return "\n".join(
            [
                "当前系统已生成若干条初步证据链，用于把结果表和图表转化为可追踪的分析发现。",
                f"这些证据链主要覆盖：{_join_or_default(covered_topics, '趋势或维度差异')}。",
                "需要注意的是，当前发现只代表当前数据支持的分析方向，不应直接视为最终因果结论。",
            ]
        )

    table_titles = _table_titles(request.execution_result)
    return "\n".join(
        [
            "当前已完成基础结果表生成，但暂未形成足够完整的证据链。",
            f"已生成的结果表包括：{_join_or_default(table_titles, '暂无可用结果表')}。",
            "建议补充关键字段或重新执行分析后，再进一步整理发现。",
        ]
    )


def _evidence_summary(request: ReportRequest) -> str:
    evidence_chains = _evidence_chains(request)
    if not evidence_chains:
        return "当前结果暂不足以形成证据链摘要，请补充更多字段或重新执行分析。"

    lines: list[str] = []
    for chain in evidence_chains:
        related_tables = _join_or_default(
            [
                TABLE_DIRECTION_MAP.get(table_id, table_id)
                for table_id in chain.get("related_table_ids", [])
            ],
            "暂无关联结果表",
        )
        related_chart = chain.get("related_chart") or "暂无关联图表"
        lines.extend(
            [
                f"- {chain.get('title', '未命名证据')}",
                f"  初步发现：{chain.get('finding', '当前数据支持进一步检查该方向。')}",
                f"  相关结果表 / 图表：{related_tables} / {related_chart}",
                f"  下一步验证建议：{chain.get('suggested_next_check', '建议结合更多数据进一步验证。')}",
            ]
        )

    return "\n".join(lines)


def _possible_reasons(request: ReportRequest) -> str:
    if request.metric_execution_result:
        top_movers = _metric_top_movers(request)
        auxiliary = _metric_auxiliary_comparisons(request)
        auxiliary = _prioritized_auxiliary(auxiliary)
        reasons = [
            f"Top 异动分组显示：{_format_mover(item)}，建议作为后续排查优先级。"
            for item in top_movers[:5]
        ]
        reasons.extend(
            f"辅助指标显示：{_format_auxiliary(item)}，可用于判断表现类指标变化幅度是否与主指标变化同步。"
            for item in auxiliary[:3]
        )
        if not reasons:
            reasons.append("当前指标计算结果尚未识别出样本量足够的高异动分组，建议补充更细粒度维度继续观察。")
        reasons.append("这些分组只能说明当前数据中的相关性和结构性异常，不能直接作为因果结论。")
        return "\n".join(f"- {item}" for item in _deduplicate(reasons))

    reasons: list[str] = []

    for factor in request.change_factors:
        if "渠道" in factor or "投放" in factor:
            reasons.append("如果该时期确实存在渠道投放变化，则渠道结构变化可能是值得优先验证的方向之一。")
        elif "运营" in factor or "活动" in factor or "规则" in factor:
            reasons.append("如果该时期存在运营活动或规则调整，则活动节奏、权益规则或价格策略变化可能需要优先核查。")
        elif "版本" in factor or "产品" in factor:
            reasons.append("如果该时期存在产品版本更新，则入口、流程或提醒机制变化可能值得进一步检查。")
        elif "A/B" in factor or "实验" in factor:
            reasons.append("MVP 当前不做完整实验分析，但该因素应在后续验证中单独确认实验分流、实验周期和核心指标。")
        elif "暂无明显变化" in factor:
            reasons.append("当前未记录明显业务变化，建议更依赖时间、用户、渠道和业务对象等维度拆解来发现异常来源。")
        elif "不确定" in factor:
            reasons.append("当前业务变化因素尚不确定，建议后续向业务方补充确认活动、投放、版本和实验时间线。")

    for chain in _evidence_chains(request)[:3]:
        title = chain.get("title")
        if title:
            reasons.append(f"证据链中出现“{title}”，该方向可作为后续排查线索之一，但仍需结合更多数据确认。")

    if not reasons:
        reasons.append("当前数据支持进行初步拆解，但暂不支持直接判断具体原因，建议先围绕已生成证据链继续验证。")

    return "\n".join(f"- {item}" for item in _deduplicate(reasons))


def _limitations(request: ReportRequest) -> str:
    if request.metric_execution_result:
        warnings = _list_from_dict(request.metric_execution_result, "warnings")
        limitations = _deduplicate(
            [
                "当前结果说明相关性和结构性异常，不代表最终因果结论。",
                "如果要确认根因，还需要仓库出库时效、承运商运力、天气强度、路况 / 节点时效等过程字段。",
                *warnings,
            ]
        )
        return "\n".join(f"- {item}" for item in limitations)

    limitations = _deduplicate(
        [
            *_list_from_dict(request.execution_result, "limitations"),
            *_list_from_dict(request.evidence_result, "limitations"),
            *_list_from_dict(request.analysis_plan, "analysis_limitations"),
            "当前仍未接入真实 LLM，报告内容由规则版生成器整理。",
            "当前分析为规则版基础分析，暂不支持自动 SQL 生成和复杂归因判断。",
        ]
    )

    return "\n".join(f"- {item}" for item in limitations)


def _next_validations(request: ReportRequest) -> str:
    if request.metric_execution_result:
        suggestions = [
            "围绕 Top 异动分组继续做交叉验证，优先检查承运商、仓库区域、包裹大小、服务等级、天气等维度组合。",
            "补充过程字段，例如仓库出库时效、承运商运力、天气强度、路况 / 节点时效，用于验证异常是否来自履约过程。",
            "复核分子字段口径是否稳定，确认延迟标记在本周和上周是否使用同一规则。",
            "对高异动分组查看样本量和业务事件时间线，避免把样本结构变化误读为单一原因。",
        ]
        return "\n".join(f"- {item}" for item in _deduplicate(suggestions))

    suggestions = [
        "补充当前限制中提到的缺失字段，并重新生成分析计划和执行结果。",
        "对证据链中较突出的维度做更细分拆解，例如按用户分层、地区、渠道或业务对象继续下钻。",
        "对整体趋势中的异常日期或周期进行单独检查，确认是否与活动、投放或版本发布时间线重合。",
        "结合业务侧记录复核近期活动、投放、版本更新和规则调整是否与指标异动时间一致。",
    ]

    if any("A/B" in factor or "实验" in factor for factor in request.change_factors):
        suggestions.append("若存在 A/B 实验，建议补充实验组 / 对照组字段、实验周期和分流规则后单独分析。")

    if any("渠道" in dimension for dimension in request.dimensions):
        suggestions.append("针对渠道来源维度，建议进一步检查流量结构、投放预算和渠道质量变化。")

    if any("地区" in dimension or "城市" in dimension for dimension in request.dimensions):
        suggestions.append("针对地区 / 城市维度，建议检查少数地区是否贡献了主要变化，并结合本地活动或供给变化验证。")

    return "\n".join(f"- {item}" for item in _deduplicate(suggestions))


def _table_ids(execution_result: dict) -> set[str]:
    return {
        str(table.get("id"))
        for table in execution_result.get("tables", [])
        if table.get("id")
    }


def _table_titles(execution_result: dict) -> list[str]:
    return [
        str(table.get("title"))
        for table in execution_result.get("tables", [])
        if table.get("title")
    ]


def _find_table(execution_result: dict, table_id: str) -> dict | None:
    return next(
        (
            table
            for table in execution_result.get("tables", [])
            if table.get("id") == table_id
        ),
        None,
    )


def _evidence_chains(request: ReportRequest) -> list[dict]:
    chains = request.evidence_result.get("evidence_chains", [])
    return chains if isinstance(chains, list) else []


def _covered_topics(evidence_chains: list[dict]) -> list[str]:
    topics: list[str] = []
    for chain in evidence_chains:
        for table_id in chain.get("related_table_ids", []):
            label = TABLE_DIRECTION_MAP.get(table_id)
            if label:
                topics.append(label)

    return _deduplicate(topics)


def _metric_overall(request: ReportRequest) -> dict:
    metric_result = request.metric_execution_result or {}
    overall = metric_result.get("overall_metric_comparison", {})
    return overall if isinstance(overall, dict) else {}


def _metric_top_movers(request: ReportRequest) -> list[dict]:
    metric_result = request.metric_execution_result or {}
    top_movers = metric_result.get("top_movers", [])
    return top_movers if isinstance(top_movers, list) else []


def _metric_auxiliary_comparisons(request: ReportRequest) -> list[dict]:
    metric_result = request.metric_execution_result or {}
    comparisons = metric_result.get("auxiliary_metric_comparisons", [])
    return comparisons if isinstance(comparisons, list) else []


def _prioritized_auxiliary(auxiliary: list[dict]) -> list[dict]:
    priority_keywords = ["acs", "adr", "k/d", "kd", "死亡", "deaths"]
    return sorted(auxiliary, key=lambda item: _auxiliary_priority(item, priority_keywords))


def _auxiliary_priority(item: dict, priority_keywords: list[str]) -> int:
    text = f"{item.get('field', '')} {item.get('label', '')}".lower()
    for index, keyword in enumerate(priority_keywords):
        if keyword.lower() in text:
            return index
    return len(priority_keywords)


def _find_auxiliary_by_keywords(auxiliary: list[dict], keywords: list[str]) -> dict | None:
    for item in auxiliary:
        text = f"{item.get('field', '')} {item.get('label', '')}".lower()
        if any(keyword.lower() in text for keyword in keywords):
            return item
    return None


def _auxiliary_contrast_sentence(auxiliary: list[dict], overall: dict) -> str:
    acs_item = _find_auxiliary_by_keywords(auxiliary, ["acs"])
    if acs_item:
        baseline = overall.get("baseline", {})
        current = overall.get("current", {})
        return (
            f"ACS 从 {_format_number(acs_item.get('baseline_avg'))} 下降到 "
            f"{_format_number(acs_item.get('current_avg'))}，"
            f"下降约 {_format_abs_number(acs_item.get('delta_avg'))}；"
            f"相比胜率从 {_format_rate(baseline.get('rate'))} 下降到 "
            f"{_format_rate(current.get('rate'))}，ACS 的下降幅度明显较小，"
            "因此胜率下滑可能还需要从地图、排队类型、服务器地区、攻防开局等结构维度继续排查。"
        )
    return f"辅助指标方面，{_join_or_default(_auxiliary_labels(auxiliary), '暂无可用均值对比')}。"


def _metric_overall_sentence(overall: dict) -> str:
    metric_name = overall.get("metric_name", "当前指标")
    baseline_label = overall.get("baseline_label", "上周")
    current_label = overall.get("current_label", "本周")
    baseline = overall.get("baseline", {})
    current = overall.get("current", {})
    direction = _delta_direction(overall.get("delta_rate"))
    return (
        f"{current_label}{metric_name}为 {_format_rate(current.get('rate'))}，"
        f"{baseline_label}为 {_format_rate(baseline.get('rate'))}，"
        f"{direction} {_format_delta_rate(overall.get('delta_rate'))}。"
    )


def _top_mover_labels(top_movers: list[dict]) -> list[str]:
    return [_format_mover(item) for item in top_movers[:5]]


def _auxiliary_labels(auxiliary: list[dict]) -> list[str]:
    return [_format_auxiliary(item) for item in auxiliary[:5]]


def _format_auxiliary(item: dict) -> str:
    return (
        f"{item.get('label', item.get('field', '辅助指标'))} "
        f"{_format_number(item.get('baseline_avg'))} → "
        f"{_format_number(item.get('current_avg'))}，"
        f"{_format_signed_number(item.get('delta_avg'))}"
    )


def _format_mover(item: dict) -> str:
    return (
        f"{item.get('dimension_label', item.get('dimension_field', '维度'))}"
        f"={item.get('value', '未知')} "
        f"{_format_rate(item.get('baseline_rate'))} → "
        f"{_format_rate(item.get('current_rate'))}，"
        f"{_format_delta_rate(item.get('delta_rate'))}"
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
    return f"{sign}{number:.2f} 个百分点"


def _delta_direction(value) -> str:
    try:
        number = float(value)
    except (TypeError, ValueError):
        return "变化"
    if number > 0:
        return "上升"
    if number < 0:
        return "下降"
    return "持平"


def _format_number(value) -> str:
    if value is None:
        return "0"
    try:
        number = float(value)
    except (TypeError, ValueError):
        return str(value)
    return str(int(number)) if number.is_integer() else f"{number:.2f}"


def _format_signed_number(value) -> str:
    if value is None:
        return "无法计算"
    try:
        number = float(value)
    except (TypeError, ValueError):
        return str(value)
    sign = "+" if number > 0 else ""
    return f"{sign}{number:.2f}"


def _format_abs_number(value) -> str:
    if value is None:
        return "无法计算"
    try:
        number = abs(float(value))
    except (TypeError, ValueError):
        return str(value)
    return f"{number:.2f}"


def _list_from_dict(value: dict, key: str) -> list[str]:
    items = value.get(key, [])
    if not isinstance(items, list):
        return []

    return [str(item) for item in items if item]


def _join_or_default(values: list[str], default: str) -> str:
    clean_values = [value for value in values if value]
    return "、".join(clean_values) if clean_values else default


def _deduplicate(values: list[str]) -> list[str]:
    result = []
    seen = set()

    for value in values:
        if value and value not in seen:
            seen.add(value)
            result.append(value)

    return result
