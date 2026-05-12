from __future__ import annotations

import json
import re
import socket
import urllib.error
from typing import Any, Literal

from pydantic import BaseModel

from services.llm_client import (
    Provider,
    call_chat_completion,
    describe_http_error,
    has_hosted_llm_default,
)


class MetricDefinitionRequest(BaseModel):
    business_problem: str
    provider: Provider = "openai"
    api_key: str = ""
    base_url: str = ""
    model: str = ""


class MetricDefinitionCard(BaseModel):
    id: str
    title: str
    definition: str
    description: str


class MetricDefinitionResponse(BaseModel):
    source: Literal["llm", "fallback"]
    metric_name: str
    metric_type: str
    detected_scenario: str
    cards: list[MetricDefinitionCard]
    fallback_reason: str | None = None


CUSTOM_METRIC_CARD = MetricDefinitionCard(
    id="custom",
    title="自定义口径",
    definition="以上都不是，手动补充",
    description="适合填写公司内部或业务团队自定义的指标口径。",
)


def generate_metric_definitions_with_llm(
    request: MetricDefinitionRequest,
) -> MetricDefinitionResponse:
    business_problem = request.business_problem.strip()
    fallback = generate_rule_based_metric_definitions(business_problem)
    missing_config_reason = _get_missing_config_reason(request)

    if missing_config_reason:
        return _with_fallback_reason(fallback, missing_config_reason)

    try:
        raw_response = call_chat_completion(
            api_key=request.api_key,
            base_url=request.base_url,
            model=request.model,
            messages=[
                {
                    "role": "system",
                    "content": (
                        "你是一个资深中文数据分析师。你的任务是根据用户输入的业务指标异动问题，"
                        "识别用户想分析的指标，并给出 3 个常见、合理、可执行的指标口径候选。"
                        "请严格返回 JSON，不要输出 Markdown，不要解释。"
                    ),
                },
                {
                    "role": "user",
                    "content": _build_metric_definition_prompt(business_problem),
                },
            ],
            max_tokens=900,
            temperature=0.2,
        )
        content = _extract_message_content(raw_response)
        parsed = _parse_json_object(content)
        return _validate_llm_result(parsed)
    except Exception as error:
        return _with_fallback_reason(fallback, _get_failure_reason(error))


def _get_missing_config_reason(request: MetricDefinitionRequest) -> str | None:
    if not request.api_key.strip():
        if has_hosted_llm_default():
            return None
        return "API Key 缺失"

    if not request.base_url.strip():
        return "Base URL 缺失"

    if not request.model.strip():
        return "模型名称缺失"

    return None


def _with_fallback_reason(
    fallback: MetricDefinitionResponse,
    reason: str,
) -> MetricDefinitionResponse:
    return fallback.model_copy(update={"fallback_reason": reason})


def _get_failure_reason(error: Exception) -> str:
    if isinstance(error, urllib.error.HTTPError):
        return describe_http_error(error)

    if isinstance(error, (TimeoutError, socket.timeout)):
        return "请求超时，请检查网络或服务商状态"

    if isinstance(error, urllib.error.URLError):
        if isinstance(error.reason, socket.timeout):
            return "请求超时，请检查网络或服务商状态"

        return "未知错误：无法连接到服务商，请检查 Base URL 或网络环境"

    if isinstance(error, json.JSONDecodeError):
        return "模型返回内容不是合法 JSON"

    if isinstance(error, MetricDefinitionFormatError):
        return error.reason

    if isinstance(error, ValueError):
        return str(error) or "未知错误"

    return "未知错误"


def _build_metric_definition_prompt(business_problem: str) -> str:
    return f"""用户问题：{business_problem}

请返回以下 JSON：
{{
  "metric_name": "指标名称",
  "metric_type": "指标类型",
  "detected_scenario": "识别到的业务场景",
  "cards": [
    {{
      "id": "card_1",
      "title": "候选口径标题",
      "definition": "计算口径 / 公式",
      "description": "适用场景说明"
    }},
    {{
      "id": "card_2",
      "title": "候选口径标题",
      "definition": "计算口径 / 公式",
      "description": "适用场景说明"
    }},
    {{
      "id": "card_3",
      "title": "候选口径标题",
      "definition": "计算口径 / 公式",
      "description": "适用场景说明"
    }}
  ]
}}

要求：
- 必须使用简体中文。
- 只生成 3 个候选口径。
- 不要生成第 4 个自定义口径，系统会固定追加。
- 口径必须适合业务分析，不要空泛。
- 如果用户问题模糊，也要给出通用可执行口径。
- 不要输出因果结论。
- 返回必须是合法 JSON。"""


