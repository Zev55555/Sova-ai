"use client";

import { useMemo, useState } from "react";
import {
  evaluateReadiness,
  evaluateReadinessLocally,
  initialClarificationState,
  initialReadiness,
  type ClarificationState,
  type ReadinessState,
} from "@/lib/readiness";
import {
  generateMetricDefinitions,
  type MetricDefinitionCard,
  type MetricDefinitionResult,
} from "@/lib/metric-definition";
import {
  uploadDataFiles,
  type UploadFileSchema,
  type UploadResponse,
} from "@/lib/data-upload";
import {
  generateAnalysisPlan,
  type AnalysisPlan,
  type AnalysisStepStatus,
  type FieldMappingStatus,
} from "@/lib/analysis-plan";
import {
  executeBasicAnalysis,
  type AnalysisExecutionResult,
  type ExecutionResultTable,
} from "@/lib/analysis-execution";
import {
  generateEvidenceChain,
  type EvidenceResult,
} from "@/lib/evidence-chain";
import {
  generateReportDraft,
  type ReportDraft,
} from "@/lib/report-draft";
import { AnalysisCharts } from "@/components/analysis-charts";
import { EvidenceChainSection } from "@/components/evidence-chain";
import { ReadinessPanel } from "@/components/readiness-panel";
import { ReportDraftSection } from "@/components/report-draft";

type SingleOption = {
  id: string;
  title: string;
  definition?: string;
  description: string;
};

const comparisonOptions: SingleOption[] = [
  {
    id: "week",
    title: "本周 vs 上周",
    definition: "本周数据与上周同期或上一完整周对比",
    description: "适合快速判断近期是否出现短期异常。",
  },
  {
    id: "month",
    title: "本月 vs 上月",
    definition: "本月数据与上月同期或上一完整月对比",
    description: "适合观察月度经营表现变化。",
  },
  {
    id: "campaign",
    title: "活动期 vs 活动前",
    definition: "活动期间数据与活动开始前数据对比",
    description: "适合分析活动、投放或策略调整前后的变化。",
  },
  {
    id: "custom",
    title: "自定义对比周期",
    definition: "以上都不是，手动补充",
    description: "适合填写你们业务中实际使用的对比方式。",
  },
];

const dimensionOptions: SingleOption[] = [
  {
    id: "user_type",
    title: "用户类型",
    definition: "新用户 / 老用户 / 会员等级 / 用户分层",
    description: "判断指标异动是否主要集中在某类用户群体。",
  },
  {
    id: "city",
    title: "地区 / 城市",
    definition: "城市、区域、省份或门店区域",
    description: "判断是否由特定地区贡献了主要变化。",
  },
  {
    id: "channel_source",
    title: "渠道来源",
    definition: "自然流量、投放渠道、推荐位、活动入口等",
    description: "判断指标异动是否与流量结构变化有关。",
  },
  {
    id: "business_object",
    title: "商品 / 商家 / 内容",
    definition: "商品类目、商家、内容类型、服务类型等",
    description: "判断是否由部分业务对象表现异常导致整体变化。",
  },
  {
    id: "time_granularity",
    title: "时间粒度",
    definition: "按天、按周、按小时、活动前后等",
    description: "判断异动是否集中在特定时间段或节点。",
  },
  {
    id: "custom",
    title: "自定义维度",
    definition: "以上都不是，手动补充",
    description: "补充你们业务中特有的拆解维度。",
  },
];

const changeFactorOptions: SingleOption[] = [
  {
    id: "operation",
    title: "运营活动 / 规则调整",
    definition: "活动节奏、优惠规则、价格策略、权益规则等发生变化",
    description: "适合判断指标异动是否可能和业务策略调整有关。",
  },
  {
    id: "channel",
    title: "渠道投放变化",
    definition: "投放预算、渠道结构、流量入口或推荐位发生变化",
    description: "适合判断指标异动是否可能和流量来源变化有关。",
  },
  {
    id: "version",
    title: "产品版本更新",
    definition: "页面入口、交互流程、提醒机制、下单路径等发生变化",
    description: "适合判断指标异动是否可能和产品体验变化有关。",
  },
  {
    id: "ab_test",
    title: "A/B 实验",
    definition: "部分用户进入了新策略、新页面或新算法实验",
    description: "MVP 不做完整实验分析，但会把它作为可能影响因素记录下来。",
  },
  {
    id: "none",
    title: "暂无明显变化",
    definition: "目前没有已知的活动、投放、版本或实验变化",
    description: "后续将更依赖数据拆解来发现异常来源。",
  },
  {
    id: "unknown",
    title: "不确定",
    definition: "暂时不清楚是否存在相关变化",
    description: "后续报告中会标记为需要进一步向业务方确认。",
  },
];

const specialChangeFactorIds = ["none", "unknown"];

const genericDataNeeds = [
  "指标相关的明细数据或聚合数据",
  "用户基础信息数据",
  "订单 / 事件 / 行为数据",
  "渠道、地区、商品、商家或业务对象相关数据",
  "活动、版本、投放或实验相关记录",
];

const couponDataNeeds = [
  "优惠券领取数据",
  "优惠券使用 / 订单数据",
  "用户基础信息数据",
  "商家 / 城市 / 活动数据",
];

