import type { UploadResponse } from "@/lib/data-upload";

export type FieldMappingStatus = "matched" | "missing" | "partial";

export type AnalysisStepStatus = "ready" | "partial" | "blocked";

export type FieldMapping = {
  analysis_need: string;
  matched_field: string | null;
  status: FieldMappingStatus;
  note: string;
};

export type AnalysisStep = {
  step: number;
  title: string;
  description: string;
  required_fields: string[];
  status: AnalysisStepStatus;
};

export type AnalysisPlan = {
  analysis_goal: string;
  metric_summary: {
    metric_definition: string;
    comparison_period: string;
    dimensions?: string[];
    change_factors?: string[];
  };
  field_mapping: FieldMapping[];
  analysis_steps: AnalysisStep[];
  analysis_limitations: string[];
  next_action: string;
};

export type AnalysisPlanInput = {
  businessProblem: string;
  metricDefinition: string | null;
  comparisonPeriod: string | null;
  dimensions: string[];
  changeFactors: string[];
  uploadedSchema: UploadResponse;
};

export async function generateAnalysisPlan(
  input: AnalysisPlanInput,
): Promise<AnalysisPlan> {
  const apiBaseUrl =
    process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:8000";

  const response = await fetch(`${apiBaseUrl}/api/analysis/plan`, {
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
      uploaded_schema: input.uploadedSchema,
    }),
  });

  if (!response.ok) {
    throw new Error("分析计划生成失败，请稍后重试或检查上传数据。");
  }

  return (await response.json()) as AnalysisPlan;
}
