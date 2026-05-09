import { generateMetricDefinitions } from "@/lib/metric-definition";

export type ReadinessStage =
  | "问题识别"
  | "指标口径"
  | "对比周期"
  | "分析维度"
  | "数据准备";

export type ClarificationState = {
  businessProblem: string;
  metricDefinition: string | null;
  comparisonPeriod: string | null;
  dimensions: string[];
  changeFactors: string[];
  customMetricDefinition?: string;
  customComparisonPeriod?: string;
  customDimensions?: string[];
};

export type ReadinessState = {
  progress: number;
  current_stage: ReadinessStage;
  status_text: string;
  confirmed_info: string[];
  missing_info: string[];
  next_question: string;
};

export const initialClarificationState: ClarificationState = {
  businessProblem: "",
  metricDefinition: null,
  comparisonPeriod: null,
  dimensions: [],
  changeFactors: [],
  customMetricDefinition: "",
  customComparisonPeriod: "",
  customDimensions: [],
};

export const initialReadiness: ReadinessState = {
  progress: 20,
  current_stage: "问题识别",
  status_text: "请先描述你遇到的指标问题，系统会从业务问题开始澄清。",
  confirmed_info: ["分析目标：待确认"],
  missing_info: [
    "分析目标",
    "指标口径",
    "对比周期",
    "分析维度",
    "近期变化因素",
    "数据需求",
  ],
  next_question: "请用一句话描述你遇到的指标问题。",
};

export function evaluateReadinessLocally(
  state: ClarificationState,
): ReadinessState {
  const hasBusinessProblem = state.businessProblem.trim().length > 0;

  if (!hasBusinessProblem) {
    return initialReadiness;
  }

  const metricDefinitionResult = generateMetricDefinitions(state.businessProblem);
  const confirmedInfo = [`分析目标：${metricDefinitionResult.analysisTarget}`];
  const metricDefinition = state.metricDefinition?.trim();
  const comparisonPeriod = state.comparisonPeriod?.trim();
  const dimensions = state.dimensions.filter(Boolean);
  const changeFactors = state.changeFactors.filter(Boolean);

  if (!metricDefinition) {
    return {
      progress: 40,
      current_stage: "指标口径",
      status_text: "已识别到一个指标异动分析任务，正在确认指标口径。",
      confirmed_info: confirmedInfo,
      missing_info: [
        "指标口径",
        "对比周期",
        "分析维度",
        "近期变化因素",
        "数据需求",
      ],
      next_question: metricDefinitionResult.metricName
        ? `请先确认${metricDefinitionResult.metricName}的业务口径。`
        : "请先确认这个业务指标的口径。",
    };
  }

  confirmedInfo.push(`指标口径：${metricDefinition}`);

  if (!comparisonPeriod) {
    return {
      progress: 55,
      current_stage: "对比周期",
      status_text: "指标口径已确认，下一步需要确认本次异动的对比周期。",
      confirmed_info: confirmedInfo,
      missing_info: ["对比周期", "分析维度", "近期变化因素", "数据需求"],
      next_question: "这次指标异动是和哪个时间段相比？",
    };
  }

  confirmedInfo.push(`对比周期：${comparisonPeriod}`);

  if (dimensions.length === 0) {
    return {
      progress: 70,
      current_stage: "分析维度",
      status_text: "对比周期已确认，下一步需要选择优先拆解的分析维度。",
      confirmed_info: confirmedInfo,
      missing_info: ["分析维度", "近期变化因素", "数据需求"],
      next_question: "你希望优先从哪些维度拆解这次指标异动？",
    };
  }

  confirmedInfo.push(`优先拆解维度：${dimensions.join("、")}`);

  if (changeFactors.length === 0) {
    return {
      progress: 82,
      current_stage: "分析维度",
      status_text:
        "分析维度已确认，下一步需要确认近期是否存在可能影响指标的业务变化。",
      confirmed_info: confirmedInfo,
      missing_info: ["近期变化因素", "数据需求"],
      next_question: "这段时间是否存在活动、投放、版本更新或 A/B 实验等变化？",
    };
  }

  confirmedInfo.push(`近期变化因素：${changeFactors.join("、")}`);

  return {
    progress: 100,
    current_stage: "数据准备",
    status_text: "业务问题已基本澄清，可以准备上传数据进行验证。",
    confirmed_info: confirmedInfo,
    missing_info: ["数据需求"],
    next_question:
      "请在下一阶段上传相关数据，系统将根据字段判断当前能分析到哪一步。",
  };
}

export async function evaluateReadiness(
  state: ClarificationState,
): Promise<ReadinessState> {
  const apiBaseUrl =
    process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:8000";

  try {
    const response = await fetch(`${apiBaseUrl}/api/readiness/evaluate`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(toBackendPayload(state)),
    });

    if (!response.ok) {
      throw new Error("后端暂时无法完成分析就绪评估。");
    }

    return (await response.json()) as ReadinessState;
  } catch {
    return evaluateReadinessLocally(state);
  }
}

function toBackendPayload(state: ClarificationState) {
  return {
    business_problem: state.businessProblem,
    analysis_target: generateMetricDefinitions(state.businessProblem)
      .analysisTarget,
    metric_definition: state.metricDefinition,
    comparison_period: state.comparisonPeriod,
    dimensions: state.dimensions,
    change_factors: state.changeFactors,
    custom_metric_definition: state.customMetricDefinition,
    custom_comparison_period: state.customComparisonPeriod,
    custom_dimensions: state.customDimensions,
  };
}