export function MetricFlowWorkspace() {
  const [clarificationState, setClarificationState] =
    useState<ClarificationState>(initialClarificationState);
  const [hasStarted, setHasStarted] = useState(false);
  const [selectedMetricOptionId, setSelectedMetricOptionId] = useState<
    string | null
  >(null);
  const [selectedComparisonOptionId, setSelectedComparisonOptionId] = useState<
    string | null
  >(null);
  const [selectedDimensionIds, setSelectedDimensionIds] = useState<string[]>(
    [],
  );
  const [customDimension, setCustomDimension] = useState("");
  const [selectedChangeFactorIds, setSelectedChangeFactorIds] = useState<
    string[]
  >([]);
  const [readiness, setReadiness] =
    useState<ReadinessState>(initialReadiness);
  const [isEvaluating, setIsEvaluating] = useState(false);
  const [uploadResult, setUploadResult] = useState<UploadResponse | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadError, setUploadError] = useState("");
  const [analysisPlan, setAnalysisPlan] = useState<AnalysisPlan | null>(null);
  const [analysisPlanError, setAnalysisPlanError] = useState("");
  const [isGeneratingAnalysisPlan, setIsGeneratingAnalysisPlan] =
    useState(false);
  const [analysisExecutionResult, setAnalysisExecutionResult] =
    useState<AnalysisExecutionResult | null>(null);
  const [analysisExecutionError, setAnalysisExecutionError] = useState("");
  const [isExecutingAnalysis, setIsExecutingAnalysis] = useState(false);
  const [evidenceResult, setEvidenceResult] = useState<EvidenceResult | null>(
    null,
  );
  const [evidenceError, setEvidenceError] = useState("");
  const [isGeneratingEvidence, setIsGeneratingEvidence] = useState(false);
  const [reportDraft, setReportDraft] = useState<ReportDraft | null>(null);
  const [reportError, setReportError] = useState("");
  const [isGeneratingReport, setIsGeneratingReport] = useState(false);

  const metricDefinitionResult = useMemo(
    () => generateMetricDefinitions(clarificationState.businessProblem),
    [clarificationState.businessProblem],
  );

  const selectedMetricOption = useMemo(
    () =>
      metricDefinitionResult.cards.find(
        (option) => option.id === selectedMetricOptionId,
      ) ?? null,
    [metricDefinitionResult.cards, selectedMetricOptionId],
  );

  const isReadyForData = readiness.current_stage === "数据准备";
  const draftDimensions = getSelectedLabels(
    selectedDimensionIds,
    dimensionOptions,
    customDimension,
  );
  const draftChangeFactors = getSelectedLabels(
    selectedChangeFactorIds,
    changeFactorOptions,
  );
  const panelReadiness = useMemo(
    () => getReadinessWithUploadState(readiness, uploadResult),
    [readiness, uploadResult],
  );

  async function syncReadiness(nextState: ClarificationState) {
    setClarificationState(nextState);

    if (!hasStarted && !nextState.businessProblem.trim()) {
      return;
    }

    setIsEvaluating(true);
    setReadiness(evaluateReadinessLocally(nextState));
    const nextReadiness = await evaluateReadiness(nextState);
    setReadiness(nextReadiness);
    setIsEvaluating(false);
  }

  async function handleStartClarification() {
    setSelectedMetricOptionId(null);
    setSelectedComparisonOptionId(null);
    setSelectedDimensionIds([]);
    setCustomDimension("");
    setSelectedChangeFactorIds([]);
    resetUploadState();

    const nextState = {
      ...clarificationState,
      businessProblem: clarificationState.businessProblem.trim(),
      metricDefinition: null,
      comparisonPeriod: null,
      dimensions: [],
      changeFactors: [],
      customMetricDefinition: "",
      customComparisonPeriod: "",
      customDimensions: [],
    };
    setHasStarted(true);
    setIsEvaluating(true);
    setReadiness(evaluateReadinessLocally(nextState));
    const nextReadiness = await evaluateReadiness(nextState);
    setClarificationState(nextState);
    setReadiness(nextReadiness);
    setIsEvaluating(false);
  }

  async function handleSelectMetric(option: MetricDefinitionCard) {
    setSelectedMetricOptionId(option.id);
    resetAfterMetric();

    const metricDefinition = option.id === "custom" ? "" : option.definition;
    await syncReadiness({
      ...clarificationState,
      metricDefinition: metricDefinition || null,
      comparisonPeriod: null,
      dimensions: [],
      changeFactors: [],
      customMetricDefinition: option.id === "custom" ? "" : undefined,
      customComparisonPeriod: "",
      customDimensions: [],
    });
  }

  async function handleCustomMetricChange(value: string) {
    if (selectedMetricOptionId !== "custom") {
      return;
    }

    resetAfterMetric();
    await syncReadiness({
      ...clarificationState,
      metricDefinition: value.trim() || null,
      comparisonPeriod: null,
      dimensions: [],
      changeFactors: [],
      customMetricDefinition: value,
      customComparisonPeriod: "",
      customDimensions: [],
    });
  }

  async function handleSelectComparison(option: SingleOption) {
    setSelectedComparisonOptionId(option.id);
    resetAfterComparison();

    await syncReadiness({
      ...clarificationState,
      comparisonPeriod: option.id === "custom" ? null : option.title,
      dimensions: [],
      changeFactors: [],
      customComparisonPeriod: option.id === "custom" ? "" : undefined,
      customDimensions: [],
    });
  }

  async function handleCustomComparisonChange(value: string) {
    if (selectedComparisonOptionId !== "custom") {
      return;
    }

    resetAfterComparison();
    await syncReadiness({
      ...clarificationState,
      comparisonPeriod: value.trim() || null,
      dimensions: [],
      changeFactors: [],
      customComparisonPeriod: value,
      customDimensions: [],
    });
  }

  function handleToggleDimension(optionId: string) {
    setSelectedDimensionIds((current) =>
      current.includes(optionId)
        ? current.filter((id) => id !== optionId)
        : [...current, optionId],
    );
  }

  async function handleConfirmDimensions() {
    resetAfterDimensions();
    await syncReadiness({
      ...clarificationState,
      dimensions: draftDimensions,
      changeFactors: [],
      customDimensions: customDimension.trim() ? [customDimension.trim()] : [],
    });
  }

  function handleToggleChangeFactor(optionId: string) {
    setSelectedChangeFactorIds((current) => {
      const isSelected = current.includes(optionId);

      if (isSelected) {
        return current.filter((id) => id !== optionId);
      }

      if (specialChangeFactorIds.includes(optionId)) {
        return [optionId];
      }

      return [
        ...current.filter((id) => !specialChangeFactorIds.includes(id)),
        optionId,
      ];
    });
  }

  async function handleConfirmChangeFactors() {
    resetUploadState();
    await syncReadiness({
      ...clarificationState,
      changeFactors: draftChangeFactors,
    });
  }

  function resetAfterMetric() {
    setSelectedComparisonOptionId(null);
    setSelectedDimensionIds([]);
    setCustomDimension("");
    setSelectedChangeFactorIds([]);
    resetUploadState();
  }

  function resetAfterComparison() {
    setSelectedDimensionIds([]);
    setCustomDimension("");
    setSelectedChangeFactorIds([]);
    resetUploadState();
  }

  function resetAfterDimensions() {
    setSelectedChangeFactorIds([]);
    resetUploadState();
  }

  function resetUploadState() {
    setUploadResult(null);
    setUploadError("");
    setAnalysisPlan(null);
    setAnalysisPlanError("");
    setIsGeneratingAnalysisPlan(false);
    setAnalysisExecutionResult(null);
    setAnalysisExecutionError("");
    setIsExecutingAnalysis(false);
    setEvidenceResult(null);
    setEvidenceError("");
    setIsGeneratingEvidence(false);
    setReportDraft(null);
    setReportError("");
    setIsGeneratingReport(false);
  }

  async function handleUploadFiles(files: File[]) {
    const selectedFiles = files.filter(Boolean);

    if (selectedFiles.length === 0) {
      return;
    }

    setIsUploading(true);
    setUploadError("");
    setAnalysisPlan(null);
    setAnalysisPlanError("");
    setAnalysisExecutionResult(null);
    setAnalysisExecutionError("");
    setEvidenceResult(null);
    setEvidenceError("");
    setReportDraft(null);
    setReportError("");

    try {
      const nextUploadResult = await uploadDataFiles(
        selectedFiles,
        clarificationState.dimensions,
      );
      setUploadResult(nextUploadResult);
    } catch (error) {
      setUploadError(
        error instanceof Error ? error.message : "数据上传失败，请稍后重试。",
      );
    } finally {
      setIsUploading(false);
    }
  }

  async function handleGenerateAnalysisPlan() {
    if (!uploadResult) {
      setAnalysisPlanError("请先上传数据并完成字段识别。");
      return;
    }

    setIsGeneratingAnalysisPlan(true);
    setAnalysisPlanError("");
    setAnalysisExecutionResult(null);
    setAnalysisExecutionError("");
    setEvidenceResult(null);
    setEvidenceError("");
    setReportDraft(null);
    setReportError("");

    try {
      const nextAnalysisPlan = await generateAnalysisPlan({
        businessProblem: clarificationState.businessProblem,
        metricDefinition: clarificationState.metricDefinition,
        comparisonPeriod: clarificationState.comparisonPeriod,
        dimensions: clarificationState.dimensions,
        changeFactors: clarificationState.changeFactors,
        uploadedSchema: uploadResult,
      });
      setAnalysisPlan(nextAnalysisPlan);
    } catch {
      setAnalysisPlanError("分析计划生成失败，请稍后重试或检查上传数据。");
    } finally {
      setIsGeneratingAnalysisPlan(false);
    }
  }

  async function handleExecuteBasicAnalysis() {
    if (!uploadResult || !analysisPlan) {
      setAnalysisExecutionError("请先上传数据并生成分析计划。");
      return;
    }

    setIsExecutingAnalysis(true);
    setAnalysisExecutionError("");
    setAnalysisExecutionResult(null);
    setEvidenceResult(null);
    setEvidenceError("");
    setReportDraft(null);
    setReportError("");

    try {
      const nextExecutionResult = await executeBasicAnalysis({
        uploadId: uploadResult.upload_id,
        analysisPlan,
        businessProblem: clarificationState.businessProblem,
        metricDefinition: clarificationState.metricDefinition,
        comparisonPeriod: clarificationState.comparisonPeriod,
        dimensions: clarificationState.dimensions,
        changeFactors: clarificationState.changeFactors,
      });
      setAnalysisExecutionResult(nextExecutionResult);
    } catch (error) {
      setAnalysisExecutionError(
        error instanceof Error
          ? error.message
          : "基础分析执行失败，请稍后重试或检查上传数据。",
      );
    } finally {
      setIsExecutingAnalysis(false);
    }
  }

  async function handleGenerateEvidenceChain() {
    if (!analysisPlan || !analysisExecutionResult) {
      setEvidenceError("请先执行基础分析，再生成证据链。");
      return;
    }

    setIsGeneratingEvidence(true);
    setEvidenceError("");
    setReportDraft(null);
    setReportError("");

    try {
      const nextEvidenceResult = await generateEvidenceChain({
        businessProblem: clarificationState.businessProblem,
        metricDefinition: clarificationState.metricDefinition,
        comparisonPeriod: clarificationState.comparisonPeriod,
        dimensions: clarificationState.dimensions,
        changeFactors: clarificationState.changeFactors,
        analysisPlan,
        executionResult: analysisExecutionResult,
      });
      setEvidenceResult(nextEvidenceResult);
    } catch (error) {
      setEvidenceError(
        error instanceof Error
          ? error.message
          : "证据链生成失败，请稍后重试或检查分析结果。",
      );
    } finally {
      setIsGeneratingEvidence(false);
    }
  }

  async function handleGenerateReportDraft() {
    if (!analysisPlan || !analysisExecutionResult || !evidenceResult) {
      setReportError("请先生成证据链，再生成报告草稿。");
      return;
    }

    setIsGeneratingReport(true);
    setReportError("");

    try {
      const nextReportDraft = await generateReportDraft({
        businessProblem: clarificationState.businessProblem,
        metricDefinition: clarificationState.metricDefinition,
        comparisonPeriod: clarificationState.comparisonPeriod,
        dimensions: clarificationState.dimensions,
        changeFactors: clarificationState.changeFactors,
        analysisPlan,
        executionResult: analysisExecutionResult,
        evidenceResult,
      });
      setReportDraft(nextReportDraft);
    } catch (error) {
      setReportError(
        error instanceof Error
          ? error.message
          : "报告草稿生成失败，请稍后重试或检查证据链。",
      );
    } finally {
      setIsGeneratingReport(false);
    }
  }

  return (
    <main className="min-h-screen px-4 py-5 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-7xl">
        <header className="mb-6 rounded-lg border border-ink/10 bg-surface/82 px-5 py-5 shadow-soft backdrop-blur sm:px-7">
          <p className="mb-2 text-sm font-medium text-accent">
            中文 AI 指标异动分析工作台
          </p>
          <h1 className="text-2xl font-semibold tracking-normal text-ink sm:text-3xl">
            MetricFlow AI｜指标异动分析工作台
          </h1>
          <p className="mt-3 max-w-3xl text-sm leading-6 text-ink/68 sm:text-base">
            从模糊业务问题出发，逐步澄清指标口径、分析维度和数据需求。
          </p>
        </header>

        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_380px]">
          <div className="space-y-6">
            <section className="rounded-lg border border-ink/10 bg-surface/86 p-5 shadow-soft backdrop-blur sm:p-6">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
                <div>
                  <p className="text-sm font-medium text-accent">第一步</p>
                  <h2 className="mt-1 text-xl font-semibold text-ink">
                    描述你遇到的业务指标问题
                  </h2>
                </div>
                {isEvaluating ? (
                  <span className="rounded-full border border-accent/30 bg-accent/10 px-3 py-1 text-xs font-medium text-accent">
                    正在评估分析就绪状态
                  </span>
                ) : null}
              </div>

              <div className="mt-5">
                <label className="sr-only" htmlFor="business-problem">
                  业务问题
                </label>
                <textarea
                  className="min-h-32 w-full resize-none rounded-lg border border-ink/12 bg-white/76 p-4 text-base leading-7 text-ink outline-none transition focus:border-accent focus:bg-white focus:ring-4 focus:ring-accent/12"
                  id="business-problem"
                  onChange={(event) =>
                    setClarificationState((current) => ({
                      ...current,
                      businessProblem: event.target.value,
                    }))
                  }
                  placeholder="请用一句话描述你遇到的指标问题，例如：最近 DAU 下降了、转化率变差了，或优惠券核销率下降了。"
                  value={clarificationState.businessProblem}
                />
              </div>

              <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <p className="text-sm leading-6 text-ink/58">
                  系统会先识别你提到的指标，再生成候选口径并继续澄清对比周期、分析维度和数据需求。
                </p>
                <button
                  className="rounded-lg bg-ink px-5 py-3 text-sm font-semibold text-surface transition hover:bg-accent focus:outline-none focus:ring-4 focus:ring-accent/18 disabled:cursor-not-allowed disabled:bg-ink/35"
                  data-testid="start-clarification"
                  disabled={
                    !clarificationState.businessProblem.trim() || isEvaluating
                  }
                  onClick={handleStartClarification}
                  type="button"
                >
                  开始澄清
                </button>
              </div>
            </section>

            {hasStarted ? (
              <ClarificationSection
                eyebrow="指标口径"
                title={getMetricQuestionTitle(metricDefinitionResult)}
              >
                <OptionGrid>
                  {metricDefinitionResult.cards.map((option) => (
                    <OptionCard
                      description={option.description}
                      definition={option.definition}
                      key={option.id}
                      onClick={() => handleSelectMetric(option)}
                      selected={selectedMetricOptionId === option.id}
                      title={option.title}
                    />
                  ))}
                </OptionGrid>

                {selectedMetricOption?.id === "custom" ? (
                  <InlineInput
                    id="custom-metric-definition"
                    label="补充自定义指标口径"
                    onChange={handleCustomMetricChange}
                    placeholder={getCustomMetricPlaceholder(
                      metricDefinitionResult,
                    )}
                    value={clarificationState.customMetricDefinition ?? ""}
                  />
                ) : null}
              </ClarificationSection>
            ) : null}

            {clarificationState.metricDefinition ? (
              <ClarificationSection
                eyebrow="对比周期"
                title="这次指标异动是和哪个时间段相比？"
              >
                <OptionGrid>
                  {comparisonOptions.map((option) => (
                    <OptionCard
                      description={option.description}
                      definition={option.definition}
                      key={option.id}
                      onClick={() => handleSelectComparison(option)}
                      selected={selectedComparisonOptionId === option.id}
                      title={option.title}
                    />
                  ))}
                </OptionGrid>

                {selectedComparisonOptionId === "custom" ? (
                  <InlineInput
                    id="custom-comparison-period"
                    label="补充自定义对比周期"
                    onChange={handleCustomComparisonChange}
                    placeholder="请补充具体对比周期，例如：5月1日-5月7日 vs 4月24日-4月30日"
                    value={clarificationState.customComparisonPeriod ?? ""}
                  />
                ) : null}
              </ClarificationSection>
            ) : null}

            {clarificationState.comparisonPeriod ? (
              <ClarificationSection
                eyebrow="分析维度"
                title="你希望优先从哪些维度拆解这次指标异动？"
              >
                <OptionGrid>
                  {dimensionOptions.map((option) => (
                    <OptionCard
                      description={option.description}
                      definition={option.definition}
                      key={option.id}
                      multiple
                      onClick={() => handleToggleDimension(option.id)}
                      selected={selectedDimensionIds.includes(option.id)}
                      title={option.title}
                    />
                  ))}
                </OptionGrid>

                {selectedDimensionIds.includes("custom") ? (
                  <InlineInput
                    id="custom-dimension"
                    label="补充自定义分析维度"
                    onChange={(value) => setCustomDimension(value)}
                    placeholder="请补充自定义分析维度，例如：活动批次、会员等级、商品类目、门店类型……"
                    value={customDimension}
                  />
                ) : null}

                <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <p className="text-sm leading-6 text-ink/58">
                    可以选择多个维度。系统后续会根据你选择的维度生成分析路径，并在上传数据后判断哪些维度可以被实际验证。
                  </p>
                  <button
                    className="rounded-lg bg-ink px-5 py-3 text-sm font-semibold text-surface transition hover:bg-accent focus:outline-none focus:ring-4 focus:ring-accent/18 disabled:cursor-not-allowed disabled:bg-ink/35"
                    disabled={draftDimensions.length === 0 || isEvaluating}
                    onClick={handleConfirmDimensions}
                    type="button"
                  >
                    确认分析维度
                  </button>
                </div>
              </ClarificationSection>
            ) : null}

            {clarificationState.dimensions.length > 0 ? (
              <ClarificationSection
                eyebrow="近期变化因素"
                title="这段时间是否存在可能影响指标的业务变化？"
              >
                <p className="mt-3 text-sm leading-6 text-ink/58">
                  这些信息不会直接作为结论，但会帮助后续分析时判断哪些方向值得优先验证。
                </p>
                <OptionGrid>
                  {changeFactorOptions.map((option) => (
                    <OptionCard
                      description={option.description}
                      definition={option.definition}
                      key={option.id}
                      multiple
                      onClick={() => handleToggleChangeFactor(option.id)}
                      selected={selectedChangeFactorIds.includes(option.id)}
                      title={option.title}
                    />
                  ))}
                </OptionGrid>

                <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <p className="text-sm leading-6 text-ink/58">
                    “暂无明显变化”和“不确定”为互斥选项，选择后会自动取消其他变化因素。
                  </p>
                  <button
                    className="rounded-lg bg-ink px-5 py-3 text-sm font-semibold text-surface transition hover:bg-accent focus:outline-none focus:ring-4 focus:ring-accent/18 disabled:cursor-not-allowed disabled:bg-ink/35"
                    disabled={draftChangeFactors.length === 0 || isEvaluating}
                    onClick={handleConfirmChangeFactors}
                    type="button"
                  >
                    确认变化因素
                  </button>
                </div>
              </ClarificationSection>
            ) : null}

            <UnderstandingCard
              isReadyForData={isReadyForData}
              metricDefinitionResult={metricDefinitionResult}
              state={clarificationState}
            />

            {uploadResult ? <DataFieldUnderstandingCard /> : null}

            {isReadyForData ? (
              <>
                <DataNeedsSection metricDefinitionResult={metricDefinitionResult} />
                <DataUploadSection
                  analysisPlan={analysisPlan}
                  analysisPlanError={analysisPlanError}
                  analysisExecutionError={analysisExecutionError}
                  analysisExecutionResult={analysisExecutionResult}
                  evidenceError={evidenceError}
                  evidenceResult={evidenceResult}
                  isUploading={isUploading}
                  isExecutingAnalysis={isExecutingAnalysis}
                  isGeneratingAnalysisPlan={isGeneratingAnalysisPlan}
                  isGeneratingEvidence={isGeneratingEvidence}
                  isGeneratingReport={isGeneratingReport}
                  onExecuteAnalysis={handleExecuteBasicAnalysis}
                  onGenerateEvidence={handleGenerateEvidenceChain}
                  onGeneratePlan={handleGenerateAnalysisPlan}
                  onGenerateReport={handleGenerateReportDraft}
                  onUploadFiles={handleUploadFiles}
                  reportDraft={reportDraft}
                  reportError={reportError}
                  uploadError={uploadError}
                  uploadResult={uploadResult}
                />
              </>
            ) : null}
          </div>

          <ReadinessPanel readiness={panelReadiness} />
        </div>
      </div>
    </main>
  );
}

