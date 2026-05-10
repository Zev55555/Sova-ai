from __future__ import annotations

import json
import re
import socket
import urllib.error
from typing import Any, Literal

from pydantic import BaseModel

from services.llm_client import call_chat_completion, describe_http_error


class ClarificationCard(BaseModel):
    id: str
    title: str
    definition: str
    description: str


class BusinessClarificationRequest(BaseModel):
    business_problem: str
    provider: str = "openai"
    api_key: str = ""
    base_url: str = ""
    model: str = ""


class BusinessClarificationResponse(BaseModel):
    source: Literal["llm", "fallback"]
    business_domain: str
    metric_name: str
    detected_scenario: str
    metric_definition_cards: list[ClarificationCard]
    dimension_cards: list[ClarificationCard]
    change_factor_cards: list[ClarificationCard]
    data_requirements: list[str]
    irrelevant_terms: list[str]
    fallback_reason: str | None = None


CUSTOM_METRIC_CARD = ClarificationCard(
    id="custom",
    title="自定义口径",
    definition="以上都不是，手动补充",
    description="适合填写公司内部或业务团队自定义的指标口径。",
)

CUSTOM_DIMENSION_CARD = ClarificationCard(
    id="custom",
    title="自定义维度",
    definition="以上都不是，手动补充",
    description="补充你们业务中特有的拆解维度。",
)

NONE_CHANGE_FACTOR_CARD = ClarificationCard(
    id="none",
    title="暂无明显变化",
    definition="目前没有已知的相关变化",
    description="后续将更依赖数据拆解来发现异常来源。",
)

UNKNOWN_CHANGE_FACTOR_CARD = ClarificationCard(
    id="unknown",
    title="不确定",
    definition="暂时不清楚是否存在相关变化",
    description="后续报告中会标记为需要进一步向业务方确认。",
)


def generate_business_clarification_with_llm(
    request: BusinessClarificationRequest,
) -> BusinessClarificationResponse:
    business_problem = request.business_problem.strip()
    fallback = generate_rule_based_business_clarification(business_problem)
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
                        "你是一个资深中文业务分析师。你的任务是根据用户输入的指标异动问题，"
                        "动态生成适合当前业务场景的澄清卡片。不要套用固定电商模板。"
                        "请严格返回 JSON，不要输出 Markdown，不要输出 ```json，不要解释，"
                        "不要输出任何 JSON 外的文字。"
                    ),
                },
                {
                    "role": "user",
                    "content": _build_business_clarification_prompt(business_problem),
                },
            ],
            max_tokens=3200,
            temperature=0.2,
            response_format_json=True,
        )
        content = _extract_message_content(raw_response)
        parsed = _parse_json_object(content)
        return _validate_llm_result(parsed)
    except Exception as error:
        return _with_fallback_reason(fallback, _get_failure_reason(error))


