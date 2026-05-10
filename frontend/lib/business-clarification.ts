import {
  generateMetricDefinitions,
  type MetricDefinitionCard,
  type MetricDefinitionResult,
} from "@/lib/metric-definition";
import type { LlmSettings } from "@/lib/llm-settings";

export type ClarificationCard = {
  id: string;
  title: string;
  definition: string;
  description: string;
};

export type BusinessClarificationResult = {
  source: "llm" | "fallback";
  businessDomain: string;
  metricName: string;
  detectedScenario: string;
  metricDefinitionResult: MetricDefinitionResult;
  dimensionCards: ClarificationCard[];
  changeFactorCards: ClarificationCard[];
  dataRequirements: string[];
  irrelevantTerms: string[];
  fallbackReason: string | null;
};

type BusinessClarificationResponse = {
  source: "llm" | "fallback";
  business_domain: string;
  metric_name: string;
  detected_scenario: string;
  metric_definition_cards: ClarificationCard[];
  dimension_cards: ClarificationCard[];
  change_factor_cards: ClarificationCard[];
  data_requirements: string[];
  irrelevant_terms: string[];
  fallback_reason: string | null;
};

const customMetricCard: ClarificationCard = {
  id: "custom",
  title: "自定义口径",
  definition: "以上都不是，手动补充",
  description: "适合填写公司内部或业务团队自定义的指标口径。",
};

const customDimensionCard: ClarificationCard = {
  id: "custom",
  title: "自定义维度",
  definition: "以上都不是，手动补充",
  description: "补充你们业务中特有的拆解维度。",
};

const noneChangeFactorCard: ClarificationCard = {
  id: "none",
  title: "暂无明显变化",
  definition: "目前没有已知的相关变化",
  description: "后续将更依赖数据拆解来发现异常来源。",
};

const unknownChangeFactorCard: ClarificationCard = {
  id: "unknown",
  title: "不确定",
  definition: "暂时不清楚是否存在相关变化",
  description: "后续报告中会标记为需要进一步向业务方确认。",
};

