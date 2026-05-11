# SOVA AI 代码地图

本文件用于快速定位常见任务相关文件，减少无意义全项目扫描。

## 项目结构

```text
metricflow-ai/
  frontend/
    app/
    components/
    lib/
    package.json
  backend/
    main.py
    requirements.txt
    services/
    uploads/
  AGENTS.md
  API_CONTRACTS.md
  CODEMAP.md
  PROJECT_CONTEXT.md
  README.md
```

说明：

- `frontend/`：Next.js + React + Tailwind 前端
- `backend/`：FastAPI 后端
- `backend/uploads/`：上传文件临时目录，用于本地 DuckDB 分析衔接，不是数据库持久化
- `PROJECT_CONTEXT.md`：长期产品上下文
- `API_CONTRACTS.md`：API 契约索引
- `AGENTS.md`：代理开发规则

## Frontend 关键文件

- `frontend/components/metricflow-workspace.tsx`：主工作台页面，承载业务澄清、上传、分析计划、执行、图表、证据链和报告草稿的主流程
- `frontend/components/api-settings.tsx`：API 设置 Modal / Overlay
- `frontend/components/readiness-panel.tsx`：右侧分析就绪面板
- `frontend/components/analysis-charts.tsx`：基础图表展示
- `frontend/components/evidence-chain.tsx`：证据链展示
- `frontend/components/report-draft.tsx`：报告草稿展示与复制
- `frontend/lib/readiness.ts`：前端 readiness 状态与本地评估逻辑
- `frontend/lib/metric-definition.ts`：本地 rule-based 指标口径生成
- `frontend/lib/llm-metric-definition.ts`：LLM 指标口径生成请求封装
- `frontend/lib/llm-settings.ts`：API 设置读写、保存方式和连接测试请求
- `frontend/lib/data-upload.ts`：数据上传请求封装
- `frontend/lib/analysis-plan.ts`：规则版分析计划请求封装
- `frontend/lib/llm-analysis-plan.ts`：LLM 分析计划请求封装
- `frontend/lib/analysis-execution.ts`：DuckDB 基础分析执行请求封装
- `frontend/lib/evidence-chain.ts`：证据链请求封装
- `frontend/lib/llm-evidence-chain.ts`：LLM 证据链生成请求封装
- `frontend/lib/report-draft.ts`：报告草稿请求封装
- `frontend/lib/llm-report-draft.ts`：LLM 报告草稿生成请求封装

## Backend 关键文件

- `backend/main.py`：FastAPI 应用和 API 路由注册
- `backend/services/readiness_evaluator.py`：规则版分析就绪评估
- `backend/services/clarifier.py`：澄清相关服务骨架
- `backend/services/data_loader.py`：上传文件读取、字段清洗、Schema 识别
- `backend/services/analysis_planner.py`：规则版分析计划与字段匹配
- `backend/services/analysis_plan_llm.py`：LLM 分析计划生成与 fallback
- `backend/services/duckdb_executor.py`：Pandas 读取、DuckDB 注册、固定 SQL 基础分析
- `backend/services/evidence_generator.py`：规则版证据链生成
- `backend/services/evidence_llm.py`：LLM 证据链生成与 fallback
- `backend/services/report_generator.py`：规则版报告草稿生成
- `backend/services/report_llm.py`：LLM 报告草稿生成与 fallback
- `backend/services/metric_definition_llm.py`：LLM 指标识别与口径卡片生成，包含本地 fallback
- `backend/services/llm_client.py`：OpenAI-compatible LLM 调用、连接测试、模型参数兼容和错误信息处理
- `backend/services/scenario_profiles.py`：Scenario Profiles 场景原型库和轻量匹配工具函数，Stage 7A.2-1 暂未接入主流程

## 常见任务入口

### API 设置相关

优先查看：

- `frontend/components/api-settings.tsx`
- `frontend/lib/llm-settings.ts`
- `backend/services/llm_client.py`
- `backend/main.py`

不要默认查看 DuckDB、证据链或报告文件。

### 指标口径生成相关

优先查看：