function ClarificationSection({
  eyebrow,
  title,
  children,
}: {
  eyebrow: string;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-lg border border-ink/10 bg-surface/86 p-5 shadow-soft backdrop-blur sm:p-6">
      <div className="flex flex-col gap-2">
        <p className="text-sm font-medium text-accent">{eyebrow}</p>
        <h2 className="text-xl font-semibold text-ink">{title}</h2>
      </div>
      {children}
    </section>
  );
}

function OptionGrid({ children }: { children: React.ReactNode }) {
  return <div className="mt-5 grid gap-4 md:grid-cols-2">{children}</div>;
}

function OptionCard({
  title,
  definition,
  description,
  selected,
  multiple = false,
  onClick,
}: {
  title: string;
  definition?: string;
  description: string;
  selected: boolean;
  multiple?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      className={
        selected
          ? "min-h-36 rounded-lg border-2 border-accent bg-white p-5 text-left shadow-soft transition hover:-translate-y-0.5 focus:outline-none focus:ring-4 focus:ring-accent/14"
          : "min-h-36 rounded-lg border border-ink/10 bg-white/70 p-5 text-left transition hover:-translate-y-0.5 hover:border-accent/55 hover:bg-white focus:outline-none focus:ring-4 focus:ring-accent/14"
      }
      onClick={onClick}
      type="button"
    >
      <div className="flex items-start justify-between gap-4">
        <h3 className="text-lg font-semibold text-ink">{title}</h3>
        <span
          className={
            selected
              ? "flex h-7 w-7 items-center justify-center rounded-full bg-accent text-sm font-bold text-white"
              : "flex h-7 w-7 items-center justify-center rounded-full border border-ink/16 text-sm text-ink/36"
          }
        >
          {selected ? "✓" : multiple ? "＋" : "○"}
        </span>
      </div>
      {definition ? (
        <p className="mt-4 rounded-md bg-ink/[0.04] p-3 text-sm font-medium leading-6 text-ink">
          {definition}
        </p>
      ) : null}
      <p className="mt-3 text-sm leading-6 text-ink/62">{description}</p>
    </button>
  );
}

