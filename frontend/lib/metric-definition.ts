export type MetricDefinitionCard = {
  id: string;
  title: string;
  definition: string;
  description: string;
};

export type MetricDefinitionResult = {
  metricName: string;
  metricType: string;
  detectedScenario: string;
  summaryText: string;
  analysisTarget: string;
  dataRequirements: string[];
  cards: MetricDefinitionCard[];
};

const customMetricCard: MetricDefinitionCard = {
  id: "custom",
  title: "自定义口径",
  definition: "以上都不是，手动补充",
  description: "适合填写公司内部或业务团队自定义的指标口径。",
};

export function generateMetricDefinitions(
  businessProblem: string,
): MetricDefinitionResult {
  const normalized = businessProblem.trim().toLowerCase();

  if (normalized.includes("优惠券") || normalized.includes("核销率")) {
    return withCustomCard({
      metricName: "优惠券核销率",
      metricType: "coupon_redemption_rate",
      detectedScenario: "优惠券核销率异动分析",
      summaryText: "你想分析优惠券核销率下降的可能原因。",
      analysisTarget: "优惠券核销率下降归因",
      dataRequirements: [
        "优惠券领取数据",
        "优惠券使用 / 订单数据",
        "用户基础信息数据",
        "商家 / 城市 / 活动数据",
      ],
      cards: [
        {
          id: "coupon_user",
          title: "按用户口径",
          definition: "使用优惠券用户数 / 领取优惠券用户数",
          description: "适合观察用户层面的优惠券使用转化。",
        },
        {
          id: "coupon_order",
          title: "按订单口径",
          definition: "使用优惠券订单数 / 领取优惠券订单数",
          description: "适合观察订单层面的核销表现。",
        },
        {
          id: "coupon_order_share",
          title: "按整体订单占比",
          definition: "优惠券订单数 / 总订单数",
          description: "适合观察优惠券订单在整体订单中的占比。",
        },
      ],
    });
  }

  if (normalized.includes("dau") || normalized.includes("活跃")) {
    return withCustomCard({
      metricName: "活跃用户",
      metricType: "active_users",
      detectedScenario: "活跃用户指标异动分析",
      summaryText: "你想分析活跃用户指标异动的可能原因。",
      analysisTarget: "活跃用户指标异动归因",
      dataRequirements: [
        "用户活跃日志",
        "登录 / 访问数据",
        "核心行为事件数据",
        "渠道 / 版本 / 用户分群数据",
      ],
      cards: [
        {
          id: "active_login",
          title: "按登录口径",
          definition: "当日登录用户数",
          description: "适合以登录行为作为活跃用户的基础定义。",
        },
        {
          id: "active_core_action",
          title: "按核心行为口径",
          definition: "当日发生核心行为的用户数",
          description: "适合观察真正完成关键业务动作的活跃用户。",
        },
        {
          id: "active_visit",
          title: "按访问口径",
          definition: "当日打开 App / 小程序 / 页面访问的用户数",
          description: "适合衡量访问层面的用户活跃规模。",
        },
      ],
    });
  }

  if (normalized.includes("转化率")) {
    return withCustomCard({
      metricName: "转化率",
      metricType: "conversion_rate",
      detectedScenario: "转化率异动分析",
      summaryText: "你想分析转化率下降的可能原因。",
      analysisTarget: "转化率下降归因",
      dataRequirements: [
        "访问 / 曝光数据",
        "点击 / 加购 / 下单数据",
        "支付订单数据",
        "渠道 / 页面 / 活动数据",
      ],
      cards: [
        {
          id: "visit_to_order",
          title: "访问到下单转化率",
          definition: "下单用户数 / 访问用户数",
          description: "适合分析从访问到下单环节的用户转化。",
        },
        {
          id: "cart_to_payment",
          title: "加购到支付转化率",
          definition: "支付用户数 / 加购用户数",
          description: "适合分析加购后是否顺利完成支付。",
        },
        {
          id: "impression_to_click",
          title: "曝光到点击转化率",
          definition: "点击次数 / 曝光次数",
          description: "适合分析内容、商品或活动入口的点击效率。",
        },
      ],
    });
  }

  if (normalized.includes("gmv") || normalized.includes("销售额")) {
    return withCustomCard({
      metricName: "GMV / 销售额",
      metricType: "gmv",
      detectedScenario: "金额类指标异动分析",
      summaryText: "你想分析 GMV / 销售额异动的可能原因。",
      analysisTarget: "GMV / 销售额异动归因",
      dataRequirements: [
        "订单明细数据",
        "支付金额数据",
        "退款金额数据",
        "商品 / 商家 / 渠道数据",
      ],
      cards: [
        {
          id: "total_gmv",
          title: "总 GMV 口径",
          definition: "订单实付金额总和",
          description: "适合观察所有成交订单贡献的整体交易规模。",
        },
        {
          id: "paid_gmv",
          title: "支付 GMV 口径",
          definition: "已支付订单金额总和",
          description: "适合排除未支付订单，只观察已支付交易金额。",
        },
        {
          id: "net_gmv",
          title: "净 GMV 口径",
          definition: "支付金额 - 退款金额",
          description: "适合观察扣除退款后的实际交易贡献。",
        },
      ],
    });
  }

  if (normalized.includes("留存")) {
    return withCustomCard({
      metricName: "留存率",
      metricType: "retention_rate",
      detectedScenario: "留存率异动分析",
      summaryText: "你想分析留存率异动的可能原因。",
      analysisTarget: "留存率异动归因",
      dataRequirements: [
        "新增用户数据",
        "用户活跃日志",
        "核心行为事件数据",
        "渠道 / 版本 / 用户分群数据",
      ],
      cards: [
        {
          id: "next_day_retention",
          title: "次日留存率",
          definition: "次日仍活跃用户数 / 首日新增用户数",
          description: "适合观察新增用户在第二天是否继续活跃。",
        },
        {
          id: "day_7_retention",
          title: "7 日留存率",
          definition: "第 7 日仍活跃用户数 / 首日新增用户数",
          description: "适合观察新增用户一周后的持续使用情况。",
        },
        {
          id: "core_action_retention",
          title: "核心行为留存率",
          definition: "次日发生核心行为的用户数 / 首日新增用户数",
          description: "适合观察用户是否回访并完成关键业务动作。",
        },
      ],
    });
  }

  if (normalized.includes("退款")) {
    return withCustomCard({
      metricName: "退款率",
      metricType: "refund_rate",
      detectedScenario: "退款率异动分析",
      summaryText: "你想分析退款率异动的可能原因。",
      analysisTarget: "退款率异动归因",
      dataRequirements: [
        "支付订单数据",
        "退款订单数据",
        "退款金额数据",
        "商品 / 商家 / 售后原因数据",
      ],
      cards: [
        {
          id: "refund_order_rate",
          title: "按订单退款率",
          definition: "退款订单数 / 支付订单数",
          description: "适合观察订单层面的退款发生比例。",
        },
        {
          id: "refund_amount_rate",
          title: "按金额退款率",
          definition: "退款金额 / 支付金额",
          description: "适合观察退款对实际交易金额的影响。",
        },
        {
          id: "refund_user_rate",
          title: "按用户退款率",
          definition: "发生退款用户数 / 支付用户数",
          description: "适合观察用户层面的退款覆盖范围。",
        },
      ],
    });
  }

  return withCustomCard({
    metricName: "",
    metricType: "generic_business_metric",
    detectedScenario: "通用业务指标异动分析",
    summaryText: "你想分析某个业务指标异动的可能原因。",
    analysisTarget: "业务指标异动归因",
    dataRequirements: [
      "指标明细数据",
      "用户或事件行为数据",
      "时间维度数据",
      "可用于拆解的业务维度数据",
    ],
    cards: [
      {
        id: "generic_user",
        title: "按用户口径",
        definition: "目标行为用户数 / 基准用户数",
        description: "适合从用户层面定义指标变化。",
      },
      {
        id: "generic_event",
        title: "按事件口径",
        definition: "目标事件数 / 基准事件数",
        description: "适合从行为次数或事件发生量定义指标变化。",
      },
      {
        id: "generic_amount",
        title: "按金额口径",
        definition: "目标金额 / 基准金额",
        description: "适合从交易金额、收入或成本角度定义指标变化。",
      },
    ],
  });
}

function withCustomCard(
  result: Omit<MetricDefinitionResult, "cards"> & {
    cards: MetricDefinitionCard[];
  },
): MetricDefinitionResult {
  return {
    ...result,
    cards: [...result.cards, customMetricCard],
  };
}