- `frontend/lib/metric-definition.ts`
- `frontend/lib/llm-metric-definition.ts`
- `frontend/lib/business-clarification.ts`
- `frontend/components/metricflow-workspace.tsx`
- `backend/services/business_clarification_llm.py`
- `backend/services/metric_definition_llm.py`
- `backend/services/llm_client.py`
- `backend/main.py`

注意：第四张“自定义口径”卡片必须固定保留。LLM 失败必须 fallback 到本地规则。

### 动态业务澄清相关

优先查看：

- `frontend/lib/business-clarification.ts`
- `frontend/components/metricflow-workspace.tsx`
- `backend/services/business_clarification_llm.py`
- `backend/services/llm_client.py`
- `backend/main.py`

说明：Stage 7A 后，前端点击“开始澄清”会优先调用 `/api/llm/business-clarification`，一次性生成指标口径卡片、分析维度卡片、近期变化因素卡片和数据需求。不要把固定电商模板默认用于所有场景；非电商场景不应出现优惠券、GMV、商品、商家等无关词。rule-based fallback 必须保留。

### 分析计划相关

优先查看：

- `frontend/lib/analysis-plan.ts`
- `frontend/lib/llm-analysis-plan.ts`
- `frontend/components/metricflow-workspace.tsx`
- `backend/services/analysis_planner.py`
- `backend/services/analysis_plan_llm.py`
- `backend/services/llm_client.py`
- `backend/main.py`

注意：LLM 只生成分析计划，不生成 SQL，不执行 DuckDB。
实现要点：`backend/services/analysis_plan_llm.py` 会压缩上传 schema 后再发给模型，并优先使用 JSON mode；如果服务商不支持 `response_format` 返回 HTTP 400，`backend/services/llm_client.py` 会自动重试普通请求。rule-based analysis planner 必须继续作为 fallback。

### 数据上传与 Schema 识别相关

优先查看：

- `frontend/lib/data-upload.ts`
- `frontend/components/metricflow-workspace.tsx`
- `backend/services/data_loader.py`
- `backend/main.py`

注意：上传文件保存到 `backend/uploads/{upload_id}/`，该目录不应提交。Stage 7A 后，上传请求可附带 `business_context`，字段语义识别应结合当前业务澄清结果，不要默认输出电商化支持项或缺失项。

### DuckDB 执行相关

优先查看：

- `backend/services/duckdb_executor.py`
- `frontend/lib/analysis-execution.ts`
- `frontend/components/metricflow-workspace.tsx`
- `backend/main.py`

注意：当前只做固定规则 SQL，不做自动 SQL 生成。

### 图表相关

优先查看：

- `frontend/components/analysis-charts.tsx`
- `frontend/components/metricflow-workspace.tsx`
- `frontend/lib/analysis-execution.ts`

注意：当前只做基础折线图、柱状图和指标卡片，不做复杂 Dashboard。

### 证据链相关

优先查看：

- `backend/services/evidence_generator.py`
- `backend/services/evidence_llm.py`
- `frontend/lib/evidence-chain.ts`
- `frontend/lib/llm-evidence-chain.ts`
- `frontend/components/evidence-chain.tsx`
- `frontend/components/metricflow-workspace.tsx`
- `backend/main.py`

说明：LLM 证据链只基于 DuckDB 执行结果做谨慎总结，不重新计算数据，不生成 SQL，也不生成报告。`backend/services/evidence_llm.py` 会压缩 `execution_result` 后再发给模型，并优先使用 JSON mode；如果服务商不支持 `response_format` 返回 HTTP 400，`backend/services/llm_client.py` 会自动重试普通请求。`backend/services/evidence_generator.py` 必须继续作为 fallback 保留。

### 报告草稿相关

优先查看：

- `backend/services/report_generator.py`
- `backend/services/report_llm.py`
- `frontend/lib/report-draft.ts`
- `frontend/lib/llm-report-draft.ts`
- `frontend/components/report-draft.tsx`
- `frontend/components/metricflow-workspace.tsx`
- `backend/main.py`

注意：LLM 报告草稿只整理现有业务信息、结果表和证据链，不重新计算数据，不生成 SQL，不输出强因果结论。当前不做 Word / PDF 导出，不生成正式报告定稿，`backend/services/report_generator.py` 必须继续作为 fallback 保留。

