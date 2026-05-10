# Sova AI / MetricFlow AI API 契约

本文件记录当前主要后端 API。实现细节以代码为准，本文件用于开发前快速了解输入输出边界。

## GET /health

用途：
后端健康检查。

输入核心字段：
无。

输出核心字段：

- `status`

fallback：
不涉及。

## POST /api/readiness/evaluate

用途：
根据当前业务澄清状态返回分析就绪进度、当前阶段、已确认信息、待确认信息和下一步问题。

输入核心字段：

- `businessProblem`
- `metricDefinition`
- `comparisonPeriod`
- `dimensions`
- `changeFactors`
- `dataStatus`

输出核心字段：

- `progress`
- `current_stage`
- `status_text`
- `confirmed_info`
- `missing_info`
- `next_question`

fallback：
当前为 rule-based / mock readiness evaluator，不依赖真实 LLM。

## POST /api/data/upload

用途：
上传 CSV / Excel 文件，使用 Pandas 读取并返回 Schema 识别结果。

输入核心字段：

- `files` 或 `file`
- `dimensions`
- `business_context`

输出核心字段：

- `upload_id`
- `files`
- `filename`
- `table_name`
- `row_count`
- `column_count`
- `columns`
- `sample_rows`
- `supported_analysis`
- `missing_requirements`

fallback：
不涉及 LLM fallback。读取失败时返回中文错误。

说明：
`business_context` 可选，用于传入当前业务澄清语义，例如业务场景、指标名称、已选维度和数据需求。上传接口会结合该上下文判断“当前数据可支持的分析”和“当前数据暂不支持的部分”，避免在非电商场景默认提示优惠券、GMV、商品、商家等无关能力。

## POST /api/analysis/plan

用途：
规则版分析计划生成与字段匹配。

输入核心字段：

- `business_problem`
- `metric_definition`
- `comparison_period`
- `dimensions`
- `change_factors`
- `uploaded_schema`

输出核心字段：

- `analysis_goal`
- `metric_summary`
- `field_mapping`
- `analysis_steps`
- `analysis_limitations`
- `next_action`

fallback：
这是本地 rule-based analysis planner，本身作为 `/api/llm/analysis-plan` 的 fallback。

## POST /api/analysis/execute

用途：
基于 `upload_id` 读取已保存上传文件，注册到 DuckDB 并执行固定规则基础分析。

输入核心字段：

- `upload_id`
- `analysis_plan`
- `business_problem`
- `metric_definition`
- `comparison_period`
- `dimensions`
- `change_factors`

输出核心字段：

- `execution_summary`
- `tables`
- `analysis_notes`
- `limitations`

fallback：
不涉及 LLM fallback。字段不足时返回中文限制说明。

## POST /api/metric-spec/build

用途：
根据上传后的 `semantic_context`、分析计划和上传 schema 生成结构化指标计算规格。该接口只生成 `metric_spec`，不执行 SQL，不调用 LLM，不生成图表或报告。

输入核心字段：

- `business_problem`
- `metric_definition`
- `semantic_context`
- `analysis_plan`
- `upload_schema`

输出核心字段：

- `metric_spec.metric_name`
- `metric_spec.metric_formula`
- `metric_spec.period_field`
- `metric_spec.time_field`
- `metric_spec.numerator`
- `metric_spec.denominator`
- `metric_spec.dimensions`
- `metric_spec.auxiliary_fields`
- `metric_spec.limitations`
- `source`
- `warnings`

说明：
`metric_spec` 优先来自 `semantic_context.primary_metric` 和 `semantic_context.field_roles`。当前阶段只定义计算口径，不改变 DuckDB 执行逻辑。

Stage 7B-2.1 后，SaaS / 产品增长类上传场景会将新用户 7 日激活率识别为率类指标，例如 `activated_within_7d / user_id`。`metric_spec` 应保留注册来源、行业、公司规模、套餐、地区、onboarding、核心配置、模板使用和激活阻塞原因等可用拆解维度；若缺少分子或分母字段，前端会提示检查字段语义识别，而不是继续执行指标计算。

## POST /api/metric-spec/execute

用途：
根据 `metric_spec` 对已上传的单表数据执行固定安全聚合，返回整体指标对比、维度拆解和 Top 异动分组。该接口不接受自由 SQL，不调用 LLM，不替换旧 `/api/analysis/execute`。

输入核心字段：

- `upload_id`
- `table_name` 可选
- `metric_spec`

输出核心字段：

- `metric_execution_result.overall_metric_comparison`
- `metric_execution_result.dimension_breakdowns`
- `metric_execution_result.top_movers`
- `metric_execution_result.auxiliary_metric_comparisons`
- `metric_execution_result.warnings`
- `metric_execution_result.source`

安全约束：
只允许 `metric_spec` 中已声明的分子、分母、周期、时间、维度和辅助字段进入查询。字段必须先通过 DuckDB 表 schema 白名单校验，并使用安全 identifier quote。当前仅支持单表聚合，不支持任意 WHERE 表达式、复杂 join 或 LLM SQL。

