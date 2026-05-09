import type { AnalysisExecutionResult } from "@/lib/analysis-execution";
import type { AnalysisPlan } from "@/lib/analysis-plan";

export type ConfidenceLevel = "高" | "中" | "低";

export type EvidenceChain = {
  id: string;
  title: string;
  finding: string;
  evidence: string[];
  related_table_ids: string[];
  related_chart: string | null;
  confidence_level: ConfidenceLevel;
  suggested_next_check: string;
};

export type EvidenceResult = {
  summary: string;
  evidence_chains: EvidenceChain[];
  limitations: string[];
};

export type EvidenceInput = {
  businessProblem: string;
  metricDefinition: string | null;
  comparisonPeriod: string | null;
  dimensions: string[];
  changeFactors: string[];
  analysisPlan: AnalysisPlan;
  executionResult: AnalysisExecutionResult;
};

export async function generateEvidenceChain(
  input: EvidenceInput,
): Promise<EvidenceResult> {
  const apiBaseUrl =
    process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:8000";

  const response = await fetch(`${apiBaseUrl}/api/analysis/evidence`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      business_problem: input.businessProblem,
      metric_definition: input.metricDefinition,
      comparison_period: input.comparisonPeriod,
      dimensions: input.dimensions,
      change_factors: input.changeFactors,
      analysis_plan: input.analysisPlan,
      execution_result: input.executionResult,
    }),
  });

  if (!response.ok) {
    throw new Error("证据链生成失败，请稍后重试或检查分析结果。");
  }

  return (await response.json()) as EvidenceResult;
}
