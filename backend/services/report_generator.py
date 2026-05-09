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
    evidence_result: dict = Field(default_factory=dict)


class ReportSection(BaseModel):
    heading: str
    content: str


class ReportResponse(BaseModel):
    title: str
    sections: list[ReportSection]
    disclaimer: str


TABLE_DIRECTION_MAP = {
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
