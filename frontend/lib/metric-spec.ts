import type { AnalysisPlan } from "@/lib/analysis-plan";
import type { SemanticContext, UploadResponse } from "@/lib/data-upload";

export type MetricSpecConfidence = "high" | "medium" | "low";

export type MetricSpecField = {
  field: string;
  aggregation?: string;
  positive_value?: number;
  label: string;
  confidence?: MetricSpecConfidence;
  role?: string;
};

export type MetricSpecDimension = {
  field: string;
  label: string;
  role: "breakdown";
  confidence: MetricSpecConfidence;
};

export type MetricSpec = {
  metric_name: string;
  metric_formula: string;
  period_field: string;
  time_field: string;
  comparison: {
    current_label: string;
    baseline_label: string;
  };
  numerator: MetricSpecField;
  denominator: MetricSpecField;
  rate: {
    unit: string;
    calculation: string;
  };
  dimensions: MetricSpecDimension[];
  auxiliary_fields: MetricSpecField[];
  limitations: string[];
  source: string;
  confidence: MetricSpecConfidence;
};

export type MetricSpecResponse = {
  metric_spec: MetricSpec;
  source: string;
  warnings: string[];
  limitations: string[];
};

export type MetricSpecInput = {
  businessProblem: string;
  metricDefinition: string | null;
  semanticContext: SemanticContext | undefined;
  analysisPlan: AnalysisPlan;
  uploadSchema: UploadResponse;
};

export async function buildMetricSpec(
  input: MetricSpecInput,
): Promise<MetricSpecResponse> {
  const apiBaseUrl =
    process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:8000";

  const response = await fetch(`${apiBaseUrl}/api/metric-spec/build`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      business_problem: input.businessProblem,
      metric_definition: input.metricDefinition,
      semantic_context: input.semanticContext,
      analysis_plan: input.analysisPlan,
      upload_schema: input.uploadSchema,
    }),
  });

  if (!response.ok) {
    throw new Error("指标计算规格生成失败，请稍后重试。");
  }

  return (await response.json()) as MetricSpecResponse;
}
