import type { AnalysisExecutionResult } from "@/lib/analysis-execution";
import type { AnalysisPlan } from "@/lib/analysis-plan";
import type { EvidenceResult } from "@/lib/evidence-chain";
import type { MetricSpecExecutionResult } from "@/lib/metric-spec-execution";

export type ReportSection = {
  heading: string;
  content: string;
};

export type ReportDraft = {
  title: string;
  sections: ReportSection[];
  disclaimer: string;
};

export type ReportDraftInput = {
  businessProblem: string;
  metricDefinition: string | null;
  comparisonPeriod: string | null;
  dimensions: string[];
  changeFactors: string[];
  analysisPlan: AnalysisPlan;
  executionResult: AnalysisExecutionResult | null;
  metricExecutionResult?: MetricSpecExecutionResult | null;
  evidenceResult: EvidenceResult;
};

export async function generateReportDraft(
  input: ReportDraftInput,
): Promise<ReportDraft> {
  const apiBaseUrl =
    process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:8000";

  const response = await fetch(`${apiBaseUrl}/api/analysis/report`, {
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
      execution_result: input.executionResult ?? {},
      metric_execution_result: input.metricExecutionResult ?? null,
      evidence_result: input.evidenceResult,
    }),
  });

  if (!response.ok) {
    throw new Error("报告草稿生成失败，请稍后重试或检查证据链。");
  }

  return (await response.json()) as ReportDraft;
}

export function formatReportDraft(reportDraft: ReportDraft) {
  return [
    reportDraft.title,
    "",
    ...reportDraft.sections.flatMap((section) => [
      section.heading,
      section.content,
      "",
    ]),
    "报告说明",
    reportDraft.disclaimer,
  ].join("\n");
}
