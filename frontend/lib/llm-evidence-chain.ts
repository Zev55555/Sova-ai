import type { EvidenceInput, EvidenceResult } from "@/lib/evidence-chain";
import type { LlmSettings } from "@/lib/llm-settings";

export type LlmEvidenceResult = EvidenceResult & {
  source: "llm" | "fallback";
  fallback_reason: string | null;
};

export async function generateEvidenceChainWithLlm(
  input: EvidenceInput,
  settings: LlmSettings,
): Promise<LlmEvidenceResult> {
  const apiBaseUrl =
    process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:8000";

  const response = await fetch(`${apiBaseUrl}/api/llm/evidence`, {
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
        : "LLM 证据链接口调用失败";
    throw new Error(detail);
  }

  return (await response.json()) as LlmEvidenceResult;
}
