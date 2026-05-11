export type AsyncTaskStatus = "idle" | "running" | "success" | "error";

export type AsyncTaskId =
  | "upload_data"
  | "analysis_plan"
  | "metric_calculation"
  | "evidence_chain"
  | "report_draft";

export type AsyncTaskFeedback = {
  taskId: AsyncTaskId;
  status: AsyncTaskStatus;
  startedAt: number;
  finishedAt?: number;
  errorMessage?: string;
};

export type AsyncTaskDefinition = {
  id: AsyncTaskId;
  title: string;
  runningTitle: string;
  successTitle: string;
  steps: string[];
};

export const asyncTaskDefinitions: Record<AsyncTaskId, AsyncTaskDefinition> = {
  upload_data: {
    id: "upload_data",
    title: "上传数据",
    runningTitle: "正在上传并识别数据",
    successTitle: "数据上传完成",
    steps: [
      "正在读取上传文件",
      "正在识别字段结构",
      "正在匹配业务语义",
      "正在整理可分析范围",
    ],
  },
  analysis_plan: {
    id: "analysis_plan",
    title: "生成分析计划",
    runningTitle: "正在生成分析计划",
    successTitle: "分析计划已生成",
    steps: [
      "正在识别业务目标",
      "正在匹配字段语义",
      "正在检查指标口径",
      "正在生成分析步骤",
    ],
  },
  metric_calculation: {
    id: "metric_calculation",
    title: "执行指标计算",
    runningTitle: "正在执行指标计算",
    successTitle: "指标计算完成",
    steps: [
      "正在读取上传数据",
      "正在构建指标计算规格",
      "正在计算本周 vs 上周",
      "正在生成维度拆解",
      "正在识别 Top movers",
    ],
  },
  evidence_chain: {
    id: "evidence_chain",
    title: "生成证据链",
    runningTitle: "正在生成证据链",
    successTitle: "证据链已生成",
    steps: [
      "正在整理核心指标变化",
      "正在提取高异动分组",
      "正在组织数据证据",
      "正在生成下一步验证建议",
    ],
  },
  report_draft: {
    id: "report_draft",
    title: "生成报告草稿",
    runningTitle: "正在生成报告草稿",
    successTitle: "报告草稿已生成",
    steps: [
      "正在整理分析背景",
      "正在写入指标变化",
      "正在整合证据链",
      "正在生成建议与限制说明",
    ],
  },
};

export function getAsyncTaskStepIndex(
  feedback: AsyncTaskFeedback,
  now: number,
) {
  const definition = asyncTaskDefinitions[feedback.taskId];

  if (feedback.status === "success") {
    return definition.steps.length - 1;
  }

  if (feedback.status === "error") {
    return Math.max(0, Math.min(definition.steps.length - 1, 0));
  }

  const elapsed = Math.max(0, now - feedback.startedAt);
  const stepDuration = 1400;

  return Math.min(
    definition.steps.length - 1,
    Math.floor(elapsed / stepDuration),
  );
}