def generate_rule_based_business_clarification(
    business_problem: str,
) -> BusinessClarificationResponse:
    normalized = business_problem.strip().lower()

    if _is_game_context(normalized):
        metric_name = "排位胜率" if "胜率" in normalized else "游戏表现指标"
        return _build_response(
            business_domain="游戏表现分析",
            metric_name=metric_name,
            detected_scenario=f"{metric_name}异动分析",
            metric_cards=[
                ClarificationCard(
                    id="metric_game_match_win_rate",
                    title="按对局胜率",
                    definition="胜利对局数 / 总对局数",
                    description="适合观察整体对局结果是否出现变化。",
                ),
                ClarificationCard(
                    id="metric_game_rank_win_rate",
                    title="按排位胜率",
                    definition="排位胜利局数 / 排位总局数",
                    description="适合只关注排位模式下的胜率波动。",
                ),
                ClarificationCard(
                    id="metric_game_recent_session",
                    title="按近期场次口径",
                    definition="指定时间窗口内胜利局数 / 指定时间窗口内总局数",
                    description="适合分析最近一段时间的表现异动。",
                ),
            ],
            dimension_cards=[
                ClarificationCard(
                    id="dimension_map",
                    title="地图",
                    definition="不同地图或地图池",
                    description="判断胜率异动是否集中在特定地图。",
                ),
                ClarificationCard(
                    id="dimension_agent",
                    title="英雄 / 特工",
                    definition="使用英雄、特工或角色定位",
                    description="判断是否与当前使用角色或定位变化有关。",
                ),
                ClarificationCard(
                    id="dimension_side",
                    title="攻防方",
                    definition="进攻方 / 防守方表现",
                    description="判断胜率变化是否集中在攻防某一侧。",
                ),
                ClarificationCard(
                    id="dimension_server",
                    title="服务器地区",
                    definition="服务器、地区或延迟环境",
                    description="判断网络环境或服务器差异是否影响表现。",
                ),
                ClarificationCard(
                    id="dimension_time",
                    title="时间粒度",
                    definition="按天、按周、时段或赛季阶段",
                    description="判断异动是否集中在特定时间段。",
                ),
            ],
            change_factor_cards=[
                ClarificationCard(
                    id="factor_patch",
                    title="版本更新",
                    definition="游戏版本、规则或机制发生变化",
                    description="适合确认胜率异动是否与版本发布时间重合。",
                ),
                ClarificationCard(
                    id="factor_map_pool",
                    title="地图池变化",
                    definition="地图上线、下线或地图池调整",
                    description="适合确认表现变化是否与地图环境变化有关。",
                ),
                ClarificationCard(
                    id="factor_balance",
                    title="英雄 / 特工平衡调整",
                    definition="角色强度、技能或装备机制调整",
                    description="适合确认常用角色是否受到版本影响。",
                ),
                ClarificationCard(
                    id="factor_matchmaking",
                    title="匹配环境变化",
                    definition="队友、对手、段位或组排状态发生变化",
                    description="适合确认近期对局环境是否有明显差异。",
                ),
                ClarificationCard(
                    id="factor_network",
                    title="网络延迟变化",
                    definition="延迟、丢包、服务器稳定性变化",
                    description="适合确认表现波动是否和网络环境有关。",
                ),
            ],
            data_requirements=[
                "对局日期或时间字段",
                "胜负结果或回合结果字段",
                "地图字段",
                "英雄 / 特工或角色定位字段",
                "攻防方字段",
                "服务器地区、延迟或网络质量字段",
                "ACS、击杀、死亡、助攻等表现字段",
            ],
            irrelevant_terms=[],
            source="fallback",
        )

    if _is_ecommerce_refund_context(normalized):
        return _build_response(
            business_domain="电商交易分析",
            metric_name="退款率",
            detected_scenario="电商退款率异动分析",
            metric_cards=[
                ClarificationCard(
                    id="metric_refund_order",
                    title="按订单退款率",
                    definition="退款订单数 / 支付订单数",
                    description="适合观察订单层面的退款发生比例。",
                ),
                ClarificationCard(
                    id="metric_refund_amount",
                    title="按金额退款率",
                    definition="退款金额 / 支付金额",
                    description="适合观察退款对交易金额的影响。",
                ),
                ClarificationCard(
                    id="metric_refund_user",
                    title="按用户退款率",
                    definition="发生退款用户数 / 支付用户数",
                    description="适合观察用户层面的退款覆盖范围。",
                ),
            ],
            dimension_cards=[
                ClarificationCard(
                    id="dimension_product",
                    title="商品类目",
                    definition="商品、SKU、类目或品牌",
                    description="判断退款是否集中在部分商品或类目。",
                ),
                ClarificationCard(
                    id="dimension_merchant",
                    title="商家 / 店铺",
                    definition="商家、店铺或供应方",
                    description="判断是否由部分商家贡献了主要变化。",
                ),
                ClarificationCard(
                    id="dimension_refund_reason",
                    title="退款原因",
                    definition="售后原因、退货原因或投诉类型",
                    description="判断退款变化是否集中在某类售后原因。",
                ),
                ClarificationCard(
                    id="dimension_region",
                    title="地区 / 城市",
                    definition="城市、区域、省份或配送区域",
                    description="判断是否由特定地区贡献了退款变化。",
                ),
                ClarificationCard(
                    id="dimension_channel",
                    title="订单来源",
                    definition="渠道、活动入口或流量来源",
                    description="判断退款变化是否与订单来源结构有关。",
                ),
            ],
            change_factor_cards=[
                ClarificationCard(
                    id="factor_policy",
                    title="售后规则调整",
                    definition="退款政策、运费险或审核规则变化",
                    description="适合确认退款率变化是否与规则调整有关。",
                ),
                ClarificationCard(
                    id="factor_product_quality",
                    title="商品质量变化",
                    definition="商品质量、库存批次或供应稳定性变化",
                    description="适合确认退款是否与部分商品质量有关。",
                ),
                ClarificationCard(
                    id="factor_logistics",
                    title="物流履约变化",
                    definition="发货时效、配送体验或破损率变化",
                    description="适合确认退款是否与履约体验有关。",
                ),
                ClarificationCard(
                    id="factor_promotion",
                    title="促销活动变化",
                    definition="大促、补贴、价格策略或活动节奏变化",
                    description="适合确认退款是否与订单结构变化有关。",
                ),
            ],
            data_requirements=[
                "订单日期、支付日期或退款日期字段",
                "订单 ID、用户 ID、支付订单数和退款订单数字段",
                "支付金额和退款金额字段",
                "商品、商家、类目或品牌字段",
                "退款原因、售后状态或物流履约字段",
            ],
            irrelevant_terms=["英雄", "地图", "攻防方", "ACS"],
            source="fallback",
        )

    if _is_content_context(normalized):
        return _build_response(
            business_domain="内容运营分析",
            metric_name="内容表现指标",
            detected_scenario="内容运营指标异动分析",
            metric_cards=[
                ClarificationCard(
                    id="metric_content_view",
                    title="按播放 / 浏览口径",
                    definition="播放次数或浏览次数",
                    description="适合观察内容消费规模变化。",
                ),
                ClarificationCard(
                    id="metric_content_click",
                    title="按点击转化口径",
                    definition="点击次数 / 曝光次数",
                    description="适合观察曝光到点击的内容吸引力。",
                ),
                ClarificationCard(
                    id="metric_content_finish",
                    title="按完播 / 完读口径",
                    definition="完播或完读次数 / 播放或阅读次数",
                    description="适合观察内容质量和消费深度。",
                ),
            ],
            dimension_cards=[
                ClarificationCard(id="dimension_content_type", title="内容类型", definition="视频、图文、直播或专题", description="判断异动是否集中在某类内容。"),
                ClarificationCard(id="dimension_author", title="作者 / 账号", definition="作者、账号或创作者分层", description="判断是否由部分作者贡献主要变化。"),
                ClarificationCard(id="dimension_publish_time", title="发布时间", definition="发布时间、时段或日期", description="判断异动是否与发布节奏有关。"),
                ClarificationCard(id="dimension_recommend_slot", title="推荐位置", definition="推荐位、页面位置或分发场景", description="判断是否与流量分发位置有关。"),
                ClarificationCard(id="dimension_audience", title="受众分群", definition="用户兴趣、地域或新老用户", description="判断是否集中在某类受众。"),
            ],
            change_factor_cards=[
                ClarificationCard(id="factor_algorithm", title="推荐策略变化", definition="推荐算法、排序逻辑或召回策略变化", description="适合确认内容曝光结构是否变化。"),
                ClarificationCard(id="factor_supply", title="内容供给变化", definition="内容数量、质量或作者供给变化", description="适合确认是否由内容供给引起。"),
                ClarificationCard(id="factor_event", title="热点 / 活动变化", definition="热点事件、专题活动或运营节奏变化", description="适合确认流量是否受外部热点影响。"),
                ClarificationCard(id="factor_entry", title="入口位置变化", definition="页面入口、推荐位或频道结构变化", description="适合确认分发入口是否变化。"),
            ],
            data_requirements=["内容 ID、内容类型、作者字段", "曝光、点击、播放、完播或互动字段", "发布时间和消费时间字段", "推荐位置、频道或流量来源字段"],
            irrelevant_terms=["优惠券", "GMV", "退款金额", "攻防方"],
            source="fallback",
        )

    if _is_education_context(normalized):
        return _build_response(
            business_domain="教育学习分析",
            metric_name="学习表现指标",
            detected_scenario="教育学习指标异动分析",
            metric_cards=[
                ClarificationCard(id="metric_completion", title="按完成率口径", definition="完成人数 / 应完成人数", description="适合观察课程或作业完成情况。"),
                ClarificationCard(id="metric_score", title="按成绩口径", definition="平均得分或达标人数 / 参与人数", description="适合观察学习效果变化。"),
                ClarificationCard(id="metric_activity", title="按学习活跃口径", definition="有学习行为的学生数 / 总学生数", description="适合观察学习参与度变化。"),
            ],
            dimension_cards=[
                ClarificationCard(id="dimension_course", title="课程", definition="课程、章节或知识点", description="判断异动是否集中在某些课程内容。"),
                ClarificationCard(id="dimension_class", title="班级", definition="班级、年级或教学组", description="判断是否由部分班级贡献主要变化。"),
                ClarificationCard(id="dimension_student_type", title="学生类型", definition="新老学生、水平分层或学习路径", description="判断是否集中在某类学生。"),
                ClarificationCard(id="dimension_assignment", title="作业类型", definition="作业、测验、练习或考试类型", description="判断是否与任务类型有关。"),
                ClarificationCard(id="dimension_deadline", title="截止时间", definition="截止日期、提交时段或周期", description="判断是否与时间安排有关。"),
            ],
            change_factor_cards=[
                ClarificationCard(id="factor_curriculum", title="课程内容调整", definition="课程难度、章节顺序或教学内容变化", description="适合确认学习表现是否与内容调整有关。"),
                ClarificationCard(id="factor_assignment", title="作业 / 测验规则变化", definition="题量、评分、截止时间或提交规则变化", description="适合确认完成率或成绩是否受规则影响。"),
                ClarificationCard(id="factor_calendar", title="教学日历变化", definition="考试周、假期或课程安排变化", description="适合确认是否受学习节奏影响。"),
                ClarificationCard(id="factor_reminder", title="提醒机制变化", definition="通知、提醒或学习督促机制变化", description="适合确认学生触达是否发生变化。"),
            ],
            data_requirements=["学生 ID、班级、课程或章节字段", "学习行为、提交、完成或成绩字段", "作业类型、截止时间和提交时间字段", "提醒、教学安排或规则变化记录"],
            irrelevant_terms=["优惠券", "GMV", "商家", "地图池"],
            source="fallback",
        )

    return _build_response(
        business_domain="通用业务分析",
        metric_name="业务指标",
        detected_scenario="通用业务指标异动分析",
        metric_cards=[
            ClarificationCard(id="metric_user", title="按对象口径", definition="目标对象数 / 基准对象数", description="适合从用户、账号、设备或业务对象层面定义指标。"),
            ClarificationCard(id="metric_event", title="按事件口径", definition="目标事件数 / 基准事件数", description="适合从行为次数或事件发生量定义指标。"),
            ClarificationCard(id="metric_rate", title="按比例口径", definition="目标结果数 / 总样本数", description="适合定义转化、达成、成功或异常比例。"),
        ],
        dimension_cards=[
            ClarificationCard(id="dimension_time", title="时间粒度", definition="按天、按周、时段或关键节点", description="判断异动是否集中在特定时间段。"),
            ClarificationCard(id="dimension_object", title="业务对象", definition="用户、账号、设备、内容、项目或其他核心对象", description="判断是否由部分对象贡献主要变化。"),
            ClarificationCard(id="dimension_segment", title="对象分层", definition="类型、等级、阶段、标签或状态", description="判断异动是否集中在某类分层。"),
            ClarificationCard(id="dimension_context", title="场景 / 环境", definition="入口、来源、环境、地区或使用场景", description="判断是否与发生场景变化有关。"),
        ],
        change_factor_cards=[
            ClarificationCard(id="factor_rule", title="业务规则变化", definition="规则、口径、策略或流程变化", description="适合确认指标变化是否与规则调整有关。"),
            ClarificationCard(id="factor_supply", title="供给 / 资源变化", definition="资源、内容、服务或可用对象变化", description="适合确认是否由供给侧变化引起。"),
            ClarificationCard(id="factor_experience", title="体验 / 流程变化", definition="页面、流程、工具或交互体验变化", description="适合确认是否由使用体验变化引起。"),
            ClarificationCard(id="factor_external", title="外部环境变化", definition="节假日、竞品、政策或外部事件变化", description="适合确认是否存在外部扰动。"),
        ],
        data_requirements=["指标发生时间字段", "指标分子和分母或目标结果字段", "核心业务对象 ID 字段", "可用于拆解的分层、场景或环境字段", "近期规则、策略或外部变化记录"],
        irrelevant_terms=[],
        source="fallback",
    )


