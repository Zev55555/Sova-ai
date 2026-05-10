# MetricFlow AI 项目上下文

## 1. 产品定位

MetricFlow AI｜指标异动分析工作台 是一个面向中文用户的 AI 指标异动分析 Agent。

它不是普通的 Chat with CSV 工具，不是上传文件后随便问数据，也不是普通图表生成器。

它的核心是：
用户先用大白话描述一个业务指标异常问题，系统通过多轮业务澄清和“分析就绪进度”，把模糊业务问题转化为可执行的数据分析任务。只有当业务问题足够清晰后，才进入数据上传和数据分析阶段。

产品体验应像一位中文 AI 数据分析师在帮助用户澄清、结构化和调查指标异常，而不是一个碰巧能画图的通用聊天机器人。

## 2. MVP 场景与内置模板

MetricFlow AI 面向通用业务指标异动场景，不应被设计成只分析优惠券核销率。

当前已有一个重点内置模板：

优惠券核销率下降分析。

典型用户输入：
“最近优惠券核销率下降了，老板让我查一下原因。”

优惠券核销率是用于打磨主流程的内置模板，不是唯一场景。后续业务问题输入可以涉及 DAU / 活跃、转化率、GMV / 销售额、留存、退款等指标。

## 3. 核心产品流程

完整流程是：

1. 用户输入业务问题
2. AI 进行多轮业务澄清
3. 通过“分析就绪进度”展示当前业务问题是否足够清晰
4. Metric Definition Generator 根据用户问题生成候选指标口径
5. 确认指标口径
6. 确认对比周期
7. 确认分析维度
8. 确认近期变化因素，例如活动、投放、版本更新、A/B 实验
9. 进入数据准备阶段
10. 用户上传数据
11. Pandas 读取和清洗数据
12. DuckDB 执行 SQL 分析
13. 生成结果表、图表、证据链和报告草稿

产品哲学是：不要从数据开始，要从业务问题开始。

## 4. 当前 Stage 1 已完成内容

Stage 1 已经完成：

- 项目骨架
- 中文低保真 UI
- 业务问题输入
- 指标口径交互式卡片
- 自定义口径输入框
- 右侧“分析就绪面板”
- “分析就绪进度”
- 五个阶段标签：
  - 问题识别
  - 指标口径
  - 对比周期
  - 分析维度
  - 数据准备
- mock readiness evaluator
- FastAPI mock endpoint

## 5. Stage 2 目标

Stage 2 要扩展完整多轮业务澄清流程，但仍然不做数据上传和 DuckDB。

Stage 2 应完成：

- 对比周期确认
- 分析维度多选
- 近期变化因素确认
- 当前理解摘要
- 数据准备状态
- 数据需求提示
- 数据上传入口

当前 README 已记录 Stage 2 和 Stage 3A 已实现这些目标。后续开发时仍应保留这些能力，不要削弱或删除。

## 5A. Stage 2A 对比周期确认

Stage 2A 聚焦“对比周期确认”步骤。

用户确认指标口径后，主交互区应自动进入对比周期确认。问题文案使用通用表达：
“这次指标异动是和哪个时间段相比？”

对比周期选项继续使用交互式卡片，不使用竖向 radio list。卡片包括：

- 本周 vs 上周
- 本月 vs 上月
- 活动期 vs 活动前
- 自定义对比周期

选择自定义对比周期时，需要展示手动输入框。填写后才算确认。

确认对比周期后，右侧“分析就绪面板”应推进到“分析维度”阶段，已确认信息新增“对比周期：xxx”，待确认信息移除“对比周期”，下一步问题变为：
“你希望优先从哪些维度拆解这次指标异动？”

## 5B. Stage 2B 分析维度多选

Stage 2B 聚焦“分析维度选择”步骤。

用户确认对比周期后，主交互区应自动进入分析维度选择。问题文案为：
“你希望优先从哪些维度拆解这次指标异动？”

说明文案为：
“可以选择多个维度。系统后续会根据你选择的维度生成分析路径，并在上传数据后判断哪些维度可以被实际验证。”

分析维度选项继续使用交互式卡片，不使用竖向 checkbox list。当前内置维度包括：

- 用户类型
- 地区 / 城市
- 渠道来源
- 商品 / 商家 / 内容
- 时间粒度
- 自定义维度

分析维度支持多选、取消选择和自定义维度。至少选择一个维度后，“确认分析维度”按钮才可用。

确认分析维度后，右侧“分析就绪面板”仍可显示为“分析维度”阶段，但状态要指向下一步“近期变化因素确认”。已确认信息新增“优先拆解维度：xxx、xxx”，待确认信息移除“分析维度”，下一步问题变为：
“这段时间是否存在活动、投放、版本更新或 A/B 实验等变化？”

## 5C. Stage 2C 近期变化因素与数据准备

Stage 2C 聚焦“近期变化因素确认”和“数据准备状态”。

用户确认分析维度后，主交互区应自动进入近期变化因素确认。问题文案为：
“这段时间是否存在可能影响指标的业务变化？”

说明文案为：
“这些信息不会直接作为结论，但会帮助后续分析时判断哪些方向值得优先验证。”

近期变化因素继续使用交互式卡片，不使用竖向 checkbox list。当前内置选项包括：

- 运营活动 / 规则调整
- 渠道投放变化
- 产品版本更新
- A/B 实验
- 暂无明显变化
- 不确定

近期变化因素支持多选和取消选择。“暂无明显变化”和“不确定”是互斥选项：选择任一项时应取消其他变化因素；如果已选择任一项，再选择其他变化因素时应取消该互斥项。

确认变化因素后，右侧“分析就绪面板”进入“数据准备”阶段，已确认信息新增“近期变化因素：xxx”，待确认信息保留“数据需求”，下一步问题变为：
“请在下一阶段上传相关数据，系统将根据字段判断当前能分析到哪一步。”