def _extract_message_content(raw_response: dict[str, Any]) -> str:
    choices = raw_response.get("choices")
    if not isinstance(choices, list) or not choices:
        raise MetricDefinitionFormatError("返回字段缺失：choices")

    message = choices[0].get("message")
    if not isinstance(message, dict):
        raise MetricDefinitionFormatError("返回字段缺失：message")

    content = message.get("content")
    if not isinstance(content, str) or not content.strip():
        raise MetricDefinitionFormatError("返回字段缺失：content")

    return content.strip()


def _parse_json_object(raw_content: str) -> dict[str, Any]:
    cleaned = raw_content.strip()
    if cleaned.startswith("```"):
        cleaned = re.sub(r"^```(?:json)?", "", cleaned, flags=re.IGNORECASE).strip()
        cleaned = re.sub(r"```$", "", cleaned).strip()

    start = cleaned.find("{")
    end = cleaned.rfind("}")
    if start == -1 or end == -1 or end <= start:
        raise MetricDefinitionFormatError("模型返回内容不是合法 JSON")

    extracted = cleaned[start : end + 1]
    try:
        parsed = json.loads(extracted)
    except json.JSONDecodeError as error:
        raise MetricDefinitionFormatError("模型返回内容不是合法 JSON") from error

    if not isinstance(parsed, dict):
        raise MetricDefinitionFormatError("模型返回内容不是合法 JSON")

    return parsed


def _validate_llm_result(parsed: dict[str, Any]) -> MetricDefinitionResponse:
    metric_name = _read_required_text(parsed, "metric_name")
    metric_type = _read_required_text(parsed, "metric_type")
    detected_scenario = _read_required_text(parsed, "detected_scenario")
    raw_cards = parsed.get("cards")

    if not isinstance(raw_cards, list) or len(raw_cards) != 3:
        raise MetricDefinitionFormatError("cards 数量不是 3")

    cards: list[MetricDefinitionCard] = []
    for index, raw_card in enumerate(raw_cards, start=1):
        if not isinstance(raw_card, dict):
            raise MetricDefinitionFormatError("返回字段缺失：cards")

        cards.append(
            MetricDefinitionCard(
                id=f"card_{index}",
                title=_read_required_text(raw_card, "title"),
                definition=_read_required_text(raw_card, "definition"),
                description=_read_required_text(raw_card, "description"),
            ),
        )

    return MetricDefinitionResponse(
        source="llm",
        metric_name=metric_name,
        metric_type=metric_type,
        detected_scenario=detected_scenario,
        cards=[*cards, CUSTOM_METRIC_CARD],
        fallback_reason=None,
    )


def _read_required_text(payload: dict[str, Any], key: str) -> str:
    value = payload.get(key)
    if not isinstance(value, str) or not value.strip():
        raise MetricDefinitionFormatError(f"返回字段缺失：{key}")
    return value.strip()


class MetricDefinitionFormatError(ValueError):
    def __init__(self, reason: str) -> None:
        super().__init__(reason)
        self.reason = reason