def _build_response(
    *,
    business_domain: str,
    metric_name: str,
    detected_scenario: str,
    metric_cards: list[ClarificationCard],
    dimension_cards: list[ClarificationCard],
    change_factor_cards: list[ClarificationCard],
    data_requirements: list[str],
    irrelevant_terms: list[str],
    source: Literal["llm", "fallback"],
) -> BusinessClarificationResponse:
    return BusinessClarificationResponse(
        source=source,
        business_domain=business_domain,
        metric_name=metric_name,
        detected_scenario=detected_scenario,
        metric_definition_cards=_with_system_metric_card(metric_cards),
        dimension_cards=_with_system_dimension_card(dimension_cards),
        change_factor_cards=_with_system_change_factor_cards(change_factor_cards),
        data_requirements=_deduplicate(data_requirements),
        irrelevant_terms=_deduplicate(irrelevant_terms),
        fallback_reason=None,
    )


def _build_business_clarification_prompt(business_problem: str) -> str:
    return f"""用户问题：{business_problem}

请根据这个问题判断业务场景，并生成指标口径、分析维度、近期变化因素和数据需求。

请返回以下 JSON：
{{
  "business_domain": "当前业务场景，例如 游戏表现分析 / 电商交易分析 / 内容运营分析 / 教育学习分析 / 通用业务分析",
  "metric_name": "指标名称",
  "detected_scenario": "识别到的具体场景",
  "metric_definition_cards": [
    {{
      "id": "metric_1",
      "title": "候选口径标题",
      "definition": "计算口径 / 公式",
      "description": "适用场景说明"
    }}
  ],
  "dimension_cards": [
    {{
      "id": "dimension_1",
      "title": "维度名称",
      "definition": "维度说明",
      "description": "为什么这个维度适合当前问题"
    }}
  ],
  "change_factor_cards": [
    {{
      "id": "factor_1",
      "title": "近期变化因素名称",
      "definition": "因素说明",
      "description": "为什么这个因素值得确认"
    }}
  ],
  "data_requirements": ["当前分析需要的数据字段或数据表"],
  "irrelevant_terms": ["当前场景不应该出现的无关业务词"]
}}

要求：
- 必须使用简体中文。
- 指标口径卡片必须生成 3 张，不要生成“自定义口径”。
- 分析维度卡片必须生成 4 到 6 张，不要生成“自定义维度”。
- 近期变化因素卡片必须生成 4 到 6 张，不要生成“暂无明显变化”和“不确定”。
- 所有卡片必须贴合当前业务场景，不要出现与当前场景无关的词。
- 如果是游戏场景，不要出现优惠券、GMV、商品、商家、渠道投放等电商词。
- 如果是非电商场景，不要默认使用电商模板。
- 不要生成 SQL，不要输出因果结论。
- 返回必须是合法 JSON。
- 回复必须以 {{ 开头，以 }} 结尾。"""