function InlineInput({
  id,
  label,
  placeholder,
  value,
  onChange,
}: {
  id: string;
  label: string;
  placeholder: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <div className="mt-5 rounded-lg border border-accent/28 bg-white/70 p-4">
      <label className="text-sm font-semibold text-ink" htmlFor={id}>
        {label}
      </label>
      <input
        className="mt-3 w-full rounded-lg border border-ink/12 bg-white px-4 py-3 text-sm text-ink outline-none transition focus:border-accent focus:ring-4 focus:ring-accent/12"
        id={id}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        value={value}
      />
    </div>
  );
}

function UnderstandingCard({
  state,
  isReadyForData,
  metricDefinitionResult,
}: {
  state: ClarificationState;
  isReadyForData: boolean;
  metricDefinitionResult: MetricDefinitionResult;
}) {
  if (isReadyForData) {
    return (
      <section className="rounded-lg border border-ink/10 bg-white/78 p-5 shadow-soft backdrop-blur sm:p-6">
        <p className="text-sm font-medium text-accent">当前理解摘要</p>
        <p className="mt-3 text-base leading-7 text-ink/76">
          当前已将用户的模糊业务问题整理为一个可执行的指标异动分析任务。下一步需要上传相关数据，用于验证指标异动是否真实存在，并进一步拆解主要贡献因素。
        </p>
        <dl className="mt-5 grid gap-3 text-sm sm:grid-cols-2">
          <SummaryItem
            label="分析目标"
            value={metricDefinitionResult.analysisTarget}
          />
          <SummaryItem
            label="指标口径"
            value={state.metricDefinition ?? "待确认"}
          />
          <SummaryItem
            label="对比周期"
            value={state.comparisonPeriod ?? "待确认"}
          />
          <SummaryItem
            label="优先拆解维度"
            value={state.dimensions.length ? state.dimensions.join("、") : "待确认"}
          />
          <SummaryItem
            label="近期变化因素"
            value={
              state.changeFactors.length
                ? state.changeFactors.join("、")
                : "待确认"
            }
          />
          <SummaryItem
            label="下一步需要的数据"
            value={getDataNeedSummary(metricDefinitionResult)}
          />
        </dl>
      </section>
    );
  }

  let summary = "系统会根据你的回答逐步整理当前业务问题。";

  if (
    state.metricDefinition &&
    state.comparisonPeriod &&
    state.dimensions.length > 0
  ) {
    summary =
      "当前已确认指标口径、对比周期和优先拆解维度。下一步将确认近期是否存在活动、投放、版本更新或 A/B 实验等业务变化，用于辅助判断指标异动可能原因。";
  } else if (state.metricDefinition && state.comparisonPeriod) {
    summary =
      "当前已确认指标口径和对比周期。下一步将继续确认优先拆解维度，例如用户类型、地区、渠道、商家或业务自定义维度。";
  } else if (state.metricDefinition) {
    summary =
      "当前已确认指标口径，后续将继续确认对比周期、分析维度、近期变化因素和数据需求。";
  } else if (state.businessProblem.trim()) {
    summary = metricDefinitionResult.summaryText;
  }

  return (
    <section className="rounded-lg border border-ink/10 bg-white/72 p-5 shadow-soft backdrop-blur sm:p-6">
      <p className="text-sm font-medium text-accent">当前理解</p>
      <p className="mt-3 text-base leading-7 text-ink/76">{summary}</p>
    </section>
  );
}