Stage 7B-5 后，Top movers 会按整体指标方向排序：整体下降时优先展示最负向分组，整体上升时优先展示最大上升分组。`auxiliary_metric_comparisons` 用于返回数值型辅助字段的上周均值、本周均值、变化值和变化百分比。

## POST /api/analysis/evidence

用途：
基于分析计划和 DuckDB 执行结果生成规则版证据链。

输入核心字段：

- `business_problem`
- `metric_definition`
- `comparison_period`
- `dimensions`
- `change_factors`
- `analysis_plan`
- `execution_result`
- `metric_execution_result` 可选。存在时优先使用 Metric Spec Executor 的整体指标对比、维度拆解和 Top 异动分组。

输出核心字段：

- `summary`
- `evidence_chains`
- `limitations`

fallback：
当前为 rule-based evidence generator，本身作为 `/api/llm/evidence` 的 fallback。Stage 7B-3 后，如果传入 `metric_execution_result`，证据链会优先引用真实指标率、分子分母变化和 Top movers；未传时保持旧结果表证据链流程。

## POST /api/analysis/report

用途：
基于业务澄清结果、分析计划、执行结果和证据链生成规则版报告草稿。

输入核心字段：

- `business_problem`
- `metric_definition`
- `comparison_period`
- `dimensions`
- `change_factors`
- `analysis_plan`
- `execution_result`
- `metric_execution_result` 可选。存在时优先使用 Metric Spec Executor 的真实指标结果。
- `evidence_result`

输出核心字段：

- `title`
- `sections`
- `disclaimer`

fallback：
当前为 rule-based report generator，本身作为 `/api/llm/report` 的 fallback。Stage 7B-3 后，如果传入 `metric_execution_result`，报告会优先写入真实指标变化、分子分母变化和 Top movers；未传时保持旧报告流程。

## POST /api/llm/test

用途：
测试用户配置的 OpenAI-compatible LLM 服务是否可用。

输入核心字段：

- `provider`
- `api_key`
- `base_url`
- `model`

输出核心字段：

- `success`
- `message`

fallback：
不做业务 fallback。接口只做连接测试，失败时返回中文错误。API Key 不持久化、不记录完整值。

## POST /api/llm/metric-definitions

用途：
当用户已配置 API 时，调用真实 LLM 识别指标类型并生成前三张候选指标口径卡片。

输入核心字段：

- `business_problem`
- `provider`
- `api_key`
- `base_url`
- `model`

输出核心字段：

- `source`
- `metric_name`
- `metric_type`
- `detected_scenario`
- `cards`
- `fallback_reason`

fallback：
支持。未配置 API、调用失败、HTTP 错误、JSON 解析失败、字段缺失或候选卡片不是 3 张时，自动回退到本地 rule-based metric definition generator。第四张“自定义口径”卡片始终固定保留。

说明：
Stage 7A 后，前端“开始澄清”优先使用 `/api/llm/business-clarification` 一次性生成指标口径、分析维度、近期变化因素和数据需求。该接口保留用于兼容旧的单独指标口径生成链路。

## POST /api/llm/business-clarification

用途：
当用户已配置 API 时，调用真实 LLM 根据业务问题动态生成完整澄清卡片，避免固定电商模板污染非电商场景。

输入核心字段：

- `business_problem`
- `provider`
- `api_key`
- `base_url`
- `model`

输出核心字段：

- `source`
- `business_domain`
- `metric_name`
- `detected_scenario`
- `metric_definition_cards`
- `dimension_cards`
- `change_factor_cards`
- `data_requirements`
- `irrelevant_terms`
- `fallback_reason`

fallback：
支持。未配置 API、调用失败、HTTP 错误、JSON 解析失败或结构不合规时，自动回退到本地规则版业务澄清生成器。系统固定保留“自定义口径”“自定义维度”“暂无明显变化”“不确定”等兜底卡片。LLM 只生成澄清卡片和数据需求，不生成 SQL、不执行分析。

说明：
该接口会优先使用 OpenAI-compatible `response_format: {"type":"json_object"}` 约束 JSON 输出；如果服务商不兼容导致 HTTP 400，会自动重试普通请求。游戏、内容、教育、通用业务等非电商场景不应默认出现优惠券、GMV、商品、商家、渠道投放等无关词。

## POST /api/llm/analysis-plan

用途：
当用户已配置 API 时，调用真实 LLM 生成结构化分析计划。

输入核心字段：

- `business_problem`
- `metric_definition`
- `comparison_period`
- `dimensions`
- `change_factors`
- `uploaded_schema`
- `supported_analysis`
- `missing_requirements`
- `provider`
- `api_key`
- `base_url`
- `model`

输出核心字段：

- `source`
- `analysis_goal`
- `metric_summary`
- `field_mapping`
- `analysis_steps`
- `analysis_limitations`
- `next_action`
- `fallback_reason`

fallback：
支持。未配置 API、调用失败、HTTP 错误、JSON 解析失败、字段缺失或状态值不合规时，自动回退到 `/api/analysis/plan` 对应的 rule-based analysis planner。
实现说明：
该接口会尽量使用 OpenAI-compatible `response_format: {"type": "json_object"}` 约束模型输出 JSON；如果服务商因不支持 `response_format` 返回 HTTP 400，会自动重试一次不带 `response_format` 的请求。传给 LLM 的 schema 会压缩为文件名、行数、字段名、字段类型、缺失率、当前可支持分析和缺失字段提示，不包含样例行。