def _validate_llm_result(parsed: dict[str, Any]) -> BusinessClarificationResponse:
    required_keys = [
        "business_domain",
        "metric_name",
        "detected_scenario",
        "metric_definition_cards",
        "dimension_cards",
        "change_factor_cards",
        "data_requirements",
        "irrelevant_terms",
    ]
    for key in required_keys:
        if key not in parsed:
            raise BusinessClarificationFormatError(f"返回字段缺失：{key}")

    metric_cards = _read_cards(parsed, "metric_definition_cards", exact_count=3)
    dimension_cards = _read_cards(parsed, "dimension_cards", min_count=4, max_count=6)
    change_factor_cards = _read_cards(parsed, "change_factor_cards", min_count=4, max_count=6)
    data_requirements = _read_text_list(parsed, "data_requirements")
    irrelevant_terms = _read_text_list(parsed, "irrelevant_terms", allow_empty=True)

    return _build_response(
        source="llm",
        business_domain=_read_required_text(parsed, "business_domain"),
        metric_name=_read_required_text(parsed, "metric_name"),
        detected_scenario=_read_required_text(parsed, "detected_scenario"),
        metric_cards=metric_cards,
        dimension_cards=dimension_cards,
        change_factor_cards=change_factor_cards,
        data_requirements=data_requirements,
        irrelevant_terms=irrelevant_terms,
    )


