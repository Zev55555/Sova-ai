import {
  generateMetricDefinitions,
  type MetricDefinitionCard,
  type MetricDefinitionResult,
} from "@/lib/metric-definition";
import type { LlmSettings } from "@/lib/llm-settings";

type LlmMetricDefinitionResponse = {
  source: "llm" | "fallback";
  metric_name: string;
  metric_type: string;
  detected_scenario: string;
  cards: MetricDefinitionCard[];
  fallback_reason: string | null;
};

export type MetricDefinitionGenerationResult = {
  result: MetricDefinitionResult;
  source: "llm" | "fallback";
  fallbackReason: string | null;
};

const fixedCustomMetricCard: MetricDefinitionCard = {
  id: "custom",
  title: "自定义口径",
  definition: "以上都不是，手动补充",
  description: "适合填写公司内部或业务团队自定义的指标口径。",
};

export async function generateMetricDefinitionsWithLlm(
  businessProblem: string,
  settings: LlmSettings,
): Promise<MetricDefinitionGenerationResult> {
  const apiBaseUrl =
    process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:8000";

  const response = await fetch(`${apiBaseUrl}/api/llm/metric-definitions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      business_problem: businessProblem,
      provider: settings.provider,
      api_key: settings.apiKey,
      base_url: settings.baseUrl,
      model: settings.model,
    }),
  });

  if (!response.ok) {
    throw new Error("AI 口径生成失败");
  }

  const payload = (await response.json()) as LlmMetricDefinitionResponse;
  return {
    result: buildMetricDefinitionResult(businessProblem, payload),
    source: payload.source,
    fallbackReason: payload.fallback_reason,
  };
}

function buildMetricDefinitionResult(
  businessProblem: string,
  payload: LlmMetricDefinitionResponse,
): MetricDefinitionResult {
  const localFallback = generateMetricDefinitions(businessProblem);
  const metricName = payload.metric_name?.trim() || localFallback.metricName;
  const metricType = payload.metric_type?.trim() || localFallback.metricType;
  const detectedScenario =
    payload.detected_scenario?.trim() || localFallback.detectedScenario;

  return {
    metricName,
    metricType,
    detectedScenario,
    summaryText: metricName
      ? `你想分析“${metricName}”指标异动的可能原因。`
      : localFallback.summaryText,
    analysisTarget: metricName
      ? `${metricName}指标异动归因`
      : localFallback.analysisTarget,
    dataRequirements: localFallback.dataRequirements,
    cards: normalizeCards(payload.cards, localFallback.cards),
  };
}

function normalizeCards(
  cards: MetricDefinitionCard[],
  fallbackCards: MetricDefinitionCard[],
) {
  const candidateCards = cards.filter((card) => card.id !== "custom").slice(0, 3);

  if (candidateCards.length !== 3) {
    return fallbackCards;
  }

  return [
    ...candidateCards.map((card, index) => ({
      id: card.id || `card_${index + 1}`,
      title: card.title,
      definition: card.definition,
      description: card.description,
    })),
    fixedCustomMetricCard,
  ];
}