## POST /api/llm/evidence

用途：
当用户已配置 API 时，调用真实 LLM 基于业务问题、分析计划和 DuckDB 执行结果生成结构化证据链。

输入核心字段：

- `business_problem`
- `metric_definition`
- `comparison_period`
- `dimensions`
- `change_factors`
- `analysis_plan`
- `execution_result`
- `provider`
- `api_key`
- `base_url`
- `model`

输出核心字段：

- `source`
- `summary`
- `evidence_chains`
- `limitations`
- `fallback_reason`

fallback：
支持。未配置 API、调用失败、HTTP 错误、JSON 解析失败、字段缺失、证据链结构不合规或引用了不存在的结果表时，自动回退到 `/api/analysis/evidence` 对应的 rule-based evidence generator。LLM 不重新计算数据、不生成 SQL、不生成报告。

实现说明：
该接口会尽量使用 OpenAI-compatible `response_format: {"type":"json_object"}` 约束模型输出 JSON；如果服务商因不支持 `response_format` 返回 HTTP 400，会自动重试一次不带 `response_format` 的请求。传给 LLM 的 `execution_result` 会压缩为执行摘要、结果表 id / 标题 / 说明 / 字段 / 前 10 行、analysis_notes 和 limitations，避免大表格导致输出截断。返回会校验 `summary`、`evidence_chains`、`limitations` 以及每条证据链的必要字段。

## POST /api/llm/report

用途：
当用户已配置 API 时，调用真实 LLM 基于业务澄清、分析计划、DuckDB 执行结果和证据链生成中文报告草稿。

输入核心字段：

- `business_problem`
- `metric_definition`
- `comparison_period`
- `dimensions`
- `change_factors`
- `analysis_plan`
- `execution_result`
- `evidence_result`
- `provider`
- `api_key`
- `base_url`
- `model`

输出核心字段：

- `source`
- `title`
- `sections`
- `disclaimer`
- `fallback_reason`

fallback：
支持。未配置 API、调用失败、HTTP 错误、JSON 解析失败、字段缺失或 `sections` 少于 6 个时，自动回退到 `/api/analysis/report` 对应的 rule-based report generator。LLM 不重新计算数据、不生成 SQL、不声称因果结论。

## LLM 安全与兼容性

- API Key 只随本次请求传入，不写入代码仓库、后端文件、数据库或日志。
- GPT-5 系列模型使用 `max_completion_tokens`，不发送 `temperature` / `top_p` / `max_tokens`，并默认 `reasoning_effort: "none"`。
- 非 GPT-5 模型继续使用 `max_tokens` 和 `temperature`。
- HTTP 400 会尽量读取服务商返回的 `error.message`，方便排查模型 ID 或参数兼容问题。
- 启用 JSON mode 的 LLM 调用如果遇到服务商不兼容导致 HTTP 400，应自动回退为普通 Chat Completions 请求再试一次。

## Stage 7A.1 API 补充：`/api/data/upload` semantic_context

`POST /api/data/upload` 返回中新增：
- `semantic_context.scenario_match`
- `semantic_context.business_domain`
- `semantic_context.primary_metric`
- `semantic_context.field_roles`
- `semantic_context.supported_analysis`
- `semantic_context.unsupported_analysis`
- `semantic_context.irrelevant_modules`

`supported_analysis` 和 `missing_requirements` 继续保留兼容字段，但其内容应从 `semantic_context.supported_analysis` / `semantic_context.unsupported_analysis` 派生。

上传请求的 `business_context` 可包含：
- `businessProblem`
- `businessDomain`
- `metricName`
- `metricDefinition`
- `selectedDimensions`
- `selectedChangeFactors`
- `dataRequirements`
- 可选 `llmSettings`

安全要求：`llmSettings.apiKey` 只允许随本次请求用于语义理解，不写入文件、数据库或日志，也不在响应中返回完整 Key。未配置或调用失败时使用本地 rule-based semantic fallback。

## Stage 7A.2-2 API 补充：Scenario Profiles 接入 semantic_context

`POST /api/data/upload` 现在会在生成 `semantic_context` 时调用 Scenario Profiles 的轻量匹配逻辑。匹配输入来自上传请求中的 `business_context` 和上传 schema 字段名：
- `businessProblem`
- `metricDefinition`
- `selectedDimensions`
- `selectedChangeFactors`
- 上传字段名

当匹配分数达到可信阈值时，返回会包含：
- `semantic_context.scenario_match.scenario_id`
- `semantic_context.scenario_match.score`
- `semantic_context.scenario_match.domain_label`
- `semantic_context.scenario_match.matched_reasons`

Scenario Profiles 只作为语义提示，用于辅助业务场景、分子 / 分母字段、维度字段和辅助指标解释；它不会改变 DuckDB 执行、图表、证据链或报告主流程。