def _read_cards(
    payload: dict[str, Any],
    key: str,
    *,
    exact_count: int | None = None,
    min_count: int | None = None,
    max_count: int | None = None,
) -> list[ClarificationCard]:
    raw_cards = payload.get(key)
    if not isinstance(raw_cards, list):
        raise BusinessClarificationFormatError(f"{key} 结构不合法")

    if exact_count is not None and len(raw_cards) < exact_count:
        raise BusinessClarificationFormatError(f"{key} 数量不足")
    if min_count is not None and len(raw_cards) < min_count:
        raise BusinessClarificationFormatError(f"{key} 数量不足")

    cards: list[ClarificationCard] = []
    read_limit = exact_count or max_count or len(raw_cards)
    for index, raw_card in enumerate(raw_cards[:read_limit], start=1):
        if not isinstance(raw_card, dict):
            raise BusinessClarificationFormatError(f"{key} 结构不合法")

        cards.append(
            ClarificationCard(
                id=_read_optional_text(raw_card, "id") or f"{key}_{index}",
                title=_read_required_text(raw_card, "title"),
                definition=_read_required_text(raw_card, "definition"),
                description=_read_required_text(raw_card, "description"),
            )
        )

    return cards


def _get_missing_config_reason(request: BusinessClarificationRequest) -> str | None:
    if not request.api_key.strip():
        return "API Key 缺失"
    if not request.base_url.strip():
        return "Base URL 缺失"
    if not request.model.strip():
        return "模型名称缺失"
    return None