进入数据准备阶段后，主区域应展示：

- 当前理解摘要
- 下一步需要的数据提示
- 数据上传入口

Stage 2C 结束时这里仍是 mock 上传按钮；Stage 3A 已将它升级为真实上传和 Schema 识别入口。

## 5D. Stage 3A 数据上传与 Schema 识别

Stage 3A 已将数据准备阶段的上传入口从 mock 按钮升级为真实数据上传和 Schema 识别。

用户完成业务澄清并进入“数据准备”阶段后，主区域会显示“上传数据”区域。上传区域支持点击或拖拽上传 CSV、Excel（.xlsx / .xls）文件。当前后端接口支持单文件和多文件表单结构，便于后续扩展多表分析。

后端新增 `POST /api/data/upload`，使用 Pandas 读取上传文件。CSV 使用 `pandas.read_csv`，Excel 使用 `pandas.read_excel`，多 sheet Excel 当前先读取第一个 sheet。

上传文件会保存到 `backend/uploads/{upload_id}/`，用于后续 DuckDB 阶段衔接。这不是数据库持久化，`uploads/` 目录不应提交到 Git。

Schema 识别返回内容包括：

- 文件名
- 表名
- 行数
- 字段数量
- 原始字段名
- 清洗后字段名
- 字段类型
- 缺失率
- 字段样例值
- 前 5 行样例数据

字段名清洗规则包括：去掉前后空格、转小写、空格替换为下划线、特殊字符尽量替换为下划线，并保留原始字段名。

系统会基于字段名做 rule-based 判断，返回“当前数据可支持的分析”，包括：

- 时间趋势分析
- 用户维度拆解
- 地区 / 城市拆解
- 渠道来源拆解
- 金额类指标分析
- 订单维度分析
- 优惠券领取 / 使用相关分析

系统还会结合用户前面选择的分析维度，返回“当前数据暂不支持的部分”。例如用户选择了“地区 / 城市”但字段中没有 city、region、province 等字段时，应提示“缺少城市或地区字段，暂时无法做地区维度拆解。”

上传成功后，右侧“分析就绪面板”应新增已确认信息：

- 数据状态：已上传并完成字段识别

待确认信息中的“数据需求”可以更新为：

- 数据需求：已初步满足

或在字段不足时提示：

- 数据字段匹配情况待确认

Stage 3A 仍然不实现 DuckDB、SQL 分析、图表、证据链、报告草稿或真实 LLM。Stage 3B 已将“生成分析计划”按钮升级为规则版真实功能。

## 5E. Stage 3B 分析计划生成与字段匹配

Stage 3B 新增规则版“分析计划生成 + 字段匹配”，仍然不接真实 LLM，不执行 DuckDB，不生成图表、证据链或报告。

用户上传数据并完成 Schema 识别后，点击“生成分析计划”会调用后端 `POST /api/analysis/plan`。请求会包含：

- 用户输入的业务问题
- 已确认的指标口径
- 已确认的对比周期
- 已选择的分析维度
- 已确认的近期变化因素
- 上传数据返回的 schema
- 当前可支持分析和缺失字段提示

后端会根据清洗后的字段名做 rule-based 字段匹配，重点识别：

- 时间字段
- 指标相关字段
- 用户字段
- 订单字段
- 城市 / 地区字段
- 渠道字段
- 金额字段
- 优惠券字段
- 用户类型字段
- 商家 / 商品字段

后端会根据用户选择的分析维度生成结构化分析步骤。例如：

- 按用户类型拆解指标变化
- 按城市或地区拆解指标变化
- 按渠道来源拆解指标变化
- 按商品、商家或业务对象拆解指标变化
- 按时间粒度观察指标异动

分析步骤状态使用：

- `ready`：字段基本满足，可进入下一阶段执行
- `partial`：部分字段满足，需要谨慎解释
- `blocked`：缺少关键字段，暂不支持完整执行

前端展示“分析计划”区域，包含：

- 分析目标
- 指标与周期
- 字段匹配情况
- 分析步骤
- 当前限制
- 下一步

如果用户尚未上传数据就点击“生成分析计划”，前端应提示：
“请先上传数据并完成字段识别。”

Stage 3B 的下一步说明固定为：
“下一阶段将基于该分析计划生成 DuckDB SQL 并执行分析。”

## 5F. Stage 4A DuckDB 数据注册与基础分析执行

Stage 4A 已进入 DuckDB 对应阶段，实现上传数据注册到 DuckDB，并执行第一批固定规则 SQL。

后端新增 `POST /api/analysis/execute`。请求会包含：

- `upload_id`
- 分析计划
- 用户输入的业务问题
- 指标口径
- 对比周期
- 分析维度
- 近期变化因素

后端会使用 Stage 3A 保存到 `backend/uploads/{upload_id}/` 的文件作为数据来源。执行时会重新用 Pandas 读取 CSV / Excel，按既有规则清洗字段名，然后将每个文件注册为 DuckDB 内存表。

本阶段只做固定规则 SQL，不做真实 LLM，不做自动 SQL 生成，不做图表、证据链或报告。

当前支持的基础分析结果表包括：

- 数据基础概览：展示表名、来源文件、行数、字段数
- 整体趋势分析：有时间字段时，按日期聚合记录数；有金额字段时补充金额总和；有订单字段时补充订单数
- 用户维度分析：有用户字段时，统计去重用户数；有用户类型字段时按用户类型聚合记录数和用户数
- 地区 / 城市分析：有 city / region / province / area 字段时，按地区聚合记录数和可选金额总和
- 渠道分析：有 channel / source / utm_source 字段时，按渠道聚合记录数和可选金额总和
- 金额分析：有金额字段时，计算总金额、平均金额、最大值、最小值
- 优惠券相关分析：有优惠券字段时，统计优惠券相关记录；有使用 / 核销字段时尝试计算可能使用率

