import type { AnalysisPlan } from "@/lib/analysis-plan";

export type ExecutionResultTable = {
  id: string;
  title: string;
  description: string;
  columns: string[];
  rows: Record<string, unknown>[];
};

export type AnalysisExecutionResult = {
  execution_summary: string;
  tables: ExecutionResultTable[];
  analysis_notes: string[];
  limitations: string[];
};

export type ExecuteAnalysisInput = {
  uploadId: string;
  analysisPlan: AnalysisPlan;
  businessProblem: string;
  metricDefinition: string | null;
  comparisonPeriod: string | null;
  dimensions: string[];
  changeFactors: string[];
};

export async function executeBasicAnalysis(
  input: ExecuteAnalysisInput,
): Promise<AnalysisExecutionResult> {
  const apiBaseUrl =
    process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:8000";

  const response = await fetch(`${apiBaseUrl}/api/analysis/execute`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      upload_id: input.uploadId,
      analysis_plan: input.analysisPlan,
      business_problem: input.businessProblem,
      metric_definition: input.metricDefinition,
      comparison_period: input.comparisonPeriod,
      dimensions: input.dimensions,
      change_factors: input.changeFactors,
    }),
  });

  if (!response.ok) {
    const errorPayload = await response.json().catch(() => null);
    const detail =
      typeof errorPayload?.detail === "string"
        ? errorPayload.detail
        : "基础分析执行失败，请稍后重试或检查上传数据。";
    throw new Error(detail);
  }

  return (await response.json()) as AnalysisExecutionResult;
}
