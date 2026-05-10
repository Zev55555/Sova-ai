"""Scenario profile hints for semantic context matching.

These profiles are lightweight hints for future semantic_context generation.
They do not decide final analysis results and are not wired into the current
upload or DuckDB flow in Stage 7A.2-1.
"""

from __future__ import annotations

from copy import deepcopy
from typing import Any


SCENARIO_PROFILES: list[dict[str, Any]] = [
    {
        "scenario_id": "ecommerce_refund",
        "domain_label": "电商交易 / 退款分析",
        "description": "适合分析订单退款率、退货率、退款金额异常及售后规则变化相关问题。",
        "business_keywords": ["电商", "订单", "退款", "退货", "售后", "交易", "商家", "商品", "履约"],
        "metric_keywords": ["退款率", "退货率", "退款金额", "退款订单", "售后率"],
        "likely_numerator_fields": ["is_refunded", "refunded", "refund_amount", "return_flag"],
        "likely_denominator_fields": ["order_id", "order_count", "order_amount", "paid_order_id"],
        "dimension_hints": {
            "channel": "订单来源渠道",
            "city": "城市 / 地区",
            "user_type": "用户类型",
            "merchant": "商家",
            "category": "商品类目",
            "return_reason": "退款 / 退货原因",
        },
        "auxiliary_hints": {
            "order_amount": "订单金额",
            "refund_amount": "退款金额",
            "logistics": "物流履约信息",
            "after_sales": "售后处理信息",
        },
        "forbidden_terms": ["游戏", "作业", "客服工单", "SLA", "完播"],
    },
    {
        "scenario_id": "content_completion",
        "domain_label": "内容运营 / 完播率分析",
        "description": "适合分析视频、课程、文章等内容的完播率、播放完成度和观看时长异常。",
        "business_keywords": ["内容", "视频", "播放", "完播", "观看", "作者", "流量", "推荐"],
        "metric_keywords": ["完播率", "播放完成率", "观看时长", "平均观看", "播放量"],
        "likely_numerator_fields": ["complete_play_count", "completed_views", "finish_count", "completed"],
        "likely_denominator_fields": ["play_count", "view_count", "video_id", "content_id", "impression_count"],
        "dimension_hints": {
            "content_type": "内容类型",
            "author_type": "作者类型",
            "traffic_source": "流量来源",
            "video_duration": "视频时长",
            "publish_date": "发布时间",
        },
        "auxiliary_hints": {
            "avg_watch_seconds": "平均观看时长",
            "like_count": "点赞数",
            "comment_count": "评论数",
            "share_count": "分享数",
        },
        "forbidden_terms": ["优惠券", "GMV", "商家", "游戏", "作业", "客服"],
    },
    {
        "scenario_id": "game_performance",
        "domain_label": "游戏表现 / 胜率分析",
        "description": "适合分析对局胜率、排位表现、地图或角色维度的游戏指标异常。",
        "business_keywords": ["游戏", "对局", "排位", "胜率", "地图", "英雄", "特工", "阵营", "服务器"],
        "metric_keywords": ["胜率", "排位胜率", "获胜率", "KDA", "ACS", "命中率"],
        "likely_numerator_fields": ["result_win", "is_win", "win_flag", "wins"],
        "likely_denominator_fields": ["match_id", "game_id", "round_id", "matches"],
        "dimension_hints": {
            "map": "地图",
            "map_channel": "地图",
            "agent": "英雄 / 特工",
            "agent_category": "英雄 / 特工类别",
            "side": "攻防方 / 阵营",
            "queue_type": "排队类型 / 队列类型",
            "party_size": "组队人数",
            "party_type": "排队类型",
            "premade_type": "组队类型",
            "server": "服务器地区",
        },
        "auxiliary_hints": {
            "acs": "ACS / 表现指标",
            "acs_amount": "ACS / 表现指标",
            "headshot_rate": "爆头率",
            "kills": "击杀数",
            "deaths": "死亡数",
            "assists": "助攻数",
        },
        "forbidden_terms": ["优惠券", "GMV", "作业", "客服", "商家"],
    },
    {
        "scenario_id": "education_assignment",
        "domain_label": "教育学习 / 作业提交分析",
        "description": "适合分析作业提交率、按时提交率、迟交率和学习任务完成异常。",
        "business_keywords": ["教育", "学习", "课程", "作业", "提交", "学生", "老师", "截止时间"],
        "metric_keywords": ["作业按时提交率", "提交率", "迟交率", "未提交率", "完成率"],
        "likely_numerator_fields": ["submitted_on_time", "final_submitted", "on_time", "submitted", "late_submission"],
        "likely_denominator_fields": ["submission_id", "assignment_id", "student_id", "assigned_count"],
        "dimension_hints": {
            "course": "课程",
            "course_name": "课程",
            "assignment_type": "作业类型",
            "student_group": "学生群体",
            "platform": "提交平台",
            "reminder_channel": "提醒方式",
            "due_time_slot": "截止时间段",
            "difficulty": "作业难度",
        },
        "auxiliary_hints": {
            "score": "成绩 / 辅助指标",
            "time_spent": "作业耗时",
            "non_submit_reason": "未提交原因",
            "instructor": "授课老师",
        },
        "forbidden_terms": ["优惠券", "GMV", "商品", "商家", "游戏", "客服", "ACS"],
    },
    {
        "scenario_id": "customer_support_sla",
        "domain_label": "客服支持 / 服务质量分析",
        "description": "适合分析客服工单 SLA 超时率、响应时长、解决效率和满意度异常。",
        "business_keywords": ["客服", "工单", "SLA", "响应", "解决", "超时", "客户支持", "服务质量"],
        "metric_keywords": ["SLA超时率", "超时率", "响应时长", "解决时长", "满意度", "重开率"],
        "likely_numerator_fields": ["is_sla_breached", "sla_breached", "breach_flag", "timeout_flag"],
        "likely_denominator_fields": ["ticket_id", "case_id", "request_id"],
        "dimension_hints": {
            "support_channel": "客服渠道",
            "issue_type": "问题类型",
            "customer_segment": "客户分层",
            "product_module": "产品模块",
            "priority_level": "优先级",
            "agent_team": "处理团队 / 客服团队",
            "support_team": "处理团队",
            "assigned_team": "处理团队",
            "agent_group": "处理团队",
            "team_name": "处理团队",
        },
        "auxiliary_hints": {
            "first_response_minutes": "首次响应时长",
            "resolved_minutes": "解决时长",
            "csat_score": "客户满意度",
            "reopened": "工单重开标记",
        },
        "forbidden_terms": ["优惠券", "GMV", "游戏", "作业", "商家"],
    },
    {
        "scenario_id": "reservation_attendance",
        "domain_label": "预约 / 空间使用分析",
        "description": "适合分析预约到场率、爽约率、迟到率和空间使用效率异常。",
        "business_keywords": ["预约", "到场", "签到", "爽约", "空间", "座位", "校区", "预订"],
        "metric_keywords": ["预约到场率", "到场率", "爽约率", "签到率", "取消率"],
        "likely_numerator_fields": ["is_checked_in", "checked_in", "attendance_flag", "arrived"],
        "likely_denominator_fields": ["reservation_id", "booking_id", "appointment_id"],
        "dimension_hints": {
            "campus_zone": "校区 / 空间区域",
            "seat_area": "座位区域",
            "time_slot": "预约时段",
            "student_group": "学生群体",
            "booking_source": "预约来源",
            "weather": "天气",
        },
        "auxiliary_hints": {
            "cancel_before_start": "开场前取消",
            "minutes_late": "迟到分钟数",
            "study_duration": "学习时长",
            "no_show_reason": "爽约原因",
        },
        "forbidden_terms": ["优惠券", "GMV", "游戏", "客服", "商家"],
    },
    {
        "scenario_id": "saas_product_usage",
        "domain_label": "SaaS 产品使用 / 用户激活分析",
        "description": "适合分析 SaaS 新用户激活、7日激活率、onboarding 完成、核心配置完成和产品首次使用等产品增长问题。",
        "business_keywords": [
            "SaaS",
            "产品",
            "功能",
            "活跃",
            "账号",
            "团队",
            "模块",
            "使用",
            "新注册用户",
            "新用户",
            "注册用户数",
            "7日激活率",
            "激活率",
            "产品激活",
            "onboarding",
            "引导",
            "核心配置",
            "首次登录",
            "客服响应",
            "产品使用",
            "试用用户",
            "试用激活",
            "注册来源",
            "套餐类型",
            "公司规模",
            "用户所属行业",
        ],
        "metric_keywords": [
            "活跃率",
            "使用率",
            "功能渗透率",
            "启用率",
            "留存活跃",
            "7日激活率",
            "激活率",
            "新用户激活",
            "产品激活",
            "试用激活",
            "onboarding完成率",
            "核心配置完成率",
        ],
        "likely_numerator_fields": [
            "active_user",
            "is_active",
            "used_feature",
            "usage_event_count",
            "activated_within_7d",
            "is_activated",
            "activation_flag",
            "completed_activation",
            "activated_user",
            "activation_status",
            "completed_core_setup",
            "setup_completed",
            "onboarding_completed",
        ],
        "likely_denominator_fields": [
            "user_id",
            "account_id",
            "tenant_id",
            "eligible_user_count",
            "signup_id",
            "workspace_id",
            "trial_user_id",
            "registered_user_id",
        ],
        "dimension_hints": {
            "signup_channel": "注册来源渠道",
            "acquisition_channel": "获客渠道",
            "industry": "用户所属行业",
            "company_size": "公司规模",
            "plan_type": "套餐类型",
            "region": "地区",
            "attended_onboarding": "是否参加 onboarding",
            "onboarding_status": "onboarding 状态",
            "completed_core_setup": "是否完成核心配置",
            "setup_status": "配置完成状态",
            "used_template": "是否使用模板",
            "activation_blocker_reason": "激活阻塞原因",
            "account_segment": "客户分层",
            "product_module": "产品模块",
            "team_size": "团队规模",
            "role": "用户角色",
        },
        "auxiliary_hints": {
            "first_login_minutes": "首次登录耗时",
            "support_first_response_minutes": "客服首次响应时间",
            "trial_days_left": "试用剩余天数",
            "invited_team_members": "邀请团队成员数",
            "session_count": "会话次数",
            "feature_events": "功能事件数",
            "last_active_date": "最近活跃日期",
        },
        "forbidden_terms": ["优惠券", "GMV", "作业", "游戏", "物流"],
    },
    {
        "scenario_id": "subscription_retention",
        "domain_label": "会员订阅 / 续费流失分析",
        "description": "适合分析会员续费率、订阅流失率、取消订阅和套餐变化相关异常。",
        "business_keywords": ["会员", "订阅", "续费", "流失", "取消", "套餐", "付费"],
        "metric_keywords": ["续费率", "流失率", "取消率", "订阅留存", "付费留存"],
        "likely_numerator_fields": ["renewed", "is_renewed", "churned", "cancelled", "retained"],
        "likely_denominator_fields": ["subscription_id", "member_id", "user_id", "eligible_subscription_id"],
        "dimension_hints": {
            "plan_type": "套餐类型",
            "billing_cycle": "计费周期",
            "acquisition_channel": "获客渠道",
            "member_segment": "会员分层",
            "cancel_reason": "取消原因",
        },
        "auxiliary_hints": {
            "subscription_amount": "订阅金额",
            "tenure_days": "订阅时长",
            "discount_used": "折扣使用情况",
        },
        "forbidden_terms": ["游戏", "作业", "客服工单", "物流"],
    },
    {
        "scenario_id": "marketing_conversion",
        "domain_label": "营销活动 / 转化率分析",
        "description": "适合分析广告、活动、落地页或渠道投放带来的曝光到转化异常。",
        "business_keywords": ["营销", "活动", "广告", "投放", "落地页", "曝光", "点击", "转化"],
        "metric_keywords": ["转化率", "点击率", "注册率", "线索率", "投放转化"],
        "likely_numerator_fields": ["converted", "conversion_count", "signup_count", "lead_count", "purchase_count"],
        "likely_denominator_fields": ["impression_id", "impressions", "click_id", "click_count", "visitor_id"],
        "dimension_hints": {
            "campaign": "活动",
            "ad_group": "广告组",
            "traffic_source": "流量来源",
            "creative_type": "创意类型",
            "landing_page": "落地页",
            "audience_segment": "受众分层",
        },
        "auxiliary_hints": {
            "cost": "投放成本",
            "cpc": "点击成本",
            "ctr": "点击率",
            "roas": "广告回报",
        },
        "forbidden_terms": ["作业", "游戏", "客服工单", "物流"],
    },
    {
        "scenario_id": "logistics_fulfillment",
        "domain_label": "物流履约 / 延迟率分析",
        "description": "适合分析发货延迟、配送超时、履约异常和物流节点问题。",
        "business_keywords": ["物流", "履约", "发货", "配送", "延迟", "仓库", "运单", "签收"],
        "metric_keywords": ["延迟率", "准时率", "配送超时率", "履约时长", "签收率"],
        "likely_numerator_fields": ["is_delayed", "delay_flag", "late_delivery", "timeout_flag"],
        "likely_denominator_fields": ["shipment_id", "order_id", "tracking_id", "package_id"],
        "dimension_hints": {
            "warehouse_region": "仓库区域",
            "destination_region": "目的地区域",
            "service_level": "配送服务等级",
            "package_size": "包裹大小",
            "route_type": "线路类型",
            "weather_condition": "天气",
            "warehouse": "仓库",
            "carrier": "承运商",
            "region": "配送区域",
            "delivery_type": "配送方式",
            "route": "线路",
            "city": "城市",
        },
        "auxiliary_hints": {
            "ship_minutes": "发货耗时",
            "delivery_minutes": "配送耗时",
            "distance": "配送距离",
            "weather": "天气",
        },
        "forbidden_terms": ["作业", "游戏", "客服SLA", "完播"],
    },
    {
        "scenario_id": "recruiting_funnel",
        "domain_label": "招聘漏斗 / 面试转化分析",
        "description": "适合分析候选人从投递、筛选、面试到 offer 的漏斗转化异常。",
        "business_keywords": ["招聘", "候选人", "面试", "简历", "Offer", "岗位", "漏斗"],
        "metric_keywords": ["面试转化率", "简历通过率", "Offer率", "入职率", "漏斗转化"],
        "likely_numerator_fields": ["interviewed", "passed_screen", "offer_accepted", "hired"],
        "likely_denominator_fields": ["candidate_id", "application_id", "resume_id"],
        "dimension_hints": {
            "job_role": "岗位",
            "recruiting_channel": "招聘渠道",
            "candidate_source": "候选人来源",
            "interviewer": "面试官",
            "location": "城市 / 地点",
            "seniority": "资历层级",
        },
        "auxiliary_hints": {
            "screen_score": "简历筛选评分",
            "interview_score": "面试评分",
            "time_to_stage": "阶段推进时长",
        },
        "forbidden_terms": ["优惠券", "GMV", "游戏", "作业", "物流"],
    },
    {
        "scenario_id": "community_engagement",
        "domain_label": "社区运营 / 活跃互动分析",
        "description": "适合分析社区发帖、评论、点赞、互动率和创作者活跃异常。",
        "business_keywords": ["社区", "互动", "发帖", "评论", "点赞", "分享", "创作者", "活跃"],
        "metric_keywords": ["互动率", "发帖率", "评论率", "活跃率", "参与率"],
        "likely_numerator_fields": ["engaged", "comment_count", "like_count", "post_count", "share_count"],
        "likely_denominator_fields": ["user_id", "post_id", "impression_count", "active_user_count"],
        "dimension_hints": {
            "community": "社区 / 圈子",
            "topic": "话题",
            "content_type": "内容类型",
            "creator_type": "创作者类型",
            "traffic_source": "流量来源",
            "user_segment": "用户分层",
        },
        "auxiliary_hints": {
            "moderation_status": "审核状态",
            "follow_count": "关注数",
            "share_count": "分享数",
        },
        "forbidden_terms": ["优惠券", "GMV", "作业", "客服工单", "物流"],
    },
]