### Readiness / 分析就绪面板相关

优先查看：

- `frontend/lib/readiness.ts`
- `frontend/components/readiness-panel.tsx`
- `backend/services/readiness_evaluator.py`
- `frontend/components/metricflow-workspace.tsx`

注意：分析就绪进度不显示百分比数字。

### Stage 7A.1 字段语义映射相关

优先查看：
- `backend/services/data_loader.py`
- `frontend/lib/data-upload.ts`
- `frontend/components/metricflow-workspace.tsx`

说明：数据上传后由 `backend/services/data_loader.py` 生成统一 `semantic_context`，再派生“当前数据可支持的分析”和“当前数据暂不支持的部分”。该逻辑必须结合业务问题、指标口径、已选维度和字段结构判断，不能默认套用优惠券、GMV、金额、商品、商家等固定模板。

### Stage 7A.2 Scenario Profiles 与语义回归相关

优先查看：
- `backend/services/scenario_profiles.py`
- `SEMANTIC_TEST_CASES.md`
- `backend/services/data_loader.py`

说明：Stage 7A.2-1 只建立 Scenario Profiles 和语义回归测试文档，不接入 `data_loader.py` 主流程。后续 Stage 7A.2-2 才将场景原型匹配结果接入 `semantic_context`，用于辅助业务场景分类和字段语义解释。

Stage 7A.2-2 已接入：
- `frontend/lib/data-upload.ts`：上传时通过 `business_context` 传递业务上下文 JSON，不手动设置 `Content-Type`。
- `frontend/components/metricflow-workspace.tsx`：上传调用会传递业务问题、指标口径、已选维度、近期变化因素和数据需求，并在“数据字段理解”中展示 `scenario_match`。
- `backend/services/data_loader.py`：生成 `semantic_context` 时调用 `match_scenario_profile()`，并用 profile hints 辅助字段语义判断。

Stage 7A.2-3 已修正：
- `backend/services/scenario_profiles.py`：物流履约 profile 补充仓库区域、目的地区域、服务等级、包裹大小、线路类型、天气等字段 hints。
- `backend/services/data_loader.py`：高置信 profile domain 优先；profile `dimension_hints` 支持精确字段名和关键词匹配；已命中的维度字段不会再被列为 unsupported。
- `frontend/components/metricflow-workspace.tsx`：上传后 readiness 面板过滤旧固定模板中的用户、渠道、金额、优惠券类数据缺口，避免污染非相关场景。

Stage 7A.2-4 已修正：
- `frontend/components/metricflow-workspace.tsx`：readiness、分析计划“当前限制”和执行结果“当前限制”统一按 `semantic_context` 过滤旧模板限制，非相关场景不再默认显示用户、渠道、金额、优惠券、ACS 等污染项。
- `backend/services/data_loader.py`：本阶段仅做 py_compile 校验，未改执行计算逻辑。

### Stage 7B Metric Spec Builder 相关

优先查看：
- `backend/services/metric_spec_builder.py`
- `frontend/lib/metric-spec.ts`
- `frontend/components/metricflow-workspace.tsx`
- `backend/main.py`

说明：Stage 7B-1 只生成和展示结构化 `metric_spec`，用于描述指标公式、分子 / 分母、聚合方式、周期字段、时间字段、拆解维度和辅助字段。不执行 DuckDB，不生成 SQL，不改图表、证据链或报告。

Stage 7B-2 已接入：
- `backend/services/metric_spec_executor.py`：根据 `metric_spec` 对已上传单表数据执行固定安全聚合，生成整体指标对比、维度拆解和 Top 异动分组。
- `backend/main.py`：新增 `POST /api/metric-spec/execute`。
- `frontend/lib/metric-spec-execution.ts`：前端指标计算执行请求封装。
- `frontend/components/metricflow-workspace.tsx`：在“指标计算规格”区域新增“执行指标计算”按钮和结果展示。

说明：Stage 7B-2 不使用 LLM 生成 SQL，不支持自由 SQL，不做多表 join，不替换旧“执行基础分析”按钮，也不接入报告主流程。