export async function generateBusinessClarificationWithLlm(
  businessProblem: string,
  settings: LlmSettings,
): Promise<BusinessClarificationResult> {
  const apiBaseUrl =
    process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:8000";

  const response = await fetch(`${apiBaseUrl}/api/llm/business-clarification`, {
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
    const errorPayload = await response.json().catch(() => null);
    const detail =
      typeof errorPayload?.detail === "string"
        ? errorPayload.detail
        : "AI 业务澄清接口调用失败";
    throw new Error(detail);
  }

  return buildBusinessClarificationResult(
    businessProblem,
    (await response.json()) as BusinessClarificationResponse,
  );
}

export function generateLocalBusinessClarification(
  businessProblem: string,
): BusinessClarificationResult {
  const normalized = businessProblem.trim().toLowerCase();

  if (isGameContext(normalized)) {
    return buildLocalResult({
      businessDomain: "游戏表现分析",
      metricName: normalized.includes("胜率") ? "排位胜率" : "游戏表现指标",
      detectedScenario: "游戏表现指标异动分析",
      metricType: "game_performance",
      metricCards: [
        {
          id: "metric_game_match_win_rate",
          title: "按对局胜率",
          definition: "胜利对局数 / 总对局数",
          description: "适合观察整体对局结果是否出现变化。",
        },
        {
          id: "metric_game_rank_win_rate",
          title: "按排位胜率",
          definition: "排位胜利局数 / 排位总局数",
          description: "适合只关注排位模式下的胜率波动。",
        },
        {
          id: "metric_game_recent_window",
          title: "按近期场次口径",
          definition: "指定时间窗口内胜利局数 / 指定时间窗口内总局数",
          description: "适合分析最近一段时间的表现异动。",
        },
      ],
      dimensionCards: [
        { id: "dimension_map", title: "地图", definition: "不同地图或地图池", description: "判断胜率异动是否集中在特定地图。" },
        { id: "dimension_agent", title: "英雄 / 特工", definition: "使用英雄、特工或角色定位", description: "判断是否与当前使用角色或定位变化有关。" },
        { id: "dimension_side", title: "攻防方", definition: "进攻方 / 防守方表现", description: "判断胜率变化是否集中在攻防某一侧。" },
        { id: "dimension_server", title: "服务器地区", definition: "服务器、地区或延迟环境", description: "判断网络环境或服务器差异是否影响表现。" },
        { id: "dimension_time", title: "时间粒度", definition: "按天、按周、时段或赛季阶段", description: "判断异动是否集中在特定时间段。" },
      ],
      changeFactorCards: [
        { id: "factor_patch", title: "版本更新", definition: "游戏版本、规则或机制发生变化", description: "适合确认胜率异动是否与版本发布时间重合。" },
        { id: "factor_map_pool", title: "地图池变化", definition: "地图上线、下线或地图池调整", description: "适合确认表现变化是否与地图环境变化有关。" },
        { id: "factor_balance", title: "英雄 / 特工平衡调整", definition: "角色强度、技能或装备机制调整", description: "适合确认常用角色是否受到版本影响。" },
        { id: "factor_matchmaking", title: "匹配环境变化", definition: "队友、对手、段位或组排状态发生变化", description: "适合确认近期对局环境是否有明显差异。" },
        { id: "factor_network", title: "网络延迟变化", definition: "延迟、丢包、服务器稳定性变化", description: "适合确认表现波动是否和网络环境有关。" },
      ],
      dataRequirements: [
        "对局日期或时间字段",
        "胜负结果或回合结果字段",
        "地图字段",
        "英雄 / 特工或角色定位字段",
        "攻防方字段",
        "服务器地区、延迟或网络质量字段",
        "ACS、击杀、死亡、助攻等表现字段",
      ],
      irrelevantTerms: ["优惠券", "GMV", "商品", "商家", "渠道投放", "金额类指标"],
    });
  }

  const localMetricDefinitions = generateMetricDefinitions(businessProblem);

  if (localMetricDefinitions.metricType === "refund_rate") {
    return buildLocalResult({
      businessDomain: "电商交易分析",
      metricName: "退款率",
      detectedScenario: "电商退款率异动分析",
      metricType: "refund_rate",
      metricCards: localMetricDefinitions.cards.filter((card) => card.id !== "custom"),
      dimensionCards: [
        { id: "dimension_product", title: "商品类目", definition: "商品、SKU、类目或品牌", description: "判断退款是否集中在部分商品或类目。" },
        { id: "dimension_merchant", title: "商家 / 店铺", definition: "商家、店铺或供应方", description: "判断是否由部分商家贡献了主要变化。" },
        { id: "dimension_refund_reason", title: "退款原因", definition: "售后原因、退货原因或投诉类型", description: "判断退款变化是否集中在某类售后原因。" },
        { id: "dimension_region", title: "地区 / 城市", definition: "城市、区域、省份或配送区域", description: "判断是否由特定地区贡献了退款变化。" },
        { id: "dimension_channel", title: "订单来源", definition: "渠道、活动入口或流量来源", description: "判断退款变化是否与订单来源结构有关。" },
      ],
      changeFactorCards: [
        { id: "factor_policy", title: "售后规则调整", definition: "退款政策、运费险或审核规则变化", description: "适合确认退款率变化是否与规则调整有关。" },
        { id: "factor_product_quality", title: "商品质量变化", definition: "商品质量、库存批次或供应稳定性变化", description: "适合确认退款是否与部分商品质量有关。" },
        { id: "factor_logistics", title: "物流履约变化", definition: "发货时效、配送体验或破损率变化", description: "适合确认退款是否与履约体验有关。" },
        { id: "factor_promotion", title: "促销活动变化", definition: "大促、补贴、价格策略或活动节奏变化", description: "适合确认退款是否与订单结构变化有关。" },
      ],
      dataRequirements: [
        "订单日期、支付日期或退款日期字段",
        "订单 ID、用户 ID、支付订单数和退款订单数字段",
        "支付金额和退款金额字段",
        "商品、商家、类目或品牌字段",
        "退款原因、售后状态或物流履约字段",
      ],
      irrelevantTerms: ["英雄", "地图", "攻防方", "ACS"],
    });
  }

  return buildLocalResult({
    businessDomain: "通用业务分析",
    metricName: localMetricDefinitions.metricName || "业务指标",
    detectedScenario: localMetricDefinitions.detectedScenario,
    metricType: localMetricDefinitions.metricType,
    metricCards: localMetricDefinitions.cards.filter((card) => card.id !== "custom"),
    dimensionCards: [
      { id: "dimension_time", title: "时间粒度", definition: "按天、按周、时段或关键节点", description: "判断异动是否集中在特定时间段。" },
      { id: "dimension_object", title: "业务对象", definition: "用户、账号、设备、内容、项目或其他核心对象", description: "判断是否由部分对象贡献主要变化。" },
      { id: "dimension_segment", title: "对象分层", definition: "类型、等级、阶段、标签或状态", description: "判断异动是否集中在某类分层。" },
      { id: "dimension_context", title: "场景 / 环境", definition: "入口、来源、环境、地区或使用场景", description: "判断是否与发生场景变化有关。" },
    ],
    changeFactorCards: [
      { id: "factor_rule", title: "业务规则变化", definition: "规则、口径、策略或流程变化", description: "适合确认指标变化是否与规则调整有关。" },
      { id: "factor_supply", title: "供给 / 资源变化", definition: "资源、内容、服务或可用对象变化", description: "适合确认是否由供给侧变化引起。" },
      { id: "factor_experience", title: "体验 / 流程变化", definition: "页面、流程、工具或交互体验变化", description: "适合确认是否由使用体验变化引起。" },
      { id: "factor_external", title: "外部环境变化", definition: "节假日、竞品、政策或外部事件变化", description: "适合确认是否存在外部扰动。" },
    ],
    dataRequirements: localMetricDefinitions.dataRequirements.length
      ? localMetricDefinitions.dataRequirements
      : ["指标发生时间字段", "指标分子和分母或目标结果字段", "核心业务对象 ID 字段", "可用于拆解的分层、场景或环境字段"],
    irrelevantTerms: [],
  });
}

function buildBusinessClarificationResult(
  businessProblem: string,
  payload: BusinessClarificationResponse,
): BusinessClarificationResult {
  const localFallback = generateLocalBusinessClarification(businessProblem);
  const metricName = payload.metric_name?.trim() || localFallback.metricName;
  const detectedScenario =
    payload.detected_scenario?.trim() || localFallback.detectedScenario;
  const businessDomain =
    payload.business_domain?.trim() || localFallback.businessDomain;
  const dataRequirements = normalizeTextList(
    payload.data_requirements,
    localFallback.dataRequirements,
  );
  const metricCards = normalizeMetricCards(
    payload.metric_definition_cards,
    localFallback.metricDefinitionResult.cards,
  );

  return {
    source: payload.source,
    businessDomain,
    metricName,
    detectedScenario,
    metricDefinitionResult: {
      metricName,
      metricType: toMetricType(businessDomain, metricName),
      detectedScenario,
      summaryText: metricName
        ? `你想分析“${metricName}”指标异动的可能原因。`
        : localFallback.metricDefinitionResult.summaryText,
      analysisTarget: metricName
        ? `${metricName}指标异动归因`
        : localFallback.metricDefinitionResult.analysisTarget,
      dataRequirements,
      cards: metricCards,
    },
    dimensionCards: normalizeDimensionCards(
      payload.dimension_cards,
      localFallback.dimensionCards,
    ),
    changeFactorCards: normalizeChangeFactorCards(
      payload.change_factor_cards,
      localFallback.changeFactorCards,
    ),
    dataRequirements,
    irrelevantTerms: normalizeTextList(payload.irrelevant_terms, []),
    fallbackReason: payload.fallback_reason,
  };
}

function buildLocalResult(input: {
  businessDomain: string;
  metricName: string;
  detectedScenario: string;
  metricType: string;
  metricCards: MetricDefinitionCard[];
  dimensionCards: ClarificationCard[];
  changeFactorCards: ClarificationCard[];
  dataRequirements: string[];
  irrelevantTerms: string[];
}): BusinessClarificationResult {
  const metricCards = normalizeMetricCards(input.metricCards, []);
  const dataRequirements = deduplicate(input.dataRequirements);

  return {
    source: "fallback",
    businessDomain: input.businessDomain,
    metricName: input.metricName,
    detectedScenario: input.detectedScenario,
    metricDefinitionResult: {
      metricName: input.metricName,
      metricType: input.metricType,
      detectedScenario: input.detectedScenario,
      summaryText: `你想分析“${input.metricName}”指标异动的可能原因。`,
      analysisTarget: `${input.metricName}指标异动归因`,
      dataRequirements,
      cards: metricCards,
    },
    dimensionCards: normalizeDimensionCards(input.dimensionCards, []),
    changeFactorCards: normalizeChangeFactorCards(input.changeFactorCards, []),
    dataRequirements,
    irrelevantTerms: deduplicate(input.irrelevantTerms),
    fallbackReason: null,
  };
}

function normalizeMetricCards(
  cards: ClarificationCard[],
  fallbackCards: ClarificationCard[],
) {
  const candidates = cards.filter((card) => card.id !== "custom").slice(0, 3);
  const sourceCards = candidates.length === 3 ? candidates : fallbackCards;
  return [
    ...sourceCards
      .filter((card) => card.id !== "custom")
      .slice(0, 3)
      .map(normalizeCard),
    customMetricCard,
  ];
}

function normalizeDimensionCards(
  cards: ClarificationCard[],
  fallbackCards: ClarificationCard[],
) {
  const candidates = cards.filter((card) => card.id !== "custom").slice(0, 6);
  const sourceCards = candidates.length >= 4 ? candidates : fallbackCards;
  return [
    ...sourceCards
      .filter((card) => card.id !== "custom")
      .slice(0, 6)
      .map(normalizeCard),
    customDimensionCard,
  ];
}

function normalizeChangeFactorCards(
  cards: ClarificationCard[],
  fallbackCards: ClarificationCard[],
) {
  const dynamicCards = cards
    .filter((card) => !["none", "unknown"].includes(card.id))
    .filter((card) => !["暂无明显变化", "不确定"].includes(card.title))
    .slice(0, 6);
  const sourceCards = dynamicCards.length >= 4 ? dynamicCards : fallbackCards;
  return [
    ...sourceCards
      .filter((card) => !["none", "unknown"].includes(card.id))
      .filter((card) => !["暂无明显变化", "不确定"].includes(card.title))
      .slice(0, 6)
      .map(normalizeCard),
    noneChangeFactorCard,
    unknownChangeFactorCard,
  ];
}

function normalizeCard(card: ClarificationCard, index: number): ClarificationCard {
  return {
    id: card.id || `card_${index + 1}`,
    title: card.title,
    definition: card.definition,
    description: card.description,
  };
}

function normalizeTextList(values: string[], fallbackValues: string[]) {
  const normalized = values
    .map((value) => value.trim())
    .filter((value) => value.length > 0);

  return normalized.length ? deduplicate(normalized) : fallbackValues;
}

function deduplicate(values: string[]) {
  return Array.from(new Set(values.filter(Boolean)));
}

function toMetricType(businessDomain: string, metricName: string) {
  const text = `${businessDomain} ${metricName}`.toLowerCase();
  if (text.includes("游戏") || text.includes("胜率")) {
    return "game_performance";
  }
  if (text.includes("退款")) {
    return "refund_rate";
  }
  if (text.includes("内容")) {
    return "content_metric";
  }
  if (text.includes("教育") || text.includes("学习")) {
    return "education_metric";
  }
  return "generic_business_metric";
}

function isGameContext(text: string) {
  return [
    "valorant",
    "瓦罗兰特",
    "无畏契约",
    "排位",
    "胜率",
    "游戏",
    "对局",
    "英雄",
    "特工",
    "地图",
  ].some((keyword) => text.includes(keyword));
}