def generate_rule_based_metric_definitions(
    business_problem: str,
) -> MetricDefinitionResponse:
    normalized = business_problem.strip().lower()

    if "优惠券" in normalized or "核销率" in normalized:
        return _with_custom_card(
            metric_name="优惠券核销率",
            metric_type="coupon_redemption_rate",
            detected_scenario="优惠券核销率异动分析",
            cards=[
                MetricDefinitionCard(
                    id="coupon_user",
                    title="按用户口径",
                    definition="使用优惠券用户数 / 领取优惠券用户数",
                    description="适合观察用户层面的优惠券使用转化。",
                ),
                MetricDefinitionCard(
                    id="coupon_order",
                    title="按订单口径",
                    definition="使用优惠券订单数 / 领取优惠券订单数",
                    description="适合观察订单层面的核销表现。",
                ),
                MetricDefinitionCard(
                    id="coupon_order_share",
                    title="按整体订单占比",
                    definition="优惠券订单数 / 总订单数",
                    description="适合观察优惠券订单在整体订单中的占比。",
                ),
            ],
        )

    if "dau" in normalized or "活跃" in normalized:
        return _with_custom_card(
            metric_name="活跃用户",
            metric_type="active_users",
            detected_scenario="活跃用户指标异动分析",
            cards=[
                MetricDefinitionCard(
                    id="active_login",
                    title="按登录口径",
                    definition="当日登录用户数",
                    description="适合以登录行为作为活跃用户的基础定义。",
                ),
                MetricDefinitionCard(
                    id="active_core_action",
                    title="按核心行为口径",
                    definition="当日发生核心行为的用户数",
                    description="适合观察真正完成关键业务动作的活跃用户。",
                ),
                MetricDefinitionCard(
                    id="active_visit",
                    title="按访问口径",
                    definition="当日打开 App / 小程序 / 页面访问的用户数",
                    description="适合衡量访问层面的用户活跃规模。",
                ),
            ],
        )

    if "转化率" in normalized:
        return _with_custom_card(
            metric_name="转化率",
            metric_type="conversion_rate",
            detected_scenario="转化率异动分析",
            cards=[
                MetricDefinitionCard(
                    id="visit_to_order",
                    title="访问到下单转化率",
                    definition="下单用户数 / 访问用户数",
                    description="适合分析从访问到下单环节的用户转化。",
                ),
                MetricDefinitionCard(
                    id="cart_to_payment",
                    title="加购到支付转化率",
                    definition="支付用户数 / 加购用户数",
                    description="适合分析加购后是否顺利完成支付。",
                ),
                MetricDefinitionCard(
                    id="impression_to_click",
                    title="曝光到点击转化率",
                    definition="点击次数 / 曝光次数",
                    description="适合分析内容、商品或活动入口的点击效率。",
                ),
            ],
        )

    if "gmv" in normalized or "销售额" in normalized:
        return _with_custom_card(
            metric_name="GMV / 销售额",
            metric_type="gmv",
            detected_scenario="金额类指标异动分析",
            cards=[
                MetricDefinitionCard(
                    id="total_gmv",
                    title="总 GMV 口径",
                    definition="订单实付金额总和",
                    description="适合观察所有成交订单贡献的整体交易规模。",
                ),
                MetricDefinitionCard(
                    id="paid_gmv",
                    title="支付 GMV 口径",
                    definition="已支付订单金额总和",
                    description="适合排除未支付订单，只观察已支付交易金额。",
                ),
                MetricDefinitionCard(
                    id="net_gmv",
                    title="净 GMV 口径",
                    definition="支付金额 - 退款金额",
                    description="适合观察扣除退款后的实际交易贡献。",
                ),
            ],
        )

    if "留存" in normalized:
        return _with_custom_card(
            metric_name="留存率",
            metric_type="retention_rate",
            detected_scenario="留存率异动分析",
            cards=[
                MetricDefinitionCard(
                    id="next_day_retention",
                    title="次日留存率",
                    definition="次日仍活跃用户数 / 首日新增用户数",
                    description="适合观察新增用户在第二天是否继续活跃。",
                ),
                MetricDefinitionCard(
                    id="day_7_retention",
                    title="7 日留存率",
                    definition="第 7 日仍活跃用户数 / 首日新增用户数",
                    description="适合观察新增用户一周后的持续使用情况。",
                ),
                MetricDefinitionCard(
                    id="core_action_retention",
                    title="核心行为留存率",
                    definition="次日发生核心行为的用户数 / 首日新增用户数",
                    description="适合观察用户是否回访并完成关键业务动作。",
                ),
            ],
        )

    if "退款" in normalized:
        return _with_custom_card(
            metric_name="退款率",
            metric_type="refund_rate",
            detected_scenario="退款率异动分析",
            cards=[
                MetricDefinitionCard(
                    id="refund_order_rate",
                    title="按订单退款率",
                    definition="退款订单数 / 支付订单数",
                    description="适合观察订单层面的退款发生比例。",
                ),
                MetricDefinitionCard(
                    id="refund_amount_rate",
                    title="按金额退款率",
                    definition="退款金额 / 支付金额",
                    description="适合观察退款对实际交易金额的影响。",
                ),
                MetricDefinitionCard(
                    id="refund_user_rate",
                    title="按用户退款率",
                    definition="发生退款用户数 / 支付用户数",
                    description="适合观察用户层面的退款覆盖范围。",
                ),
            ],
        )

    return _with_custom_card(
        metric_name="",
        metric_type="generic_business_metric",
        detected_scenario="通用业务指标异动分析",
        cards=[
            MetricDefinitionCard(
                id="generic_user",
                title="按用户口径",
                definition="目标行为用户数 / 基准用户数",
                description="适合从用户层面定义指标变化。",
            ),
            MetricDefinitionCard(
                id="generic_event",
                title="按事件口径",
                definition="目标事件数 / 基准事件数",
                description="适合从行为次数或事件发生量定义指标变化。",
            ),
            MetricDefinitionCard(
                id="generic_amount",
                title="按金额口径",
                definition="目标金额 / 基准金额",
                description="适合从交易金额、收入或成本角度定义指标变化。",
            ),
        ],
    )


def _with_custom_card(
    *,
    metric_name: str,
    metric_type: str,
    detected_scenario: str,
    cards: list[MetricDefinitionCard],
) -> MetricDefinitionResponse:
    return MetricDefinitionResponse(
        source="fallback",
        metric_name=metric_name,
        metric_type=metric_type,
        detected_scenario=detected_scenario,
        cards=[*cards, CUSTOM_METRIC_CARD],
        fallback_reason=None,
    )