def _with_fallback_reason(
    fallback: BusinessClarificationResponse,
    reason: str,
) -> BusinessClarificationResponse:
    return fallback.model_copy(update={"fallback_reason": reason})


def _extract_message_content(raw_response: dict[str, Any]) -> str:
    choices = raw_response.get("choices")
    if not isinstance(choices, list) or not choices:
        raise BusinessClarificationFormatError("返回字段缺失：choices")

    message = choices[0].get("message")
    if not isinstance(message, dict):
        raise BusinessClarificationFormatError("返回字段缺失：message")

    content = message.get("content")
    if not isinstance(content, str) or not content.strip():
        raise BusinessClarificationFormatError("返回字段缺失：content")

    return content.strip()


def _parse_json_object(raw_content: str) -> dict[str, Any]:
    cleaned = raw_content.strip().lstrip("\ufeff")

    try:
        parsed = json.loads(cleaned)
        if isinstance(parsed, dict):
            return parsed
    except json.JSONDecodeError:
        pass

    code_block = re.search(
        r"```(?:json)?\s*([\s\S]*?)\s*```",
        cleaned,
        flags=re.IGNORECASE | re.DOTALL,
    )
    if code_block:
        try:
            parsed = json.loads(code_block.group(1))
            if isinstance(parsed, dict):
                return parsed
        except json.JSONDecodeError:
            pass

    start = cleaned.find("{")
    end = cleaned.rfind("}")
    if start == -1 or end == -1 or end <= start:
        raise BusinessClarificationFormatError("模型返回内容不是合法 JSON")

    try:
        parsed = json.loads(cleaned[start : end + 1])
    except json.JSONDecodeError as error:
        raise BusinessClarificationFormatError("模型返回内容不是合法 JSON") from error

    if not isinstance(parsed, dict):
        raise BusinessClarificationFormatError("模型返回内容不是合法 JSON")

    return parsed