优惠券相关分析不能强行输出最终核销率。如果无法准确判断领取数和使用数，应提示：
“当前字段支持优惠券使用相关分析，但领取口径和使用口径仍需进一步确认。”

前端在“分析计划”区域下方新增“执行基础分析”按钮。点击后会展示“分析执行结果”区域，包括：

- 执行摘要
- 多个结果表卡片
- 每个表最多展示前 20 行
- 当前限制
- 注意事项

如果用户没有上传数据或没有生成分析计划就点击“执行基础分析”，前端应提示：
“请先上传数据并生成分析计划。”

## 5G. Stage 4B 基础图表展示

Stage 4B 基于 `/api/analysis/execute` 返回的结果表，在前端生成基础可视化。本阶段不新增后端接口，不接真实 LLM，不生成报告，也不做复杂 BI / Dashboard。Stage 5A 已在此基础上补充规则版证据链。

图表库使用 Recharts。

前端在“分析执行结果”区域中新增“可视化分析”模块，说明文案为：
“系统根据当前结果表自动生成基础图表，用于快速观察指标变化和维度差异。”

图表生成规则：

- `overall_trend`：如果存在日期 / 时间字段和数值字段，生成“整体趋势变化”折线图，用于观察指标在时间维度上的变化趋势
- `user_breakdown`：生成“用户维度拆解”柱状图，用于观察不同用户群体的指标表现差异
- `region_breakdown`：生成“地区 / 城市拆解”柱状图，用于观察不同地区对指标变化的贡献
- `channel_breakdown`：生成“渠道来源拆解”柱状图，用于观察不同渠道来源下的指标表现
- `amount_summary`：不画复杂图，展示金额指标卡片，包括总金额、平均金额、最大值、最小值
- `coupon_summary`：展示优惠券相关指标卡片，包括总记录数、有优惠券字段记录数、可能使用记录数、可能使用率

如果某个结果表不适合可视化，不要强行画图。如果没有任何可视化数据，应显示：
“当前结果表暂不适合生成图表，可以继续查看表格结果。”

图表文案必须保持谨慎，不能写“这说明原因是……”。可以使用：

- 该图用于观察……
- 该维度可能值得进一步检查……
- 需要结合更多数据进一步验证……

## 5H. Stage 5A 规则版证据链

Stage 5A 基于 DuckDB 基础分析执行结果和前端基础图表，新增规则版“证据链”生成能力。

本阶段仍然不接真实 LLM，不生成完整报告，不做复杂 Dashboard，也不改变 DuckDB 执行逻辑。

后端新增 `POST /api/analysis/evidence`。请求包含：

- 业务问题
- 指标口径
- 对比周期
- 分析维度
- 近期变化因素
- 分析计划
- 基础分析执行结果

后端通过 rule-based / mock evidence generator 根据已有结果表生成证据链。当前支持：

- `overall_trend`：整体趋势类证据
- `user_breakdown`：用户维度证据
- `region_breakdown`：地区 / 城市维度证据
- `channel_breakdown`：渠道来源证据
- `amount_summary`：金额类证据
- `coupon_summary`：优惠券相关证据

如果用户选择了某个分析维度，但当前字段不足、没有对应结果表，证据链限制说明中应提示：
“用户选择了 xxx 维度，但当前字段不足，暂时无法生成该维度证据。”

前端在“可视化分析”之后新增“证据链”区域。点击“生成证据链”后调用 `/api/analysis/evidence`，并展示证据链卡片。每张卡片包含：

- 标题
- 初步发现
- 数据证据
- 相关结果表 / 图表
- 可信程度
- 下一步验证建议

如果尚未执行基础分析，前端应提示：
“请先执行基础分析，再生成证据链。”

证据链必须谨慎表达，只能使用“当前数据支持”“初步观察”“可能值得进一步检查”“建议进一步验证”“需要结合更多数据确认”等表达。不要使用“原因一定是”“这证明”“最终结论是”“一定导致了”等过度因果表述。

## 5I. Stage 5B 规则版报告草稿

Stage 5B 基于业务澄清结果、分析计划、DuckDB 基础分析执行结果和证据链，新增规则版“报告草稿”生成能力。Stage 6E 已在此基础上新增 LLM 报告草稿生成，并保留规则版 fallback。

Stage 5B 初始版本不接真实 LLM，不导出 Word / PDF，不做复杂 Dashboard，也不改变 DuckDB 执行逻辑。Stage 6E 接入 LLM 后仍不导出 Word / PDF，也不改变 DuckDB 执行逻辑。

后端新增 `POST /api/analysis/report`。请求包含：

- 业务问题
- 指标口径
- 对比周期
- 分析维度
- 近期变化因素
- 分析计划
- 基础分析执行结果
- 证据链结果

返回结构包含：

- `title`：报告标题
- `sections`：报告章节
- `disclaimer`：报告说明

报告草稿包含八个部分：

1. 分析背景
2. 当前已确认信息
3. 数据与字段情况
4. 初步分析发现
5. 证据链摘要
6. 可能原因
7. 当前限制
8. 建议下一步验证

前端在“证据链”区域之后新增“报告草稿”区域。点击“生成报告草稿”后调用 `/api/analysis/report` 并以文档预览方式展示，不直接展示 JSON。

如果尚未生成证据链，前端应提示：
“请先生成证据链，再生成报告草稿。”

报告草稿支持“复制报告内容”按钮，复制成功后提示：
“报告内容已复制，可以粘贴到文档中继续修改。”