function DataFieldUnderstandingCard() {
  return (
    <section className="rounded-lg border border-accent/20 bg-white/78 p-5 shadow-soft backdrop-blur sm:p-6">
      <p className="text-sm font-medium text-accent">数据字段理解</p>
      <p className="mt-3 text-base leading-7 text-ink/76">
        系统已读取上传文件，并根据字段结构判断当前数据能支持的分析方向。
      </p>
    </section>
  );
}

function DataNeedsSection({
  metricDefinitionResult,
}: {
  metricDefinitionResult: MetricDefinitionResult;
}) {
  return (
    <section className="rounded-lg border border-accent/25 bg-white/78 p-5 shadow-soft backdrop-blur sm:p-6">
      <p className="text-sm font-medium text-accent">下一步需要的数据</p>
      <h2 className="mt-2 text-xl font-semibold text-ink">
        为了继续分析，建议准备以下数据
      </h2>
      <ul className="mt-4 grid gap-3 text-sm leading-6 text-ink/72 sm:grid-cols-2">
        {genericDataNeeds.map((item) => (
          <li
            className="rounded-md border border-ink/8 bg-white px-4 py-3"
            key={item}
          >
            {item}
          </li>
        ))}
      </ul>
      {metricDefinitionResult.metricType === "coupon_redemption_rate" ? (
        <div className="mt-5 rounded-lg border border-accent/20 bg-accent/10 p-4">
          <h3 className="text-sm font-semibold text-ink">
            如果是优惠券核销率问题，建议准备
          </h3>
          <ul className="mt-3 grid gap-3 text-sm leading-6 text-ink/70 sm:grid-cols-2">
            {couponDataNeeds.map((item) => (
              <li
                className="rounded-md border border-ink/8 bg-white px-4 py-3"
                key={item}
              >
                {item}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      <p className="mt-4 text-sm leading-6 text-ink/62">
        如果你只有一个合并后的 CSV 或 Excel，也可以先上传，系统会根据字段判断当前能分析到哪一步。
      </p>
    </section>
  );
}

function DataUploadSection({
  isUploading,
  uploadError,
  uploadResult,
  analysisPlan,
  analysisPlanError,
  analysisExecutionError,
  analysisExecutionResult,
  evidenceError,
  evidenceResult,
  isExecutingAnalysis,
  isGeneratingAnalysisPlan,
  isGeneratingEvidence,
  isGeneratingReport,
  onExecuteAnalysis,
  onGenerateEvidence,
  onUploadFiles,
  onGeneratePlan,
  onGenerateReport,
  reportDraft,
  reportError,
}: {
  isUploading: boolean;
  uploadError: string;
  uploadResult: UploadResponse | null;
  analysisPlan: AnalysisPlan | null;
  analysisPlanError: string;
  analysisExecutionError: string;
  analysisExecutionResult: AnalysisExecutionResult | null;
  evidenceError: string;
  evidenceResult: EvidenceResult | null;
  isExecutingAnalysis: boolean;
  isGeneratingAnalysisPlan: boolean;
  isGeneratingEvidence: boolean;
  isGeneratingReport: boolean;
  onExecuteAnalysis: () => void;
  onGenerateEvidence: () => void;
  onUploadFiles: (files: File[]) => void;
  onGeneratePlan: () => void;
  onGenerateReport: () => void;
  reportDraft: ReportDraft | null;
  reportError: string;
}) {
  function handleFileInputChange(event: React.ChangeEvent<HTMLInputElement>) {
    onUploadFiles(Array.from(event.target.files ?? []));
    event.target.value = "";
  }

  function handleDrop(event: React.DragEvent<HTMLLabelElement>) {
    event.preventDefault();
    onUploadFiles(Array.from(event.dataTransfer.files));
  }

  return (
    <section className="rounded-lg border border-ink/10 bg-surface/86 p-5 shadow-soft backdrop-blur sm:p-6">
      <div className="flex flex-col gap-2">
        <p className="text-sm font-medium text-accent">上传数据</p>
        <h2 className="text-xl font-semibold text-ink">
          上传与本次指标异动相关的数据
        </h2>
        <p className="text-sm leading-6 text-ink/62">
          请上传与本次指标异动相关的数据。系统会先识别字段结构，并判断当前数据能支持哪些分析。
        </p>
      </div>

      <div className="mt-4 flex flex-wrap gap-2 text-xs font-medium text-ink/58">
        <span className="rounded-full border border-ink/10 bg-white px-3 py-1">
          支持 CSV
        </span>
        <span className="rounded-full border border-ink/10 bg-white px-3 py-1">
          支持 Excel（.xlsx / .xls）
        </span>
      </div>

      <label
        className="mt-5 flex min-h-36 cursor-pointer flex-col items-center justify-center rounded-lg border border-dashed border-accent/45 bg-white/72 px-5 py-8 text-center transition hover:border-accent hover:bg-white"
        htmlFor="data-files"
        onDragOver={(event) => event.preventDefault()}
        onDrop={handleDrop}
      >
        <span className="text-base font-semibold text-ink">
          点击或拖拽上传数据文件
        </span>
        <span className="mt-2 max-w-2xl text-sm leading-6 text-ink/58">
          如果你只有一个合并后的 CSV 或 Excel，也可以先上传，系统会根据字段判断当前能分析到哪一步。
        </span>
        <input
          accept=".csv,.xlsx,.xls"
          className="sr-only"
          id="data-files"
          multiple
          onChange={handleFileInputChange}
          type="file"
        />
      </label>

      {isUploading ? (
        <p className="mt-4 text-sm font-medium text-accent">
          正在读取文件并识别字段结构……
        </p>
      ) : null}

      {uploadError ? (
        <p className="mt-4 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-700">
          {uploadError}
        </p>
      ) : null}

      {uploadResult ? (
        <>
          <DataSchemaResults uploadResult={uploadResult} />
          <AnalysisPlanAction
            analysisPlanError={analysisPlanError}
            isGeneratingAnalysisPlan={isGeneratingAnalysisPlan}
            onGeneratePlan={onGeneratePlan}
          />
          {analysisPlan ? (
            <>
              <AnalysisPlanSection analysisPlan={analysisPlan} />
              <ExecuteAnalysisAction
                analysisExecutionError={analysisExecutionError}
                isExecutingAnalysis={isExecutingAnalysis}
                onExecuteAnalysis={onExecuteAnalysis}
              />
              {!analysisExecutionResult ? (
                <>
                  <EvidenceChainSection
                    evidenceError={evidenceError}
                    evidenceResult={evidenceResult}
                    isGeneratingEvidence={isGeneratingEvidence}
                    onGenerateEvidence={onGenerateEvidence}
                  />
                  <ReportDraftSection
                    isGeneratingReport={isGeneratingReport}
                    onGenerateReport={onGenerateReport}
                    reportDraft={reportDraft}
                    reportError={reportError}
                  />
                </>
              ) : null}
            </>
          ) : (
            <ExecuteAnalysisAction
              analysisExecutionError={analysisExecutionError}
              isExecutingAnalysis={isExecutingAnalysis}
              onExecuteAnalysis={onExecuteAnalysis}
            />
          )}
          {analysisExecutionResult ? (
            <AnalysisExecutionResultSection
              evidenceError={evidenceError}
              evidenceResult={evidenceResult}
              executionResult={analysisExecutionResult}
              isGeneratingEvidence={isGeneratingEvidence}
              isGeneratingReport={isGeneratingReport}
              onGenerateEvidence={onGenerateEvidence}
              onGenerateReport={onGenerateReport}
              reportDraft={reportDraft}
              reportError={reportError}
            />
          ) : null}
        </>
      ) : (
        <>
          <AnalysisPlanAction
            analysisPlanError={analysisPlanError}
            isGeneratingAnalysisPlan={isGeneratingAnalysisPlan}
            onGeneratePlan={onGeneratePlan}
          />
          <ExecuteAnalysisAction
            analysisExecutionError={analysisExecutionError}
            isExecutingAnalysis={isExecutingAnalysis}
            onExecuteAnalysis={onExecuteAnalysis}
          />
        </>
      )}
    </section>
  );
}

function AnalysisPlanAction({
  analysisPlanError,
  isGeneratingAnalysisPlan,
  onGeneratePlan,
}: {
  analysisPlanError: string;
  isGeneratingAnalysisPlan: boolean;
  onGeneratePlan: () => void;
}) {
  return (
    <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:items-center">
      <button
        className="rounded-lg bg-ink px-5 py-3 text-sm font-semibold text-surface transition hover:bg-accent focus:outline-none focus:ring-4 focus:ring-accent/18 disabled:cursor-not-allowed disabled:bg-ink/35"
        disabled={isGeneratingAnalysisPlan}
        onClick={onGeneratePlan}
        type="button"
      >
        {isGeneratingAnalysisPlan ? "正在生成分析计划" : "生成分析计划"}
      </button>
      {analysisPlanError ? (
        <p className="text-sm font-medium text-red-700">{analysisPlanError}</p>
      ) : null}
    </div>
  );
}

function AnalysisPlanSection({
  analysisPlan,
}: {
  analysisPlan: AnalysisPlan;
}) {
  return (
    <section className="mt-6 rounded-lg border border-accent/25 bg-white/82 p-5 shadow-soft">
      <p className="text-sm font-medium text-accent">分析计划</p>
      <div className="mt-4 grid gap-4">
        <AnalysisPlanCard title="分析目标">
          <p className="text-sm leading-6 text-ink/72">
            {analysisPlan.analysis_goal}
          </p>
        </AnalysisPlanCard>

        <AnalysisPlanCard title="指标与周期">
          <dl className="grid gap-3 text-sm sm:grid-cols-2">
            <SummaryItem
              label="指标口径"
              value={analysisPlan.metric_summary.metric_definition}
            />
            <SummaryItem
              label="对比周期"
              value={analysisPlan.metric_summary.comparison_period}
            />
          </dl>
        </AnalysisPlanCard>

        <AnalysisPlanCard title="字段匹配情况">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] border-collapse text-left text-sm">
              <thead>
                <tr className="border-b border-ink/10 text-xs text-ink/48">
                  <th className="py-2 pr-4 font-medium">分析需求</th>
                  <th className="py-2 pr-4 font-medium">匹配字段</th>
                  <th className="py-2 pr-4 font-medium">状态</th>
                  <th className="py-2 pr-4 font-medium">说明</th>
                </tr>
              </thead>
              <tbody>
                {analysisPlan.field_mapping.map((item) => (
                  <tr className="border-b border-ink/6" key={item.analysis_need}>
                    <td className="py-3 pr-4 font-medium text-ink">
                      {item.analysis_need}
                    </td>
                    <td className="py-3 pr-4 text-ink/66">
                      {item.matched_field ?? "暂无匹配字段"}
                    </td>
                    <td className="py-3 pr-4">
                      <FieldStatusBadge status={item.status} />
                    </td>
                    <td className="py-3 pr-4 text-ink/62">{item.note}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </AnalysisPlanCard>

        <AnalysisPlanCard title="分析步骤">
          <div className="space-y-3">
            {analysisPlan.analysis_steps.map((step) => (
              <article
                className="rounded-md border border-ink/8 bg-surface/70 p-4"
                key={step.step}
              >
                <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <p className="text-xs font-medium text-ink/46">
                      Step {step.step}
                    </p>
                    <h4 className="mt-1 text-base font-semibold text-ink">
                      {step.title}
                    </h4>
                  </div>
                  <StepStatusBadge status={step.status} />
                </div>
                <p className="mt-3 text-sm leading-6 text-ink/66">
                  {step.description}
                </p>
                <p className="mt-3 text-sm leading-6 text-ink/58">
                  需要字段：{step.required_fields.join("、")}
                </p>
              </article>
            ))}
          </div>
        </AnalysisPlanCard>

        <AnalysisPlanCard title="当前限制">
          <ul className="space-y-2 text-sm leading-6 text-ink/66">
            {analysisPlan.analysis_limitations.map((item) => (
              <li className="rounded-md bg-ink/[0.04] px-3 py-2" key={item}>
                {item}
              </li>
            ))}
          </ul>
        </AnalysisPlanCard>

        <AnalysisPlanCard title="下一步">
          <p className="text-sm leading-6 text-ink/72">
            {analysisPlan.next_action}
          </p>
        </AnalysisPlanCard>
      </div>
    </section>
  );
}

function ExecuteAnalysisAction({
  analysisExecutionError,
  isExecutingAnalysis,
  onExecuteAnalysis,
}: {
  analysisExecutionError: string;
  isExecutingAnalysis: boolean;
  onExecuteAnalysis: () => void;
}) {
  return (
    <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:items-center">
      <button
        className="rounded-lg bg-accent px-5 py-3 text-sm font-semibold text-white transition hover:bg-ink focus:outline-none focus:ring-4 focus:ring-accent/18 disabled:cursor-not-allowed disabled:bg-ink/35"
        disabled={isExecutingAnalysis}
        onClick={onExecuteAnalysis}
        type="button"
      >
        {isExecutingAnalysis ? "正在执行基础分析" : "执行基础分析"}
      </button>
      {analysisExecutionError ? (
        <p className="text-sm font-medium text-red-700">
          {analysisExecutionError}
        </p>
      ) : null}
    </div>
  );
}

function AnalysisExecutionResultSection({
  evidenceError,
  evidenceResult,
  executionResult,
  isGeneratingEvidence,
  isGeneratingReport,
  onGenerateEvidence,
  onGenerateReport,
  reportDraft,
  reportError,
}: {
  evidenceError: string;
  evidenceResult: EvidenceResult | null;
  executionResult: AnalysisExecutionResult;
  isGeneratingEvidence: boolean;
  isGeneratingReport: boolean;
  onGenerateEvidence: () => void;
  onGenerateReport: () => void;
  reportDraft: ReportDraft | null;
  reportError: string;
}) {
  return (
    <section className="mt-6 rounded-lg border border-accent/25 bg-white/82 p-5 shadow-soft">
      <p className="text-sm font-medium text-accent">分析执行结果</p>
      <p className="mt-3 text-base leading-7 text-ink/76">
        {executionResult.execution_summary}
      </p>
      <AnalysisCharts tables={executionResult.tables} />
      <EvidenceChainSection
        evidenceError={evidenceError}
        evidenceResult={evidenceResult}
        isGeneratingEvidence={isGeneratingEvidence}
        onGenerateEvidence={onGenerateEvidence}
      />
      <ReportDraftSection
        isGeneratingReport={isGeneratingReport}
        onGenerateReport={onGenerateReport}
        reportDraft={reportDraft}
        reportError={reportError}
      />

      <div className="mt-5 space-y-4">
        {executionResult.tables.map((table) => (
          <ExecutionResultTableCard key={table.id} table={table} />
        ))}
      </div>

      {executionResult.limitations.length ? (
        <section className="mt-5 rounded-lg border border-ink/10 bg-white p-4">
          <h3 className="text-base font-semibold text-ink">当前限制</h3>
          <ul className="mt-3 space-y-2 text-sm leading-6 text-ink/66">
            {executionResult.limitations.map((item) => (
              <li className="rounded-md bg-ink/[0.04] px-3 py-2" key={item}>
                {item}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {executionResult.analysis_notes.length ? (
        <section className="mt-5 rounded-lg border border-ink/10 bg-white p-4">
          <h3 className="text-base font-semibold text-ink">注意事项</h3>
          <ul className="mt-3 space-y-2 text-sm leading-6 text-ink/66">
            {executionResult.analysis_notes.map((item) => (
              <li className="rounded-md bg-ink/[0.04] px-3 py-2" key={item}>
                {item}
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </section>
  );
}

function ExecutionResultTableCard({
  table,
}: {
  table: ExecutionResultTable;
}) {
  const visibleRows = table.rows.slice(0, 20);

  return (
    <article className="rounded-lg border border-ink/10 bg-white p-4">
      <div>
        <h3 className="text-base font-semibold text-ink">{table.title}</h3>
        <p className="mt-2 text-sm leading-6 text-ink/58">
          {table.description}
        </p>
      </div>

      {visibleRows.length ? (
        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[720px] border-collapse text-left text-sm">
            <thead>
              <tr className="border-b border-ink/10 text-xs text-ink/48">
                {table.columns.map((column) => (
                  <th className="py-2 pr-4 font-medium" key={column}>
                    {column}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {visibleRows.map((row, rowIndex) => (
                <tr className="border-b border-ink/6" key={rowIndex}>
                  {table.columns.map((column) => (
                    <td className="max-w-xs py-3 pr-4 text-ink/66" key={column}>
                      {formatCellValue(row[column])}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
          {table.rows.length > 20 ? (
            <p className="mt-3 text-xs text-ink/46">
              当前仅展示前 20 行结果。
            </p>
          ) : null}
        </div>
      ) : (
        <p className="mt-4 text-sm text-ink/58">该结果表暂无可展示数据。</p>
      )}
    </article>
  );
}

function AnalysisPlanCard({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-lg border border-ink/10 bg-white p-4">
      <h3 className="text-base font-semibold text-ink">{title}</h3>
      <div className="mt-3">{children}</div>
    </section>
  );
}

function FieldStatusBadge({ status }: { status: FieldMappingStatus }) {
  const labelMap: Record<FieldMappingStatus, string> = {
    matched: "已匹配",
    missing: "缺失",
    partial: "部分支持",
  };

  return <StatusBadge label={labelMap[status]} tone={status} />;
}

function StepStatusBadge({ status }: { status: AnalysisStepStatus }) {
  const labelMap: Record<AnalysisStepStatus, string> = {
    ready: "可执行",
    partial: "部分支持",
    blocked: "暂不支持",
  };

  const toneMap: Record<AnalysisStepStatus, FieldMappingStatus> = {
    ready: "matched",
    partial: "partial",
    blocked: "missing",
  };

  return <StatusBadge label={labelMap[status]} tone={toneMap[status]} />;
}

function StatusBadge({
  label,
  tone,
}: {
  label: string;
  tone: FieldMappingStatus;
}) {
  const className =
    tone === "matched"
      ? "border-accent/25 bg-accent/10 text-accent"
      : tone === "partial"
        ? "border-amber-200 bg-amber-50 text-amber-700"
        : "border-red-200 bg-red-50 text-red-700";

  return (
    <span
      className={`inline-flex rounded-full border px-3 py-1 text-xs font-semibold ${className}`}
    >
      {label}
    </span>
  );
}

function DataSchemaResults({ uploadResult }: { uploadResult: UploadResponse }) {
  return (
    <div className="mt-6 space-y-5">
      <section>
        <h3 className="text-lg font-semibold text-ink">数据识别结果</h3>
        <div className="mt-4 space-y-4">
          {uploadResult.files.map((file) => (
            <FileSchemaCard file={file} key={`${file.filename}-${file.table_name}`} />
          ))}
        </div>
      </section>

      <section className="rounded-lg border border-ink/10 bg-white p-4">
        <h3 className="text-base font-semibold text-ink">
          当前数据可支持的分析
        </h3>
        {uploadResult.supported_analysis.length ? (
          <div className="mt-3 flex flex-wrap gap-2">
            {uploadResult.supported_analysis.map((item) => (
              <span
                className="rounded-full border border-accent/25 bg-accent/10 px-3 py-1 text-sm font-medium text-accent"
                key={item}
              >
                {item}
              </span>
            ))}
          </div>
        ) : (
          <p className="mt-3 text-sm leading-6 text-ink/58">
            暂未识别到可直接支持的分析方向，建议补充时间、用户、地区、渠道、金额或订单等字段。
          </p>
        )}
      </section>

      <section className="rounded-lg border border-ink/10 bg-white p-4">
        <h3 className="text-base font-semibold text-ink">
          当前数据暂不支持的部分
        </h3>
        {uploadResult.missing_requirements.length ? (
          <ul className="mt-3 space-y-2 text-sm leading-6 text-ink/66">
            {uploadResult.missing_requirements.map((item) => (
              <li className="rounded-md bg-ink/[0.04] px-3 py-2" key={item}>
                {item}
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-3 text-sm leading-6 text-ink/58">
            当前未发现明显缺失项，后续仍会在分析计划中继续校验字段含义。
          </p>
        )}
      </section>
    </div>
  );
}

function FileSchemaCard({ file }: { file: UploadFileSchema }) {
  return (
    <article className="rounded-lg border border-ink/10 bg-white p-4">
      <div className="grid gap-3 text-sm sm:grid-cols-4">
        <SummaryItem label="文件名" value={file.filename} />
        <SummaryItem label="表名" value={file.table_name} />
        <SummaryItem label="行数" value={file.row_count.toLocaleString("zh-CN")} />
        <SummaryItem
          label="字段数量"
          value={file.column_count.toLocaleString("zh-CN")}
        />
      </div>

      <div className="mt-5 overflow-x-auto">
        <table className="w-full min-w-[720px] border-collapse text-left text-sm">
          <thead>
            <tr className="border-b border-ink/10 text-xs text-ink/48">
              <th className="py-2 pr-4 font-medium">原始字段名</th>
              <th className="py-2 pr-4 font-medium">清洗后字段名</th>
              <th className="py-2 pr-4 font-medium">字段类型</th>
              <th className="py-2 pr-4 font-medium">缺失率</th>
              <th className="py-2 pr-4 font-medium">样例值</th>
            </tr>
          </thead>
          <tbody>
            {file.columns.map((column) => (
              <tr className="border-b border-ink/6" key={column.clean_name}>
                <td className="py-3 pr-4 text-ink/76">{column.original_name}</td>
                <td className="py-3 pr-4 font-medium text-ink">
                  {column.clean_name}
                </td>
                <td className="py-3 pr-4 text-ink/66">{column.dtype}</td>
                <td className="py-3 pr-4 text-ink/66">
                  {formatMissingRate(column.missing_rate)}
                </td>
                <td className="max-w-xs py-3 pr-4 text-ink/58">
                  {formatSampleValues(column.sample_values)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="mt-5">
        <h4 className="text-sm font-semibold text-ink">前 5 行样例数据</h4>
        <SampleRowsTable file={file} />
      </div>
    </article>
  );
}

function SampleRowsTable({ file }: { file: UploadFileSchema }) {
  const columnNames = file.columns.map((column) => column.clean_name);

  if (file.sample_rows.length === 0) {
    return <p className="mt-3 text-sm text-ink/58">文件中暂无可展示样例行。</p>;
  }

  return (
    <div className="mt-3 overflow-x-auto">
      <table className="w-full min-w-[720px] border-collapse text-left text-xs">
        <thead>
          <tr className="border-b border-ink/10 text-ink/48">
            {columnNames.map((columnName) => (
              <th className="py-2 pr-4 font-medium" key={columnName}>
                {columnName}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {file.sample_rows.map((row, rowIndex) => (
            <tr className="border-b border-ink/6" key={rowIndex}>
              {columnNames.map((columnName) => (
                <td className="max-w-xs py-2 pr-4 text-ink/62" key={columnName}>
                  {formatCellValue(row[columnName])}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function SummaryItem({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-ink/8 bg-surface/70 px-4 py-3">
      <dt className="text-xs font-medium text-ink/48">{label}</dt>
      <dd className="mt-1 leading-6 text-ink/78">{value}</dd>
    </div>
  );
}

function getSelectedLabels(
  selectedIds: string[],
  options: SingleOption[],
  customValue = "",
) {
  const labels = selectedIds
    .filter((id) => id !== "custom")
    .map((id) => options.find((option) => option.id === id)?.title)
    .filter((title): title is string => Boolean(title));

  if (selectedIds.includes("custom") && customValue.trim()) {
    labels.push(customValue.trim());
  }

  return labels;
}

function getMetricQuestionTitle(result: MetricDefinitionResult) {
  if (!result.metricName) {
    return "你想分析的指标更接近哪一种口径？";
  }

  return `你说的“${result.metricName}”更接近哪一种口径？`;
}

function getCustomMetricPlaceholder(result: MetricDefinitionResult) {
  if (!result.metricName) {
    return "请补充你们业务中该指标的计算方式……";
  }

  return `请补充你们业务中“${result.metricName}”的计算方式……`;
}

function getDataNeedSummary(result: MetricDefinitionResult) {
  if (result.metricType === "coupon_redemption_rate") {
    return [...genericDataNeeds, ...couponDataNeeds].join("、");
  }

  return genericDataNeeds.join("、");
}

function getReadinessWithUploadState(
  readiness: ReadinessState,
  uploadResult: UploadResponse | null,
): ReadinessState {
  if (!uploadResult) {
    return readiness;
  }

  const confirmedInfo = readiness.confirmed_info.filter(
    (item) => !item.startsWith("数据状态："),
  );
  const missingInfo = readiness.missing_info.filter(
    (item) =>
      item !== "数据需求" &&
      !item.startsWith("数据需求：") &&
      item !== "数据字段匹配情况待确认",
  );
  const dataRequirementStatus = uploadResult.supported_analysis.length
    ? "数据需求：已初步满足"
    : "数据字段匹配情况待确认";

  return {
    ...readiness,
    confirmed_info: [...confirmedInfo, "数据状态：已上传并完成字段识别"],
    missing_info: [...missingInfo, dataRequirementStatus],
    next_question: "可以生成分析计划，系统将在下一阶段规划具体拆解路径。",
  };
}

function formatMissingRate(value: number) {
  return `${Math.round(value * 1000) / 10}%`;
}

function formatSampleValues(values: unknown[]) {
  if (!values.length) {
    return "暂无样例";
  }

  return values.map(formatCellValue).join("、");
}

function formatCellValue(value: unknown) {
  if (value === null || value === undefined || value === "") {
    return "空";
  }

  if (typeof value === "object") {
    return JSON.stringify(value);
  }

  return String(value);
}