def _get_failure_reason(error: Exception) -> str:
    if isinstance(error, BusinessClarificationFormatError):
        return str(error)
    if isinstance(error, urllib.error.HTTPError):
        return describe_http_error(error)
    if isinstance(error, (TimeoutError, socket.timeout)):
        return "请求超时，请检查网络或服务商状态"
    if isinstance(error, urllib.error.URLError):
        if isinstance(error.reason, socket.timeout):
            return "请求超时，请检查网络或服务商状态"
        return "未知错误：无法连接到服务商，请检查 Base URL 或网络环境"
    if isinstance(error, ValueError):
        return str(error) or "未知错误"
    return "未知错误"


def _read_required_text(payload: dict[str, Any], key: str) -> str:
    value = payload.get(key)
    if not isinstance(value, str) or not value.strip():
        raise BusinessClarificationFormatError(f"返回字段缺失：{key}")
    return value.strip()


def _read_optional_text(payload: dict[str, Any], key: str) -> str | None:
    value = payload.get(key)
    if value is None:
        return None
    if not isinstance(value, str):
        raise BusinessClarificationFormatError(f"返回字段缺失：{key}")
    return value.strip() or None


def _read_text_list(
    payload: dict[str, Any],
    key: str,
    *,
    allow_empty: bool = False,
) -> list[str]:
    value = payload.get(key)
    if not isinstance(value, list):
        raise BusinessClarificationFormatError(f"返回字段缺失：{key}")

    result = []
    for item in value:
        if not isinstance(item, str) or not item.strip():
            raise BusinessClarificationFormatError(f"返回字段缺失：{key}")
        result.append(item.strip())

    if not result and not allow_empty:
        raise BusinessClarificationFormatError(f"返回字段缺失：{key}")

    return result


def _with_system_metric_card(cards: list[ClarificationCard]) -> list[ClarificationCard]:
    return [card for card in cards if card.id != "custom"][:3] + [CUSTOM_METRIC_CARD]


def _with_system_dimension_card(cards: list[ClarificationCard]) -> list[ClarificationCard]:
    return [card for card in cards if card.id != "custom"][:6] + [CUSTOM_DIMENSION_CARD]


def _with_system_change_factor_cards(
    cards: list[ClarificationCard],
) -> list[ClarificationCard]:
    dynamic_cards = [
        card
        for card in cards
        if card.id not in {"none", "unknown"} and card.title not in {"暂无明显变化", "不确定"}
    ][:6]
    return [*dynamic_cards, NONE_CHANGE_FACTOR_CARD, UNKNOWN_CHANGE_FACTOR_CARD]


def _deduplicate(values: list[str]) -> list[str]:
    result = []
    seen = set()
    for value in values:
        if value and value not in seen:
            seen.add(value)
            result.append(value)
    return result


def _is_game_context(text: str) -> bool:
    return any(
        keyword in text
        for keyword in [
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
        ]
    )


def _is_ecommerce_refund_context(text: str) -> bool:
    return any(keyword in text for keyword in ["退款", "退货", "订单", "电商", "售后"])


def _is_content_context(text: str) -> bool:
    return any(keyword in text for keyword in ["内容", "视频", "播放", "阅读", "完播", "推荐", "作者"])


def _is_education_context(text: str) -> bool:
    return any(keyword in text for keyword in ["课程", "作业", "学生", "学习", "班级", "考试", "成绩"])


class BusinessClarificationFormatError(ValueError):
    pass