报告必须保持谨慎表达，可以使用“初步发现”“当前数据支持”“可能原因”“建议进一步验证”“当前数据暂不支持”“需要结合更多数据确认”等表达。不要使用“原因一定是”“这证明”“最终结论是”“一定导致了”等过度因果表述。

## 5J. Stage 6A API 设置与 LLM 连接测试

Stage 6A 新增 API 设置页和 LLM 连接测试基础设施。该阶段只做配置和连通性测试，不让真实 LLM 接管任何业务流程。

新增前端能力：

- 页面右上角显示“API 设置”入口
- 显示 `AI：已配置` / `AI：未配置` 状态
- API 设置面板使用 Sova AI 文案
- 服务商使用卡片选择，不使用普通 select
- 当前支持服务商：OpenAI、DeepSeek、OpenAI-Compatible、自定义
- 支持填写 API Key、API Base URL、模型名称
- API Key 支持显示 / 隐藏切换
- 支持“仅本次会话保存”和“保存到本地浏览器”
- 默认保存方式为“仅本次会话保存”
- 支持“测试连接”按钮

默认 Base URL：

- OpenAI：`https://api.openai.com/v1`
- DeepSeek：`https://api.deepseek.com`
- OpenAI-Compatible：空，由用户填写
- 自定义：空，由用户填写

新增后端接口：

`POST /api/llm/test`

请求包含：

- `provider`
- `api_key`
- `base_url`
- `model`

连接测试逻辑统一使用 OpenAI-compatible Chat Completions 格式：

`POST {base_url}/chat/completions`

所有服务商当前都优先走这套连接测试逻辑，包括 OpenAI、DeepSeek、OpenAI-Compatible 和自定义。

安全边界：

- API Key 不写入代码仓库
- API Key 不写入数据库
- 后端不持久化保存 API Key
- 后端不在日志中输出完整 API Key
- 测试接口只使用用户本次传入的 API Key 发起一次请求

Stage 6A 不改变以下现有规则版 / mock 模块：

- Metric Definition Generator
- Readiness Evaluator
- Analysis Planner
- Evidence Generator
- Report Generator

后续如果接入真实 LLM，应保留 rule-based fallback，并且分阶段替换，不要一次性推翻当前流程。

## 5K. Stage 6B LLM 指标识别与口径卡片生成

Stage 6B 让真实 LLM 接管“指标类型识别 + 指标口径卡片生成”这一小段流程，但不让 LLM 接管分析计划、DuckDB SQL、证据链或报告草稿。

新增后端接口：

`POST /api/llm/metric-definitions`

请求包含：

- `business_problem`
- `provider`
- `api_key`
- `base_url`
- `model`

后端复用 OpenAI-compatible Chat Completions 调用方式，请求用户配置的 `{base_url}/chat/completions`，要求模型严格返回 JSON。返回内容包括：

- `source`：`llm` 或 `fallback`
- `metric_name`
- `metric_type`
- `detected_scenario`
- `cards`
- `fallback_reason`

LLM 只生成前三张候选指标口径卡片。第四张“自定义口径”卡片始终由系统固定追加：

- 标题：自定义口径
- 定义：以上都不是，手动补充
- 说明：适合填写公司内部或业务团队自定义的指标口径。

容错规则：

- 如果未配置 API，使用本地 rule-based fallback。
- 如果 LLM 调用失败，使用本地 rule-based fallback。
- 如果 LLM 返回内容不是合法 JSON，使用本地 rule-based fallback。
- 如果 cards 不是 3 张，或缺少标题、定义、说明等必要字段，使用本地 rule-based fallback。

前端点击“开始澄清”时，会读取浏览器中的 API 设置：

- 如果 API Key、Base URL 和模型名称完整，优先调用 `/api/llm/metric-definitions`。
- 如果没有配置 API，直接使用本地规则，并提示用户可以在 API 设置中配置模型获得更智能的口径识别。
- 如果 LLM 调用失败，不中断流程，自动回退本地规则，并提示“AI 口径生成失败，已使用本地规则继续生成候选口径。”

安全边界保持不变：

- API Key 不写入代码仓库。
- API Key 不写入数据库。
- 后端不持久化保存 API Key。
- 后端不在日志中输出完整 API Key。
- `/api/llm/metric-definitions` 只使用用户本次传入的 API Key 发起一次请求。

## 5L. Stage 6C LLM 分析计划生成

Stage 6C 让真实 LLM 接管“分析计划生成”这一小段流程，但不让 LLM 生成 DuckDB SQL、不执行分析、不生成证据链，也不生成报告草稿。

新增后端接口：

`POST /api/llm/analysis-plan`

请求包含：

- 业务问题
- 指标口径
- 对比周期
- 分析维度
- 近期变化因素
- 上传数据 schema
- 当前可支持分析
- 当前缺失字段提示
- API 设置：`provider`、`api_key`、`base_url`、`model`

返回结构兼容现有分析计划展示：

- `source`：`llm` 或 `fallback`
- `analysis_goal`
- `metric_summary`
- `field_mapping`
- `analysis_steps`
- `analysis_limitations`
- `next_action`
- `fallback_reason`

前端点击“生成分析计划”时，会读取浏览器中的 API 设置：

- 如果 API Key、Base URL 和模型名称完整，优先调用 `/api/llm/analysis-plan`。
- 如果没有配置 API，继续调用现有 `/api/analysis/plan` 使用本地规则生成分析计划。
- 如果 LLM 调用失败、返回不是合法 JSON、字段缺失或状态值不合规，不中断流程，自动回退到现有 rule-based analysis planner。

Stage 6C 的安全边界：

- API Key 不写入代码仓库。
- API Key 不写入数据库。
- 后端不持久化保存 API Key。
- 后端不在日志中输出完整 API Key。
- `/api/llm/analysis-plan` 只使用用户本次传入的 API Key 发起一次请求。