Stage 7B-2.1 补强：
- `backend/services/scenario_profiles.py`：`saas_product_usage` 扩展为 SaaS 产品使用 / 用户激活分析，覆盖 7 日激活、onboarding、核心配置、试用激活、注册来源、行业、公司规模和套餐类型。
- `backend/services/data_loader.py`：规则版 `semantic_context` 增加 SaaS 激活率分子 / 分母、维度和辅助字段识别，避免把已存在的 `industry`、`company_size`、`plan_type` 误判为缺失。
- `backend/services/metric_spec_builder.py`：Metric Spec Builder 增加激活率、`signup_date`、`activated_within_7d / user_id` 等通用 SaaS 口径优先级。
- `frontend/components/metricflow-workspace.tsx`：指标规格缺少分子或分母时提示检查字段语义识别，不继续执行指标计算。

Stage 7B-5 横向稳定性修复：
- `backend/services/metric_spec_executor.py`：Top movers 按整体指标上升 / 下降方向排序，并新增辅助数值字段均值对比 `auxiliary_metric_comparisons`。
- `backend/services/scenario_profiles.py`、`backend/services/data_loader.py`：补强客服处理团队、游戏排队类型 / 队列类型、组队字段等跨场景字段一致性。
- `backend/services/duckdb_executor.py`：旧基础分析保留，但按场景命名 `map_channel`、`signup_channel`、`support_channel`，并避免非相关场景默认展示优惠券、金额或缺少用户字段限制。
- `backend/services/evidence_generator.py`、`backend/services/report_generator.py`：证据链和报告可引用辅助指标均值对比。
- `frontend/components/metricflow-workspace.tsx`、`frontend/lib/metric-spec-execution.ts`：指标计算结果展示本周分母和辅助指标对比。

Stage 7B-3 已接入：
- `frontend/lib/evidence-chain.ts`、`frontend/lib/llm-evidence-chain.ts`：证据链请求可携带 `metricExecutionResult`。
- `frontend/lib/report-draft.ts`、`frontend/lib/llm-report-draft.ts`：报告请求可携带 `metricExecutionResult`。
- `backend/services/evidence_generator.py`：当 `metric_execution_result` 存在时，优先生成整体指标变化、分子分母变化和 Top movers 证据链。
- `backend/services/report_generator.py`：当 `metric_execution_result` 存在时，报告优先写入真实指标结果和 Top movers。
- `backend/services/evidence_llm.py`、`backend/services/report_llm.py`：LLM prompt 携带并要求优先使用 `metric_execution_result`。

说明：Stage 7B-3 不删除旧 evidence/report API，不删除旧“执行基础分析”按钮。未传 `metric_execution_result` 时，旧流程继续可用。

### UI-3 异步任务过程反馈

优先查看：
- `frontend/lib/task-feedback.ts`
- `frontend/components/metricflow-workspace.tsx`

说明：UI-3 只新增前端任务状态与展示组件，覆盖上传数据、生成分析计划、执行指标计算、生成证据链和生成报告草稿。主区域显示任务进度卡片，右侧分析驾驶舱显示“系统正在执行”和当前子步骤；不改变 backend、API、上传接口、Metric Spec Builder / Executor、证据链、报告或数据计算逻辑。

### UI-4 结果区信息层级重排

优先查看：
- `frontend/components/metricflow-workspace.tsx`
- `frontend/components/evidence-chain.tsx`
- `frontend/components/report-draft.tsx`

说明：UI-4 只调整前端结果展示层级。Step 8 将指标计算结果作为主结论，Top movers、辅助指标和维度拆解作为解释层；维度拆解默认只展示前 1-2 个维度，其余折叠。Step 9 强化证据链卡片层级；Step 10 强化报告草稿的正式输出排版。

### UI-5 视觉收尾与首次使用体验

优先查看：
- `frontend/components/metricflow-workspace.tsx`
- `frontend/components/api-settings.tsx`
- `frontend/components/report-draft.tsx`

说明：UI-5 不改产品结构和分析链路，只统一 B2B SaaS dashboard 视觉、补充 Step 1 默认折叠的示例问题辅助入口、统一空状态和按钮状态，并优化小屏下右侧驾驶舱、步骤导航、长表格和报告正文的展示。Step 1 仍以业务问题输入框为主。
