# Semantic Regression Test Cases

本文件记录 Stage 7A.2-1 的语义回归测试场景。它用于约束后续 `semantic_context`、Scenario Profiles 和字段解释逻辑，不代表当前阶段已经接入主流程。

## 通用验收规则

1. 不能只靠字段名中的 `amount` / `channel` / `user` / `city` / `coupon` 判断语义。
2. 必须结合 `business_problem`、`metric_definition`、`selected_dimensions`、`change_factors` 和 `schema`。
3. `unsupported_analysis` 只能显示当前场景相关缺失项。
4. 无关业务模块不能出现。
5. 分子 / 分母不确定时可以标记 low confidence，但明显字段存在时不能写“暂未明确匹配”。
6. 辅助指标不能跨场景串词，例如教育 `score` 不能显示 ACS，只有游戏 `acs_amount` 才能显示 ACS。
7. `supported_analysis` 必须优先来自用户已选维度和 `semantic_context`，而不是旧固定模板。

## A. 教育作业提交率下降

业务问题：
最近作业按时提交率明显下降，但作业发布量和学生人数没有明显下降。我想查一下是不是课程、作业类型、学生群体、提交平台、提醒方式、截止时间或者作业难度导致的。

字段：
`submission_id`, `student_id`, `assignment_id`, `submit_date`, `week_group`, `course_name`, `assignment_type`, `student_group`, `platform`, `reminder_channel`, `due_time_slot`, `instructor`, `difficulty_level`, `submitted_on_time`, `late_submission`, `final_submitted`, `score`, `time_spent_minutes`, `non_submit_reason`

期望：
- domain：教育学习 / 作业提交分析
- metric：作业按时提交率
- numerator：`submitted_on_time`
- denominator：`submission_id` 或 `assignment_id`
- dimensions：`course_name`, `assignment_type`, `student_group`, `platform`, `reminder_channel`, `due_time_slot`, `difficulty_level`
- `score`：成绩 / 辅助指标，不是 ACS
- 禁止污染：优惠券、GMV、商品、商家、游戏、客服

## B. 游戏胜率下降

字段：
`match_id`, `user_id`, `match_date`, `week_group`, `queue_type`, `map_channel`, `agent_category`, `user_type`, `city`, `side`, `result_win`, `acs_amount`, `headshot_rate`, `kills`, `deaths`, `assists`

期望：
- domain：游戏表现分析
- metric：胜率 / 排位胜率
- numerator：`result_win`
- denominator：`match_id`
- `map_channel`：地图
- `acs_amount`：ACS / 表现指标
- 禁止污染：优惠券、GMV、作业、客服

## C. 电商退款率上升

字段：
`order_id`, `user_id`, `order_date`, `week_group`, `city`, `channel`, `user_type`, `merchant_id`, `category`, `order_amount`, `is_refunded`, `refund_amount`, `return_reason`

期望：
- domain：电商交易 / 退款分析
- metric：退款率
- numerator：`is_refunded` 或 `refund_amount`
- denominator：`order_id` 或 `order_amount`
- dimensions：`channel`, `city`, `user_type`, `merchant_id`, `category`
- 可以出现：GMV、金额、商品、商家、渠道
- 禁止污染：游戏、作业、客服

## D. SaaS 客服 SLA 超时率上升

字段：
`ticket_id`, `customer_id`, `created_date`, `week_group`, `support_channel`, `issue_type`, `customer_segment`, `product_module`, `region`, `priority_level`, `agent_team`, `first_response_minutes`, `sla_target_minutes`, `is_sla_breached`, `resolved_minutes`, `csat_score`, `reopened`

期望：
- domain：客服支持 / 服务质量分析
- metric：SLA 超时率
- numerator：`is_sla_breached`
- denominator：`ticket_id`
- dimensions：`support_channel`, `issue_type`, `customer_segment`, `product_module`, `priority_level`, `agent_team`
- auxiliary：`first_response_minutes`, `csat_score`, `reopened`
- 禁止污染：优惠券、GMV、游戏、作业

## E. 内容完播率下降

字段：
`video_id`, `author_id`, `publish_date`, `week_group`, `content_type`, `author_type`, `video_duration_sec`, `traffic_source`, `play_count`, `complete_play_count`, `avg_watch_seconds`

期望：
- domain：内容运营分析
- metric：完播率
- numerator：`complete_play_count`
- denominator：`play_count`
- dimensions：`content_type`, `author_type`, `video_duration_sec`, `traffic_source`
- 禁止污染：优惠券、GMV、游戏、作业、客服

## F. 预约到场率下降

字段：
`reservation_id`, `student_id`, `booking_date`, `week_group`, `campus_zone`, `seat_area`, `time_slot`, `student_group`, `booking_source`, `weather`, `is_checked_in`, `cancel_before_start`, `minutes_late`, `study_duration_min`, `no_show_reason`

期望：
- domain：预约 / 空间使用分析
- metric：预约到场率
- numerator：`is_checked_in`
- denominator：`reservation_id`
- dimensions：`campus_zone`, `seat_area`, `time_slot`, `student_group`, `booking_source`, `weather`
- 禁止污染：优惠券、GMV、游戏、客服