当前 LLM 仍不接管 DuckDB SQL、基础分析执行和报告草稿；证据链生成已在 Stage 6D 单独接入。现有 rule-based fallback 必须始终保留。

## 5M. Stage 6D LLM 证据链生成

Stage 6D 让真实 LLM 接管“证据链生成”这一小段流程，但不让 LLM 生成 SQL、不重新计算数据，也不生成报告草稿。

新增后端接口：

`POST /api/llm/evidence`

请求包含：

- 业务问题
- 指标口径
- 对比周期
- 分析维度
- 近期变化因素
- 分析计划
- DuckDB 基础分析执行结果
- API 设置：`provider`、`api_key`、`base_url`、`model`

返回结构兼容现有证据链展示：

- `source`：`llm` 或 `fallback`
- `summary`
- `evidence_chains`
- `limitations`
- `fallback_reason`

前端点击“生成证据链”时，会读取浏览器中的 API 设置：

- 如果 API Key、Base URL 和模型名称完整，优先调用 `/api/llm/evidence`。
- 如果没有配置 API，继续调用现有 `/api/analysis/evidence` 使用本地规则生成证据链。
- 如果 LLM 调用失败、返回不是合法 JSON、字段缺失或结构不合规，不中断流程，自动回退到现有 rule-based evidence generator。

Stage 6D 的安全和能力边界：

- API Key 不写入代码仓库。
- API Key 不写入数据库。
- 后端不持久化保存 API Key。
- 后端不在日志中输出完整 API Key。
- `/api/llm/evidence` 只使用用户本次传入的 API Key 发起一次请求。
- LLM 只能基于 `execution_result` 中已有结果表、字段、表名、图表名和限制生成证据链。
- LLM 不能编造具体数值，不能重新计算数据，不能生成 SQL，不能生成报告。
- 证据链必须谨慎表达，不能声称因果关系成立。

报告草稿生成已在 Stage 6E 单独接入真实 LLM。现有 rule-based evidence fallback 必须始终保留。

## 5N. Stage 6E LLM 报告草稿生成

Stage 6E 让真实 LLM 接管“报告草稿生成”这一小段流程，但不让 LLM 生成 SQL、不重新计算数据、不导出 Word / PDF，也不生成正式报告定稿。

新增后端接口：

`POST /api/llm/report`

请求包含：

- 业务问题
- 指标口径
- 对比周期
- 分析维度
- 近期变化因素
- 分析计划
- DuckDB 基础分析执行结果
- 证据链结果
- API 设置：`provider`、`api_key`、`base_url`、`model`

返回结构兼容现有报告草稿展示：

- `source`：`llm` 或 `fallback`
- `title`
- `sections`
- `disclaimer`
- `fallback_reason`

前端点击“生成报告草稿”时，会读取浏览器中的 API 设置：

- 如果 API Key、Base URL 和模型名称完整，优先调用 `/api/llm/report`。
- 如果没有配置 API，继续调用现有 `/api/analysis/report` 使用本地规则生成报告草稿。
- 如果 LLM 调用失败、返回不是合法 JSON、字段缺失或 `sections` 少于 6 个，不中断流程，自动回退到现有 rule-based report generator。

Stage 6E 的安全和能力边界：

- API Key 不写入代码仓库。
- API Key 不写入数据库。
- 后端不持久化保存 API Key。
- 后端不在日志中输出完整 API Key。
- `/api/llm/report` 只使用用户本次传入的 API Key 发起一次请求。
- LLM 只能引用输入中已有的业务信息、结果表、证据链和限制。
- LLM 不能编造具体数值，不能重新计算数据，不能生成 SQL。
- LLM 不能使用“原因一定是”“这证明”“最终结论是”“一定导致了”“可以确定”等强因果表达。
- “复制报告内容”功能必须继续可用。

现有 rule-based report fallback 必须始终保留。

## 5P. Stage 7A AI 动态业务澄清系统

Stage 7A 新增 `/api/llm/business-clarification`，让真实 LLM 根据用户业务问题动态生成完整澄清卡片，而不是把固定电商模板套用到所有场景。

该阶段覆盖：
- 指标口径卡片
- 分析维度卡片
- 近期变化因素卡片
- 下一步数据需求
- 上传后的字段语义判断上下文

系统仍固定保留：
- 第四张“自定义口径”
- “自定义维度”
- “暂无明显变化”
- “不确定”

未配置 API、LLM 调用失败、JSON 解析失败或结构不合规时，必须回退到本地规则版业务澄清生成器。fallback 应尽量通用和场景化，不能默认出现优惠券、GMV、商品、商家、金额类指标等电商词，除非当前问题确实是电商交易场景。

示例边界：
- Valorant / 游戏胜率场景应优先生成地图、英雄 / 特工、攻防方、服务器地区、时间粒度、版本更新、地图池变化、平衡调整、网络延迟等卡片。
- 电商退款场景仍可以生成商品类目、商家、退款原因、地区、订单来源、售后规则、物流履约等卡片。

上传数据时，前端会把当前业务澄清上下文作为 `business_context` 传给 `/api/data/upload`。后端字段语义识别应结合该上下文生成“当前数据可支持的分析”和“当前数据暂不支持的部分”，避免非电商场景提示优惠券、GMV、商品、商家等无关限制。

本阶段不让 LLM 生成 SQL，不改变 DuckDB 执行逻辑，不删除任何 rule-based fallback。

## 5O. LLM 模型兼容说明

当前 LLM 客户端统一走 OpenAI-compatible Chat Completions 格式。

GPT-5 系列模型使用兼容参数：

