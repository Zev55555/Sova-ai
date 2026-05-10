from pydantic import BaseModel, Field


class ReadinessRequest(BaseModel):
    business_problem: str = ""
    analysis_target: str | None = None
    metric_definition: str | None = None
    comparison_period: str | None = None
    dimensions: list[str] = Field(default_factory=list)
    change_factors: list[str] = Field(default_factory=list)
    custom_metric_definition: str | None = None
    custom_comparison_period: str | None = None
    custom_dimensions: list[str] = Field(default_factory=list)

    # Backward compatibility with the Stage 1 frontend payload.
    selected_metric_definition: str | None = None


class ReadinessResponse(BaseModel):
    progress: int
    current_stage: str
    status_text: str
    confirmed_info: list[str]
    missing_info: list[str]
    next_question: str


def evaluate_readiness(request: ReadinessRequest) -> ReadinessResponse:
    business_problem = request.business_problem.strip()
    metric_definition = _first_non_empty(
        request.metric_definition,
        request.selected_metric_definition,
        request.custom_metric_definition,
    )
    comparison_period = _first_non_empty(
        request.comparison_period,
        request.custom_comparison_period,
    )
    dimensions = _clean_list(request.dimensions)
    change_factors = _clean_list(request.change_factors)
    analysis_target = _first_non_empty(
        request.analysis_target,
        _detect_analysis_target(business_problem),
    )
    metric_name = _detect_metric_name(business_problem)

    if not business_problem:
        return ReadinessResponse(
            progress=20,
            current_stage="问题识别",
            status_text="请先描述你遇到的指标问题，系统会从业务问题开始澄清。",
            confirmed_info=["分析目标：待确认"],
            missing_info=[
                "分析目标",
                "指标口径",
                "对比周期",
                "分析维度",
                "近期变化因素",
                "数据需求",
            ],
            next_question="请用一句话描述你遇到的指标问题。",
        )

    confirmed_info = [f"分析目标：{analysis_target}"]

    if not metric_definition:
        return ReadinessResponse(
            progress=40,
            current_stage="指标口径",
            status_text="已识别到一个指标异动分析任务，正在确认指标口径。",
            confirmed_info=confirmed_info,
            missing_info=[
                "指标口径",
                "对比周期",
                "分析维度",
                "近期变化因素",
                "数据需求",
            ],
            next_question=(
                f"请先确认{metric_name}的业务口径。"
                if metric_name
                else "请先确认这个业务指标的口径。"
            ),
        )

    confirmed_info.append(f"指标口径：{metric_definition}")

    if not comparison_period:
        return ReadinessResponse(
            progress=55,
            current_stage="对比周期",
            status_text="指标口径已确认，下一步需要确认本次异动的对比周期。",
            confirmed_info=confirmed_info,
            missing_info=["对比周期", "分析维度", "近期变化因素", "数据需求"],
            next_question="这次指标异动是和哪个时间段相比？",
        )

    confirmed_info.append(f"对比周期：{comparison_period}")

    if not dimensions:
        return ReadinessResponse(
            progress=70,
            current_stage="分析维度",
            status_text="对比周期已确认，下一步需要选择优先拆解的分析维度。",
            confirmed_info=confirmed_info,
            missing_info=["分析维度", "近期变化因素", "数据需求"],
            next_question="你希望优先从哪些维度拆解这次指标异动？",
        )

    confirmed_info.append(f"优先拆解维度：{'、'.join(dimensions)}")

    if not change_factors:
        return ReadinessResponse(
            progress=82,
            current_stage="分析维度",
            status_text="分析维度已确认，下一步需要确认近期是否存在可能影响指标的业务变化。",
            confirmed_info=confirmed_info,
            missing_info=["近期变化因素", "数据需求"],
            next_question="这段时间是否存在你认为可能影响指标的业务、产品、环境或外部变化？",
        )

    confirmed_info.append(f"近期变化因素：{'、'.join(change_factors)}")

    return ReadinessResponse(
        progress=100,
        current_stage="数据准备",
        status_text="业务问题已基本澄清，可以准备上传数据进行验证。",
        confirmed_info=confirmed_info,
        missing_info=["数据需求"],
        next_question="请在下一阶段上传相关数据，系统将根据字段判断当前能分析到哪一步。",
    )


def _first_non_empty(*values: str | None) -> str:
    for value in values:
        if value and value.strip():
            return value.strip()
    return ""


def _clean_list(values: list[str]) -> list[str]:
    return [value.strip() for value in values if value and value.strip()]


def _detect_analysis_target(business_problem: str) -> str:
    text = business_problem.lower()

    if "优惠券" in text or "核销率" in text:
        return "优惠券核销率下降归因"
    if "dau" in text or "活跃" in text:
        return "活跃用户指标异动归因"
    if "转化率" in text:
        return "转化率下降归因"
    if "gmv" in text or "销售额" in text:
        return "GMV / 销售额异动归因"
    if "留存" in text:
        return "留存率异动归因"
    if "退款" in text:
        return "退款率异动归因"

    return "业务指标异动归因"


def _detect_metric_name(business_problem: str) -> str:
    text = business_problem.lower()

    if "优惠券" in text or "核销率" in text:
        return "优惠券核销率"
    if "dau" in text or "活跃" in text:
        return "活跃用户"
    if "转化率" in text:
        return "转化率"
    if "gmv" in text or "销售额" in text:
        return "GMV / 销售额"
    if "留存" in text:
        return "留存率"
    if "退款" in text:
        return "退款率"

    return ""