def list_scenario_profiles() -> list[dict[str, str]]:
    """Return basic profile metadata without field-level hints."""

    return [
        {
            "scenario_id": profile["scenario_id"],
            "domain_label": profile["domain_label"],
            "description": profile["description"],
        }
        for profile in SCENARIO_PROFILES
    ]


def get_scenario_profile(scenario_id: str) -> dict[str, Any] | None:
    """Return a scenario profile by id."""

    for profile in SCENARIO_PROFILES:
        if profile["scenario_id"] == scenario_id:
            return deepcopy(profile)
    return None


def match_scenario_profile(
    business_problem: str,
    metric_definition: str,
    field_names: list[str] | tuple[str, ...],
) -> dict[str, Any]:
    """Match the nearest scenario profile using simple keyword scoring.

    This intentionally avoids LLM calls and external services. The score is a
    lightweight confidence hint for future semantic_context work, not a final
    classification result.
    """

    problem_text = _normalize_text(business_problem)
    metric_text = _normalize_text(metric_definition)
    normalized_fields = [_normalize_text(field_name) for field_name in field_names]

    best_match: dict[str, Any] | None = None

    for profile in SCENARIO_PROFILES:
        raw_score = 0.0
        matched_reasons: list[str] = []

        raw_score += _score_keywords(
            profile["business_keywords"],
            problem_text,
            3.0,
            "业务问题匹配",
            matched_reasons,
        )
        raw_score += _score_keywords(
            profile["metric_keywords"],
            metric_text,
            4.0,
            "指标口径匹配",
            matched_reasons,
        )
        raw_score += _score_field_keywords(
            profile["likely_numerator_fields"],
            normalized_fields,
            3.0,
            "疑似分子字段匹配",
            matched_reasons,
        )
        raw_score += _score_field_keywords(
            profile["likely_denominator_fields"],
            normalized_fields,
            2.5,
            "疑似分母字段匹配",
            matched_reasons,
        )
        raw_score += _score_field_keywords(
            list(profile["dimension_hints"].keys()),
            normalized_fields,
            1.5,
            "维度字段匹配",
            matched_reasons,
        )
        raw_score += _score_field_keywords(
            list(profile["auxiliary_hints"].keys()),
            normalized_fields,
            1.0,
            "辅助字段匹配",
            matched_reasons,
        )

        normalized_score = min(raw_score / 20.0, 1.0)
        candidate = {
            "scenario_id": profile["scenario_id"],
            "score": round(normalized_score, 4),
            "domain_label": profile["domain_label"],
            "matched_reasons": matched_reasons[:12],
        }

        if best_match is None or candidate["score"] > best_match["score"]:
            best_match = candidate

    if best_match is None:
        return {
            "scenario_id": "",
            "score": 0.0,
            "domain_label": "",
            "matched_reasons": [],
        }

    return best_match


def _normalize_text(value: str) -> str:
    return str(value or "").strip().lower()


def _score_keywords(
    keywords: list[str],
    text: str,
    weight: float,
    reason_prefix: str,
    matched_reasons: list[str],
) -> float:
    score = 0.0
    for keyword in keywords:
        normalized_keyword = _normalize_text(keyword)
        if normalized_keyword and normalized_keyword in text:
            score += weight
            matched_reasons.append(f"{reason_prefix}：{keyword}")
    return score


def _score_field_keywords(
    keywords: list[str],
    field_names: list[str],
    weight: float,
    reason_prefix: str,
    matched_reasons: list[str],
) -> float:
    score = 0.0
    for keyword in keywords:
        normalized_keyword = _normalize_text(keyword)
        if not normalized_keyword:
            continue
        for field_name in field_names:
            if normalized_keyword in field_name:
                score += weight
                matched_reasons.append(f"{reason_prefix}：{keyword} -> {field_name}")
                break
    return score