- 如果模型名以 `gpt-5` 开头，请求中不发送 `temperature`。
- 请求中不发送 `top_p`。
- 请求中不发送 `max_tokens`。
- 改用 `max_completion_tokens`。
- 默认传 `reasoning_effort: "none"`，避免 reasoning 模型参数不兼容。

非 GPT-5 模型继续沿用原有兼容逻辑：

- `gpt-4.1`
- `gpt-4o`
- `deepseek-chat`
- 其他 OpenAI-Compatible 模型

这些模型仍使用 `max_tokens` 和 `temperature`。

推荐模型：

- `gpt-4.1`
- `gpt-4o`
- `gpt-5.2`
- `gpt-5-mini`

如果模型返回 HTTP 400，应优先检查：

- 模型 ID 是否为服务商实际支持的名称
- 模型是否可用于当前账号
- 请求参数是否与该模型兼容

如果用户填写了类似 `gpt5`、`gpt5.4` 这类没有连字符的模型名，应提示：
“模型名称可能不正确。请确认模型 ID 是否为服务商实际支持的名称，例如 gpt-5.2、gpt-5-mini、gpt-4.1 或 gpt-4o。”

## 6. 中文 UI 要求

所有用户可见内容必须是简体中文，包括：

- 页面标题
- 按钮
- 输入框 placeholder
- 澄清问题
- 选项卡片
- 当前状态
- 已确认信息
- 待确认信息
- 下一步问题
- 上传提示
- 分析计划
- 图表标题
- 证据链
- 报告草稿
- 错误提示

产品要像中文 AI 数据分析工作台，不要像英文 SaaS 模板。

内部变量名、函数名、文件名和 API 名可以使用英文。

## 7. 交互设计要求

澄清选项必须使用交互式卡片，不要使用传统竖向 radio list。

卡片应包含：

- 标题
- 定义 / 公式
- 简短说明

选中后要有明显高亮状态，并实时更新：

- 当前状态
- 已确认信息
- 待确认信息
- 下一步问题
- 分析就绪进度

页面应保持低保真但干净、现代、清晰。它应该像 AI 分析工作台，不要像普通问卷，也不要像传统后台管理系统。

## 8. 分析就绪进度设计

进度名称：
分析就绪进度

进度含义：
该进度表示：当前业务问题是否已经足够清晰，可以进入数据分析阶段。

不要向用户显示具体百分比数字。
内部可以使用 progress 数值控制进度条宽度。

进度条采用：
进度条 + 阶段标签

阶段包括：

1. 问题识别
2. 指标口径
3. 对比周期
4. 分析维度
5. 数据准备

进度不应该机械地随着每次回答增加，而应该由 Readiness Evaluator 根据当前澄清状态重新判断。

## 9. 指标口径选项

指标口径确认使用交互式卡片。

系统应先根据用户输入的业务问题识别指标类型，再由 Metric Definition Generator 动态生成前三张候选口径卡片。第四张“自定义口径”卡片固定保留。

当前 Stage 6B 已接入真实 LLM 用于指标识别和前三张候选口径卡片生成；未配置 API 或 LLM 调用失败时，仍会自动回退到 rule-based / mock generator。第四张“自定义口径”卡片始终固定保留。

当前支持的 mock 指标类型：

- 优惠券 / 核销率
- DAU / 活跃
- 转化率
- GMV / 销售额
- 留存
- 退款
- 无法识别时使用通用业务指标口径

优惠券核销率口径模板包括：

选项包括：

1. 按用户口径
定义：使用优惠券用户数 / 领取优惠券用户数
说明：适合观察用户层面的优惠券使用转化。

2. 按订单口径
定义：使用优惠券订单数 / 领取优惠券订单数
说明：适合观察订单层面的核销表现。

3. 按整体订单占比
定义：优惠券订单数 / 总订单数
说明：适合观察优惠券订单在整体订单中的占比。

4. 自定义口径
定义：以上都不是，手动补充
说明：适合填写公司内部或业务团队自定义的指标口径。

如果选择自定义口径，需要显示手动输入框。

## 10. 技术栈

Frontend:

- Next.js
- React
- Tailwind CSS

Backend:

- FastAPI
- Python

后续数据分析：

- Pandas
- DuckDB

图表：

- Recharts 或 ECharts
- 第一版只需要简单折线图和柱状图

AI:

- MVP 先使用规则逻辑和 mock LLM 行为
- 后续预留 OpenAI-compatible provider 结构

## 11. 后续数据分析设计

数据上传发生在业务澄清完成之后。

数据流程：
CSV / Excel
→ Pandas 读取
→ 清洗列名
→ 注册到 DuckDB
→ 执行 SQL 分析
→ 返回结果表 / JSON
→ 生成图表、证据链和报告草稿

DuckDB 是核心分析引擎。
SQLite 不作为本项目的数据分析核心。

数据上传阶段应允许：

- 指标明细数据
- 用户或事件行为数据
- 时间维度数据
- 可用于拆解的业务维度数据
- 特定指标模板需要的补充数据，例如优惠券领取 / 使用数据、订单支付 / 退款数据、活跃日志、留存 cohort 数据等
- 单个合并后的 CSV 或 Excel 文件

如果用户只有一个合并文件，系统应根据可用字段说明当前能分析什么、不能分析什么。

## 12. 证据链设计

分析结果不能只输出图表，还需要输出证据链。Stage 5A 已先实现规则版证据链，Stage 6D 已新增真实 LLM 证据链生成并保留规则版 fallback，Stage 5B 已在证据链基础上实现规则版报告草稿。

证据链格式应包含：

- 结论
- 数据证据
- 相关图表
- 可能原因
- 下一步验证建议

表达要谨慎，避免过度因果判断。

推荐用语：

