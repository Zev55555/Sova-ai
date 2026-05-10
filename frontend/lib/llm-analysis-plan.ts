import type { AnalysisPlan, AnalysisPlanInput } from "@/lib/analysis-plan";
import type { LlmSettings } from "@/lib/llm-settings";

export type LlmAnalysisPlan = AnalysisPlan & {
  source: "llm" | "fallback";
  fallback_reason: string | null;
};

export async function generateAnalysisPlanWithLlm(
  input: AnalysisPlanInput,
  settings: LlmSettings,
): Promise<LlmAnalysisPlan> {
  const apiBaseUrl =
    process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:8000";

  const response = await fetch(`${apiBaseUrl}/api/llm/analysis-plan`, {
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
      supported_analysis: input.uploadedSchema.supported_analysis,
      missing_requirements: input.uploadedSchema.missing_requirements,
      provider: settings.provider,
      api_key: settings.apiKey,
      base_url: settings.baseUrl,
      model: settings.model,
    }),
  });

  if (!response.ok) {
    const errorPayload = await response.json().catch(() => null);
    const detail =
      typeof errorPayload?.detail === "string"
        ? errorPayload.detail
        : "LLM 分析计划接口调用失败";
    throw new Error(detail);
  }

  return (await response.json()) as LlmAnalysisPlan;
}