- 可能原因
- 初步判断
- 当前数据支持的结论
- 建议进一步验证
- 当前数据暂不支持的部分
- 可能表明
- 需要结合更多数据确认

避免用语：

- 原因一定是
- 这证明
- 最终结论是
- 一定导致了

## 13. A/B 实验边界

MVP 不做完整 A/B 实验模块。

A/B 实验只作为“近期变化因素”的一个澄清选项，例如：
“这段时间是否存在 A/B 实验、活动调整、版本发布或渠道投放变化？”

完整 A/B 实验分析可以作为未来阶段，不进入 MVP。

## 14. 当前明确不做的功能

MVP 阶段不要做：

- 登录
- 多用户
- 生产部署
- 数据库持久化
- 完整自主 Agent
- 完整 A/B 实验分析
- 无边界的多指标全自动泛化
- 让真实 LLM 接管业务流程，直到进入对应阶段
- 自动 SQL 生成，直到进入对应阶段
- 复杂 BI / Dashboard，直到进入对应阶段
- Word / PDF 导出和正式报告定稿，直到进入对应阶段

Stage 3A 已进入文件上传对应阶段，因此文件上传和 Pandas Schema 识别已经实现。Stage 4A 已进入 DuckDB 对应阶段，因此 DuckDB 数据注册和第一批固定 SQL 基础分析已经实现。Stage 4B 已进入基础图表对应阶段，因此基础折线图、柱状图和指标卡片已经实现。Stage 5A 已进入证据链对应阶段，因此规则版证据链已经实现。Stage 5B 已进入报告草稿对应阶段，因此规则版报告草稿已经实现。Stage 6A 已进入 API 设置和连接测试对应阶段，因此 LLM 配置和连接测试基础设施已经实现。Stage 6B 已让真实 LLM 接管“指标识别 + 指标口径卡片生成”。Stage 6C 已让真实 LLM 接管“分析计划生成”。Stage 6D 已让真实 LLM 接管“证据链生成”。Stage 6E 已让真实 LLM 接管“报告草稿生成”；但自动 SQL 生成、复杂 Dashboard、Word / PDF 导出和正式报告定稿仍需等到对应阶段再做。

任何阶段都不要擅自加入范围外功能。

## 15. 开发原则

- 不要过度工程化
- 每次只做一个小任务
- 不要推翻现有结构
- 不要重建项目
- 不要擅自添加范围外功能
- 不要削减已经确定的功能
- 保持本地可运行
- 优先沿用现有代码结构、UI 风格和 mock 规则
- 每一步完成后说明：
  - 修改了哪些文件
  - 实现了什么
  - 如何运行
  - 如何测试
  - 哪些功能仍然是 mock

## 16. 额度节省原则

为了节省额度，后续每次任务应该：

- 先阅读 PROJECT_CONTEXT.md 和 README.md
- 只阅读和本次任务相关的文件
- 不扫描整个代码库
- 不输出完整代码
- 不重复解释整个产品方向
- 只总结本次修改和测试方式

## 17. 当前仓库结构概览

当前项目位于 `metricflow-ai/`。

主要结构：

- `frontend/`：Next.js + React + Tailwind 前端
- `backend/`：FastAPI 后端
- `README.md`：当前阶段说明和运行方式
- `PROJECT_CONTEXT.md`：长期项目上下文

后续开发任务开始前，应先阅读本文件和 `README.md`。

## 18. Stage 7A.1 字段语义映射层

Stage 7A.1 新增统一 `semantic_context`，用于减少上传数据后的旧模板污染。

`semantic_context` 会结合业务问题、业务场景、已确认指标口径、用户选择的分析维度、近期变化因素和上传 schema，输出：
- `business_domain`
- `primary_metric`
- `field_roles`
- `supported_analysis`
- `unsupported_analysis`
- `irrelevant_modules`

字段匹配原则：
- 先看当前业务语义和用户选择的维度，再看字段名。
- 金额、优惠券、GMV、商品、商家等模块只在当前业务问题、字段或维度明确相关时出现。
- 非相关场景不得默认提示缺少优惠券、GMV、商品、商家或金额字段。
- 字段如 `amount`、`channel`、`user` 不能机械套用固定含义，必须结合当前业务上下文判断。

当前该语义层已用于数据上传后的字段理解、当前可支持分析、当前暂不支持部分，以及前端“数据字段理解”展示。DuckDB 执行 SQL、图表、证据链和报告主流程本阶段不重构。

## 19. Stage 7A.2-1 Scenario Profiles 与语义回归用例

Stage 7A.2-1 新增 Scenario Profiles 场景原型库，用于沉淀通用业务指标异动场景的语义提示。该原型库不是死模板，不直接决定最终分析结果，也不在本阶段接入主流程。

新增 `backend/services/scenario_profiles.py`，包含电商退款、内容完播、游戏胜率、教育作业、客服 SLA、预约到场、SaaS 产品使用、订阅留存、营销转化、物流履约、招聘漏斗和社区互动等场景原型。每个 profile 记录业务关键词、指标关键词、可能的分子 / 分母字段、维度提示、辅助字段提示和不应出现的污染词。

新增 `SEMANTIC_TEST_CASES.md`，用于记录核心语义回归测试场景和通用验收规则，尤其约束教育 `score` 不应误判为 ACS、`submitted_on_time` 应识别为作业按时提交率分子，以及非相关场景不应出现优惠券、GMV、金额、商品、商家等污染。

后续 Stage 7A.2-2 可将 scenario profile 匹配结果接入 `semantic_context`，辅助场景分类、字段解释、`supported_analysis` 和 `unsupported_analysis` 生成。本阶段不改变上传逻辑、DuckDB、图表、证据链、报告或现有 `semantic_context` 生成逻辑。

## 20. Stage 7A.2-2 Scenario Profiles 接入 semantic_context

Stage 7A.2-2 已将 Scenario Profiles 接入上传后的 `semantic_context` 生成链路。前端上传文件时会随 `business_context` 传入当前业务问题、指标口径、已选维度、近期变化因素和数据需求；后端基于这些上下文与上传字段名调用 `match_scenario_profile()`，生成 `scenario_match`。

当匹配分数达到可信阈值时，`semantic_context.business_domain` 会优先使用 profile 的中文场景名称，并用 profile 的 `likely_numerator_fields`、`likely_denominator_fields`、`dimension_hints`、`auxiliary_hints` 辅助字段角色判断。`forbidden_terms` 只用于过滤无关分析提示，不作为用户可见污染词输出。

Scenario Profiles 仍然只是语义提示，不直接决定最终分析结果。最终字段解释仍需结合 `business_problem`、`metric_definition`、`selected_dimensions`、`change_factors` 和上传 schema。本阶段不改变 DuckDB SQL 执行逻辑、图表、证据链、报告或 LLM 业务澄清主流程。

## 21. Stage 7A.2-3 Scenario Profile 维度映射修正

Stage 7A.2-3 修复了 profile 高置信命中后的字段维度映射和旧限制污染问题。`semantic_context.business_domain` 会优先使用高置信 profile 的 `domain_label`，而不是被前端传入的通用业务 fallback 覆盖。

`dimension_hints` 现在支持精确字段名和关键词匹配。已命中 profile 维度提示的字段会被视为当前场景已支持维度，不应再出现在 `unsupported_analysis` 中。上传后的 readiness 面板也会过滤旧固定模板中的用户、渠道、金额、优惠券类缺口，除非当前场景或用户选择明确需要。

## 22. Stage 7A.2-4 Readiness 与当前限制污染清理

Stage 7A.2-4 聚焦展示层限制来源清理。上传后，右侧 readiness 面板优先使用 `semantic_context.unsupported_analysis` 表达当前场景相关缺失项；分析计划和执行结果中的“当前限制”会基于同一份 `semantic_context` 过滤旧固定模板限制。

用户、渠道来源、金额、优惠券、ACS 等限制只有在当前业务场景、字段语义、指标口径或已选维度明确相关时才允许显示。物流履约、教育作业等非相关场景不应默认出现这些限制。本阶段不改变上传接口、DuckDB、图表、证据链、报告或 LLM 业务澄清主流程。

## 23. Stage 7B-1 Metric Spec Builder

Stage 7B-1 新增 Metric Spec Builder，用于把上传后的 `semantic_context`、分析计划和上传 schema 转成结构化 `metric_spec`。它只负责定义指标计算口径，包括分子、分母、聚合方式、周期字段、时间字段、拆解维度、辅助字段和限制说明。

后端新增 `backend/services/metric_spec_builder.py` 和 `POST /api/metric-spec/build`。该接口不调用 LLM，不生成 SQL，不执行 DuckDB，也不改变图表、证据链或报告主流程。前端在生成分析计划后展示“指标计算规格”，为后续 Stage 7B-2 的真实指标率计算做准备。

## 24. Stage 7B-2 Metric Spec Executor

Stage 7B-2 新增 Metric Spec Executor，用于根据 `metric_spec` 对已上传的单表数据执行固定安全聚合，输出整体指标对比、维度拆解和 Top 异动分组。它复用 `upload_id` 找到本地上传文件并注册到内存 DuckDB，但不替换旧 `/api/analysis/execute`。

安全边界：只允许 `metric_spec` 中声明的分子、分母、周期、时间、维度和辅助字段进入查询；字段必须先经过 DuckDB 表 schema 白名单校验，并使用安全 quote。当前不支持自由 SQL、不支持 LLM SQL、不支持复杂多表 join，也不接入报告主流程。

前端在“指标计算规格”区域新增“执行指标计算”按钮，展示整体本周 / 上周指标率、变化百分点、维度拆解表和 Top 异动分组。

Stage 7B-2.1 补强 SaaS / 产品增长类场景。`saas_product_usage` 不再只覆盖泛活跃率，而是覆盖新注册用户 7 日激活率、产品激活、onboarding、核心配置、首次登录、试用激活、注册来源质量、套餐 / 行业 / 公司规模分层等通用语义。`semantic_context` 和 Metric Spec Builder 会优先识别 `activated_within_7d` 这类激活分子、`user_id` 这类注册用户分母，并保留 onboarding、核心配置、模板使用、激活阻塞原因等字段作为拆解维度或辅助字段。

Stage 7B-5 做横向稳定性修复。Metric Spec Executor 的 Top movers 会根据整体指标方向排序：整体下降时优先展示最负向分组，整体上升时优先展示最大上升分组；同时新增 `auxiliary_metric_comparisons`，对 metric_spec 中的数值辅助字段计算本周 / 上周均值对比。旧基础分析仍作为补充探索，但不再在非相关场景默认展示优惠券分析、缺少用户字段或错误的渠道分析命名。

## 25. Stage 7B-3 证据链与报告优先使用指标计算结果

Stage 7B-3 将 `metric_execution_result` 接入证据链和报告链路。前端在生成证据链和报告草稿时会传入当前指标计算结果；后端规则版 evidence/report 以及 LLM prompt 都会在该结果存在时优先使用整体指标对比、分子分母变化、维度拆解和 Top 异动分组。

当 `metric_execution_result` 存在时，物流报告应直接写出本周 / 上周配送延迟率、变化百分点、总运单数、延迟运单数和高异动分组，不再声称“尚未直接给出本周 vs 上周的配送延迟率对比”或“缺少承运商、服务等级、包裹大小、线路类型、天气等分组结果”。未执行指标计算时，旧的基础分析证据链和报告流程继续保留。
