"use client";

import { type ReactNode, useEffect, useMemo, useState } from "react";
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
  generateBusinessClarificationWithLlm,
  generateLocalBusinessClarification,
  type BusinessClarificationResult,
} from "@/lib/business-clarification";
import { getInitialLlmSettings, isLlmConfigured } from "@/lib/llm-settings";
import {
  uploadDataFiles,
  type UploadFileSchema,
  type UploadResponse,
} from "@/lib/data-upload";
import {
  generateAnalysisPlan,
  type AnalysisPlan,
  type AnalysisPlanInput,
  type AnalysisStepStatus,
  type FieldMappingStatus,
} from "@/lib/analysis-plan";
import { generateAnalysisPlanWithLlm } from "@/lib/llm-analysis-plan";
import {
  buildMetricSpec,
  type MetricSpec,
} from "@/lib/metric-spec";
import {
  executeMetricSpec,
  type MetricSpecExecutionResult,
} from "@/lib/metric-spec-execution";
import {
  executeBasicAnalysis,
  type AnalysisExecutionResult,
  type ExecutionResultTable,
} from "@/lib/analysis-execution";
import {
  generateEvidenceChain,
  type EvidenceInput,
  type EvidenceResult,
} from "@/lib/evidence-chain";
import { generateEvidenceChainWithLlm } from "@/lib/llm-evidence-chain";
import {
  generateReportDraft,
  type ReportDraftInput,
  type ReportDraft,
} from "@/lib/report-draft";
import { generateReportDraftWithLlm } from "@/lib/llm-report-draft";
import {
  asyncTaskDefinitions,
  getAsyncTaskStepIndex,
  type AsyncTaskFeedback,
  type AsyncTaskId,
} from "@/lib/task-feedback";
import { AnalysisCharts } from "@/components/analysis-charts";
import { ApiSettings } from "@/components/api-settings";
import { EvidenceChainSection } from "@/components/evidence-chain";
import { ReportDraftSection } from "@/components/report-draft";

type SingleOption = {
  id: string;
  title: string;
  definition?: string;
  description: string;
};

type WorkflowStepId =
  | "business_problem"
  | "metric_definition"
  | "comparison_period"
  | "dimensions"
  | "change_factors"
  | "upload_data"
  | "analysis_plan"
  | "metric_calculation"
  | "evidence_chain"
  | "report_draft";

type WorkflowStep = {
  id: WorkflowStepId;
  label: string;
  shortLabel: string;
};

type StarterExample = {
  title: string;
  problem: string;
  metricDefinition: string;
};

const workflowSteps: WorkflowStep[] = [
  { id: "business_problem", label: "描述业务问题", shortLabel: "问题" },
  { id: "metric_definition", label: "确认指标口径", shortLabel: "口径" },
  { id: "comparison_period", label: "确认对比周期", shortLabel: "周期" },
  { id: "dimensions", label: "确认分析维度", shortLabel: "维度" },
  { id: "change_factors", label: "确认近期变化因素", shortLabel: "变化" },
  { id: "upload_data", label: "上传数据", shortLabel: "上传" },
  { id: "analysis_plan", label: "生成分析计划", shortLabel: "计划" },
  { id: "metric_calculation", label: "执行指标计算", shortLabel: "计算" },
  { id: "evidence_chain", label: "生成证据链", shortLabel: "证据" },
  { id: "report_draft", label: "生成报告草稿", shortLabel: "报告" },
];

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

const specialChangeFactorIds = ["none", "unknown"];

const panelClassName =
  "relative overflow-hidden rounded-[30px] border border-white/10 bg-[radial-gradient(circle_at_18%_0%,rgba(34,211,238,0.14),transparent_34%),radial-gradient(circle_at_82%_12%,rgba(168,85,247,0.16),transparent_36%),linear-gradient(180deg,rgba(23,26,38,0.98),rgba(9,11,17,0.94))] p-6 shadow-[0_28px_100px_rgba(0,0,0,0.36),inset_0_1px_0_rgba(255,255,255,0.055)] backdrop-blur-xl transition-colors before:pointer-events-none before:absolute before:inset-x-7 before:top-0 before:h-1 before:rounded-b-full before:bg-[linear-gradient(90deg,rgba(34,211,238,0.12),rgba(34,211,238,0.95),rgba(168,85,247,0.9),rgba(217,70,239,0.72),rgba(251,146,60,0.7),rgba(34,211,238,0.12))] before:shadow-[0_0_18px_rgba(103,232,249,0.18)] before:content-[''] hover:border-cyan-200/18 sm:p-8";
const primaryButtonClassName =
  "min-h-12 rounded-full bg-[linear-gradient(135deg,rgba(34,211,238,0.95),rgba(124,58,237,0.92))] px-6 py-3 text-sm font-semibold text-white shadow-[0_14px_34px_rgba(34,211,238,0.14)] transition hover:translate-y-[-1px] hover:shadow-[0_18px_42px_rgba(124,58,237,0.18)] focus:outline-none focus:ring-4 focus:ring-accent/18 disabled:cursor-not-allowed disabled:bg-none disabled:bg-white/12 disabled:text-white/40 disabled:shadow-none";
const secondaryButtonClassName =
  "min-h-11 rounded-full border border-white/10 bg-white/5 px-4 py-2.5 text-sm font-semibold text-ink/68 transition hover:border-accent/40 hover:text-accent focus:outline-none focus:ring-4 focus:ring-accent/18 disabled:cursor-not-allowed disabled:border-white/8 disabled:bg-white/4 disabled:text-ink/34";

const starterExamples: StarterExample[] = [
  {
    title: "SaaS 激活",
    problem: "最近新用户 7 日激活率明显下降，但注册用户数没有明显下降。",
    metricDefinition: "新注册用户在注册后 7 天内完成关键激活动作的比例",
  },
  {
    title: "客服 SLA",
    problem: "最近客服 SLA 超时率上升，整体工单量没有同步大幅增加。",
    metricDefinition: "超过 SLA 承诺处理时长的工单数 / 总工单数",
  },
  {
    title: "物流履约",
    problem: "最近物流配送延迟率明显上升，但总运单量没有明显下降。",
    metricDefinition: "延迟送达运单数 / 总运单数",
  },
  {
    title: "Valorant 胜率",
    problem: "最近 Valorant 排位胜率下降，但对局数量和玩家在线时长基本稳定。",
    metricDefinition: "获胜对局数 / 总排位对局数",
  },
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
  const [analysisPlanNotice, setAnalysisPlanNotice] = useState("");
  const [isGeneratingAnalysisPlan, setIsGeneratingAnalysisPlan] =
    useState(false);
  const [metricSpec, setMetricSpec] = useState<MetricSpec | null>(null);
  const [metricSpecError, setMetricSpecError] = useState("");
  const [metricSpecExecutionResult, setMetricSpecExecutionResult] =
    useState<MetricSpecExecutionResult | null>(null);
  const [metricSpecExecutionError, setMetricSpecExecutionError] = useState("");
  const [isExecutingMetricSpec, setIsExecutingMetricSpec] = useState(false);
  const [analysisExecutionResult, setAnalysisExecutionResult] =
    useState<AnalysisExecutionResult | null>(null);
  const [analysisExecutionError, setAnalysisExecutionError] = useState("");
  const [isExecutingAnalysis, setIsExecutingAnalysis] = useState(false);
  const [evidenceResult, setEvidenceResult] = useState<EvidenceResult | null>(
    null,
  );
  const [evidenceError, setEvidenceError] = useState("");
  const [evidenceNotice, setEvidenceNotice] = useState("");
  const [isGeneratingEvidence, setIsGeneratingEvidence] = useState(false);
  const [reportDraft, setReportDraft] = useState<ReportDraft | null>(null);
  const [reportError, setReportError] = useState("");
  const [reportNotice, setReportNotice] = useState("");
  const [isGeneratingReport, setIsGeneratingReport] = useState(false);
  const [businessClarificationResult, setBusinessClarificationResult] =
    useState<BusinessClarificationResult | null>(null);
  const [isGeneratingMetricDefinitions, setIsGeneratingMetricDefinitions] =
    useState(false);
  const [metricDefinitionNotice, setMetricDefinitionNotice] = useState("");
  const [activeStepId, setActiveStepId] =
    useState<WorkflowStepId>("business_problem");
  const [isGuideOpen, setIsGuideOpen] = useState(false);
  const [taskFeedback, setTaskFeedback] =
    useState<AsyncTaskFeedback | null>(null);
  const [taskFeedbackNow, setTaskFeedbackNow] = useState(() => Date.now());

  const localBusinessClarificationResult = useMemo(
    () => generateLocalBusinessClarification(clarificationState.businessProblem),
    [clarificationState.businessProblem],
  );
  const activeBusinessClarification =
    businessClarificationResult ?? localBusinessClarificationResult;
  const localMetricDefinitionResult = useMemo(
    () => generateMetricDefinitions(clarificationState.businessProblem),
    [clarificationState.businessProblem],
  );
  const metricDefinitionResult =
    activeBusinessClarification.metricDefinitionResult ??
    localMetricDefinitionResult;
  const dimensionOptions = activeBusinessClarification.dimensionCards;
  const changeFactorOptions = activeBusinessClarification.changeFactorCards;
  const dataRequirements = activeBusinessClarification.dataRequirements;

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
  const completedWorkflowStepIds = useMemo(
    () =>
      getCompletedWorkflowStepIds({
        state: clarificationState,
        hasStarted,
        uploadResult,
        analysisPlan,
        metricSpecExecutionResult,
        evidenceResult,
        reportDraft,
      }),
    [
      analysisPlan,
      clarificationState,
      evidenceResult,
      hasStarted,
      metricSpecExecutionResult,
      reportDraft,
      uploadResult,
    ],
  );
  const activeWorkflowStep =
    workflowSteps.find((step) => step.id === activeStepId) ?? workflowSteps[0];
  const activeStepIndex = workflowSteps.findIndex(
    (step) => step.id === activeWorkflowStep.id,
  );
  const workflowProgress = Math.round(
    (completedWorkflowStepIds.length / workflowSteps.length) * 100,
  );
  const taskStepIndex = taskFeedback
    ? getAsyncTaskStepIndex(taskFeedback, taskFeedbackNow)
    : 0;

  useEffect(() => {
    if (taskFeedback?.status !== "running") {
      return;
    }

    const timer = window.setInterval(() => {
      setTaskFeedbackNow(Date.now());
    }, 500);

    return () => window.clearInterval(timer);
  }, [taskFeedback?.status, taskFeedback?.startedAt]);

  function beginTaskFeedback(taskId: AsyncTaskId) {
    const now = Date.now();
    setTaskFeedback({
      taskId,
      status: "running",
      startedAt: now,
    });
    setTaskFeedbackNow(now);
  }

  function completeTaskFeedback(taskId: AsyncTaskId) {
    const now = Date.now();
    setTaskFeedback((current) => ({
      taskId,
      status: "success",
      startedAt: current?.taskId === taskId ? current.startedAt : now,
      finishedAt: now,
    }));
    setTaskFeedbackNow(now);
  }

  function failTaskFeedback(taskId: AsyncTaskId, errorMessage: string) {
    const now = Date.now();
    setTaskFeedback((current) => ({
      taskId,
      status: "error",
      startedAt: current?.taskId === taskId ? current.startedAt : now,
      finishedAt: now,
      errorMessage,
    }));
    setTaskFeedbackNow(now);
  }

  function getVisibleTaskFeedback(taskId: AsyncTaskId) {
    return taskFeedback?.taskId === taskId ? taskFeedback : null;
  }

  function handleSelectStarterExample(example: StarterExample) {
    setClarificationState((current) => ({
      ...current,
      businessProblem: example.problem,
      analysisTarget: "",
    }));
    setBusinessClarificationResult(null);
    setMetricDefinitionNotice("");
  }

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
    const businessProblem = clarificationState.businessProblem.trim();
    setSelectedMetricOptionId(null);
    setSelectedComparisonOptionId(null);
    setSelectedDimensionIds([]);
    setCustomDimension("");
    setSelectedChangeFactorIds([]);
    setMetricDefinitionNotice("");
    setBusinessClarificationResult(null);
    resetUploadState();

    const llmSettings = getInitialLlmSettings();
    const localClarification = generateLocalBusinessClarification(businessProblem);
    const nextState = {
      ...clarificationState,
      businessProblem,
      analysisTarget: localClarification.metricDefinitionResult.analysisTarget,
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

    if (isLlmConfigured(llmSettings)) {
      setIsGeneratingMetricDefinitions(true);
      try {
        const generated = await generateBusinessClarificationWithLlm(
          businessProblem,
          llmSettings,
        );
        setBusinessClarificationResult(generated);
        nextState.analysisTarget = generated.metricDefinitionResult.analysisTarget;
        setMetricDefinitionNotice(getBusinessClarificationNotice(generated));
      } catch (error) {
        setBusinessClarificationResult(localClarification);
        nextState.analysisTarget =
          localClarification.metricDefinitionResult.analysisTarget;
        const reason =
          error instanceof Error ? error.message : "LLM 接口调用失败";
        setMetricDefinitionNotice(
          `AI 业务澄清生成失败：${reason}。已使用本地规则继续生成澄清卡片。`,
        );
      } finally {
        setIsGeneratingMetricDefinitions(false);
      }
    } else {
      setBusinessClarificationResult(localClarification);
      nextState.analysisTarget =
        localClarification.metricDefinitionResult.analysisTarget;
      setMetricDefinitionNotice(
        "当前使用本地规则生成澄清卡片。你也可以在 API 设置中配置模型，获得更贴合场景的业务澄清。",
      );
    }

    const nextReadiness = await evaluateReadiness(nextState);
    setClarificationState(nextState);
    setReadiness(nextReadiness);
    setIsEvaluating(false);
    setActiveStepId("metric_definition");
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
    if (option.id !== "custom") {
      setActiveStepId("comparison_period");
    }
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
    if (value.trim()) {
      setActiveStepId("comparison_period");
    }
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
    if (option.id !== "custom") {
      setActiveStepId("dimensions");
    }
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
    if (value.trim()) {
      setActiveStepId("dimensions");
    }
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
    setActiveStepId("change_factors");
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
    setActiveStepId("upload_data");
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
    setAnalysisPlanNotice("");
    setIsGeneratingAnalysisPlan(false);
    setMetricSpecError("");
    setMetricSpecExecutionResult(null);
    setMetricSpecExecutionError("");
    setIsExecutingMetricSpec(false);
    setAnalysisExecutionResult(null);
    setAnalysisExecutionError("");
    setIsExecutingAnalysis(false);
    setEvidenceResult(null);
    setEvidenceError("");
    setEvidenceNotice("");
    setIsGeneratingEvidence(false);
    setReportDraft(null);
    setReportError("");
    setReportNotice("");
    setIsGeneratingReport(false);
    setTaskFeedback(null);
  }

  async function handleUploadFiles(files: File[]) {
    if (isUploading) {
      return;
    }

    const selectedFiles = files.filter(isValidBrowserFile);

    setUploadError("");
    setAnalysisPlanError("");
    setAnalysisPlanNotice("");
    setMetricSpecError("");
    setMetricSpecExecutionError("");
    setAnalysisExecutionError("");
    setEvidenceError("");
    setEvidenceNotice("");
    setReportError("");
    setReportNotice("");

    if (selectedFiles.length !== files.length || selectedFiles.length === 0) {
      const message = "上传失败：没有读取到有效文件，请重新选择 CSV 或 Excel 文件。";
      setUploadError(message);
      failTaskFeedback("upload_data", message);
      return;
    }

    beginTaskFeedback("upload_data");
    setIsUploading(true);

    try {
      const uploadBusinessContext = {
        businessProblem: clarificationState.businessProblem,
        businessDomain: activeBusinessClarification.businessDomain,
        metricName: metricDefinitionResult.metricName,
        metricDefinition: clarificationState.metricDefinition,
        detectedScenario: activeBusinessClarification.detectedScenario,
        selectedDimensions: clarificationState.dimensions,
        selectedChangeFactors: clarificationState.changeFactors,
        dataRequirements,
      };
      const nextUploadResult = await uploadDataFiles(
        selectedFiles,
        uploadBusinessContext,
      );
      setUploadResult(nextUploadResult);
      clearGeneratedOutputsAfterUploadSuccess();
      setUploadError("");
      completeTaskFeedback("upload_data");
      setActiveStepId("analysis_plan");
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "数据上传失败，请稍后重试。";
      setUploadError(message);
      failTaskFeedback("upload_data", message);
    } finally {
      setIsUploading(false);
    }
  }

  function clearGeneratedOutputsAfterUploadSuccess() {
    setAnalysisPlan(null);
    setMetricSpec(null);
    setMetricSpecExecutionResult(null);
    setAnalysisExecutionResult(null);
    setEvidenceResult(null);
    setReportDraft(null);
  }

  async function handleGenerateAnalysisPlan() {
    if (isGeneratingAnalysisPlan) {
      return;
    }

    if (!uploadResult) {
      const message = "请先上传数据并完成字段识别。";
      setAnalysisPlanNotice("");
      setAnalysisPlanError(message);
      failTaskFeedback("analysis_plan", message);
      return;
    }

    const planInput: AnalysisPlanInput = {
      businessProblem: clarificationState.businessProblem,
      metricDefinition: clarificationState.metricDefinition,
      comparisonPeriod: clarificationState.comparisonPeriod,
      dimensions: clarificationState.dimensions,
      changeFactors: clarificationState.changeFactors,
      uploadedSchema: uploadResult,
    };
    const llmSettings = getInitialLlmSettings();

    beginTaskFeedback("analysis_plan");
    setIsGeneratingAnalysisPlan(true);
    setAnalysisPlanError("");
    setAnalysisPlanNotice("");
    setMetricSpecError("");
    setMetricSpecExecutionError("");
    setAnalysisExecutionError("");
    setEvidenceError("");
    setEvidenceNotice("");
    setReportError("");
    setReportNotice("");

    try {
      if (
        isLlmConfigured(llmSettings) &&
        !hasAuxiliaryMetricComparisons(metricSpecExecutionResult)
      ) {
        try {
          const llmAnalysisPlan = await generateAnalysisPlanWithLlm(
            planInput,
            llmSettings,
          );
          setAnalysisPlan(llmAnalysisPlan);
          await handleBuildMetricSpec(llmAnalysisPlan);
          clearGeneratedOutputsAfterNewPlan();
          completeTaskFeedback("analysis_plan");
          setActiveStepId("metric_calculation");
          setAnalysisPlanNotice(
            llmAnalysisPlan.source === "llm"
              ? "AI 已根据业务问题和数据字段生成分析计划。"
              : `AI 分析计划生成失败：${llmAnalysisPlan.fallback_reason ?? "LLM 调用失败"}。已使用本地规则继续生成分析计划。`,
          );
          return;
        } catch (error) {
          const localPlan = await generateAnalysisPlan(planInput);
          const reason =
            error instanceof Error ? error.message : "LLM 接口调用失败";
          setAnalysisPlan(localPlan);
          await handleBuildMetricSpec(localPlan);
          clearGeneratedOutputsAfterNewPlan();
          completeTaskFeedback("analysis_plan");
          setActiveStepId("metric_calculation");
          setAnalysisPlanNotice(
            `AI 分析计划生成失败：${reason}。已使用本地规则继续生成分析计划。`,
          );
          return;
        }
      }

      const nextAnalysisPlan = await generateAnalysisPlan(planInput);
      setAnalysisPlan(nextAnalysisPlan);
      await handleBuildMetricSpec(nextAnalysisPlan);
      clearGeneratedOutputsAfterNewPlan();
      completeTaskFeedback("analysis_plan");
      setActiveStepId("metric_calculation");
      setAnalysisPlanNotice(
        "当前使用本地规则生成分析计划。你也可以在 API 设置中配置模型，获得更智能的分析计划。",
      );
    } catch {
      const message = "分析计划生成失败，请稍后重试或检查上传数据。";
      setAnalysisPlanError(message);
      failTaskFeedback("analysis_plan", message);
    } finally {
      setIsGeneratingAnalysisPlan(false);
    }
  }

  function clearGeneratedOutputsAfterNewPlan() {
    setMetricSpecExecutionResult(null);
    setAnalysisExecutionResult(null);
    setEvidenceResult(null);
    setReportDraft(null);
  }

  async function handleBuildMetricSpec(nextAnalysisPlan: AnalysisPlan) {
    if (!uploadResult) {
      return;
    }

    setMetricSpec(null);
    setMetricSpecError("");

    try {
      const response = await buildMetricSpec({
        businessProblem: clarificationState.businessProblem,
        metricDefinition: clarificationState.metricDefinition,
        semanticContext: uploadResult.semantic_context,
        analysisPlan: nextAnalysisPlan,
        uploadSchema: uploadResult,
      });
      setMetricSpec(response.metric_spec);
      setMetricSpecExecutionResult(null);
      setMetricSpecExecutionError("");
    } catch (error) {
      setMetricSpecError(
        error instanceof Error
          ? error.message
          : "指标计算规格生成失败，请稍后重试。",
      );
    }
  }

  async function handleExecuteMetricSpec() {
    if (isExecutingMetricSpec) {
      return;
    }

    if (!uploadResult || !metricSpec) {
      const message = "请先生成指标计算规格。";
      setMetricSpecExecutionError(message);
      failTaskFeedback("metric_calculation", message);
      return;
    }

    if (!isMetricSpecExecutable(metricSpec)) {
      const message =
        "指标计算规格缺少分子或分母字段，请检查字段语义识别。";
      setMetricSpecExecutionError(message);
      failTaskFeedback("metric_calculation", message);
      return;
    }

    beginTaskFeedback("metric_calculation");
    setIsExecutingMetricSpec(true);
    setMetricSpecExecutionError("");

    try {
      const result = await executeMetricSpec({
        uploadId: uploadResult.upload_id,
        metricSpec,
      });
      setMetricSpecExecutionResult(result);
      setEvidenceResult(null);
      setReportDraft(null);
      completeTaskFeedback("metric_calculation");
      setActiveStepId("metric_calculation");
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "指标计算执行失败，请稍后重试。";
      setMetricSpecExecutionError(message);
      failTaskFeedback("metric_calculation", message);
    } finally {
      setIsExecutingMetricSpec(false);
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
    setEvidenceNotice("");
    setReportDraft(null);
    setReportError("");
    setReportNotice("");

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
      setActiveStepId("metric_calculation");
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
    if (isGeneratingEvidence) {
      return;
    }

    if (metricSpec && !isMetricSpecExecutable(metricSpec) && !analysisExecutionResult) {
      const message =
        "指标计算规格缺少分子或分母字段，请检查字段语义识别。";
      setEvidenceNotice("");
      setEvidenceError(message);
      failTaskFeedback("evidence_chain", message);
      return;
    }

    if (!analysisPlan || (!analysisExecutionResult && !metricSpecExecutionResult)) {
      const message = "请先执行指标计算或基础分析，再生成证据链。";
      setEvidenceNotice("");
      setEvidenceError(message);
      failTaskFeedback("evidence_chain", message);
      return;
    }

    const evidenceInput: EvidenceInput = {
      businessProblem: clarificationState.businessProblem,
      metricDefinition: clarificationState.metricDefinition,
      comparisonPeriod: clarificationState.comparisonPeriod,
      dimensions: clarificationState.dimensions,
      changeFactors: clarificationState.changeFactors,
      analysisPlan,
      executionResult: analysisExecutionResult,
      metricExecutionResult: metricSpecExecutionResult,
    };
    const llmSettings = getInitialLlmSettings();

    beginTaskFeedback("evidence_chain");
    setIsGeneratingEvidence(true);
    setEvidenceError("");
    setEvidenceNotice("");
    setReportError("");
    setReportNotice("");

    try {
      if (
        isLlmConfigured(llmSettings) &&
        !hasAuxiliaryMetricComparisons(metricSpecExecutionResult)
      ) {
        try {
          const llmEvidenceResult = await generateEvidenceChainWithLlm(
            evidenceInput,
            llmSettings,
          );
          setEvidenceResult(llmEvidenceResult);
          setReportDraft(null);
          completeTaskFeedback("evidence_chain");
          setActiveStepId("evidence_chain");
          setEvidenceNotice(
            llmEvidenceResult.source === "llm"
              ? metricSpecExecutionResult
                ? "AI 已使用指标计算结果生成证据链。"
                : "AI 已根据分析结果生成证据链。"
              : `AI 证据链生成失败：${llmEvidenceResult.fallback_reason ?? "LLM 调用失败"}。已使用本地规则继续生成证据链。`,
          );
          return;
        } catch (error) {
          const localEvidenceResult = await generateEvidenceChain(evidenceInput);
          const reason =
            error instanceof Error ? error.message : "LLM 接口调用失败";
          setEvidenceResult(localEvidenceResult);
          setReportDraft(null);
          completeTaskFeedback("evidence_chain");
          setActiveStepId("evidence_chain");
          setEvidenceNotice(
            `AI 证据链生成失败：${reason}。已使用本地规则继续生成证据链。`,
          );
          return;
        }
      }

      const nextEvidenceResult = await generateEvidenceChain(evidenceInput);
      setEvidenceResult(nextEvidenceResult);
      setReportDraft(null);
      completeTaskFeedback("evidence_chain");
      setActiveStepId("evidence_chain");
      setEvidenceNotice(
        metricSpecExecutionResult
          ? "已使用指标计算结果生成证据链。"
          : "当前使用本地规则生成证据链。你也可以在 API 设置中配置模型，获得更自然的证据链表达。",
      );
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "证据链生成失败，请稍后重试或检查分析结果。";
      setEvidenceError(message);
      failTaskFeedback("evidence_chain", message);
    } finally {
      setIsGeneratingEvidence(false);
    }
  }

  async function handleGenerateReportDraft() {
    if (isGeneratingReport) {
      return;
    }

    if (!analysisPlan || (!analysisExecutionResult && !metricSpecExecutionResult) || !evidenceResult) {
      const message = "请先生成证据链，再生成报告草稿。";
      setReportNotice("");
      setReportError(message);
      failTaskFeedback("report_draft", message);
      return;
    }

    const reportInput: ReportDraftInput = {
      businessProblem: clarificationState.businessProblem,
      metricDefinition: clarificationState.metricDefinition,
      comparisonPeriod: clarificationState.comparisonPeriod,
      dimensions: clarificationState.dimensions,
      changeFactors: clarificationState.changeFactors,
      analysisPlan,
      executionResult: analysisExecutionResult,
      metricExecutionResult: metricSpecExecutionResult,
      evidenceResult,
    };
    const llmSettings = getInitialLlmSettings();

    beginTaskFeedback("report_draft");
    setIsGeneratingReport(true);
    setReportError("");
    setReportNotice("");

    try {
      if (isLlmConfigured(llmSettings)) {
        try {
          const llmReportDraft = await generateReportDraftWithLlm(
            reportInput,
            llmSettings,
          );
          setReportDraft(llmReportDraft);
          completeTaskFeedback("report_draft");
          setActiveStepId("report_draft");
          setReportNotice(
            llmReportDraft.source === "llm"
              ? metricSpecExecutionResult
                ? "AI 已使用指标计算结果生成报告草稿。"
                : "AI 已根据分析结果生成报告草稿。"
              : `AI 报告生成失败：${llmReportDraft.fallback_reason ?? "LLM 调用失败"}。已使用本地规则继续生成报告草稿。`,
          );
          return;
        } catch (error) {
          const localReportDraft = await generateReportDraft(reportInput);
          const reason =
            error instanceof Error ? error.message : "LLM 接口调用失败";
          setReportDraft(localReportDraft);
          completeTaskFeedback("report_draft");
          setActiveStepId("report_draft");
          setReportNotice(
            `AI 报告生成失败：${reason}。已使用本地规则继续生成报告草稿。`,
          );
          return;
        }
      }

      const nextReportDraft = await generateReportDraft(reportInput);
      setReportDraft(nextReportDraft);
      completeTaskFeedback("report_draft");
      setActiveStepId("report_draft");
      setReportNotice(
        metricSpecExecutionResult
          ? "已使用指标计算结果生成报告草稿。"
          : "当前使用本地规则生成报告草稿。你也可以在 API 设置中配置模型，获得更自然的报告表达。",
      );
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "报告草稿生成失败，请稍后重试或检查证据链。";
      setReportError(message);
      failTaskFeedback("report_draft", message);
    } finally {
      setIsGeneratingReport(false);
    }
  }

  function renderWorkflowStep() {
    switch (activeWorkflowStep.id) {
      case "business_problem":
        return (
          <section className={`${panelClassName} lg:min-h-[560px] lg:p-10`}>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <p className="text-sm font-medium text-accent">Step 1</p>
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
                className="min-h-64 w-full resize-none rounded-[22px] border border-white/10 bg-white/[0.045] p-5 text-base leading-7 text-ink outline-none transition focus:border-accent/60 focus:bg-white/[0.06] focus:ring-4 focus:ring-accent/12"
                id="business-problem"
                onChange={(event) => {
                  setClarificationState((current) => ({
                    ...current,
                    businessProblem: event.target.value,
                    analysisTarget: "",
                  }));
                  setBusinessClarificationResult(null);
                  setMetricDefinitionNotice("");
                }}
                placeholder="请用一句话描述你遇到的指标问题，例如：最近配送延迟率明显上升，但总运单量没有明显下降。"
                value={clarificationState.businessProblem}
              />
            </div>

            <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-sm leading-6 text-ink/58">
                系统会先识别业务目标，再生成候选指标口径和后续分析路径。
              </p>
              <button
                className={primaryButtonClassName}
                data-testid="start-clarification"
                disabled={
                  !clarificationState.businessProblem.trim() ||
                  isEvaluating ||
                  isGeneratingMetricDefinitions
                }
                onClick={handleStartClarification}
                type="button"
              >
                {isGeneratingMetricDefinitions ? "正在澄清…" : "开始澄清"}
              </button>
            </div>

          </section>
        );

      case "metric_definition":
        return (
          <ClarificationSection
            eyebrow="Step 2"
            title={getMetricQuestionTitle(metricDefinitionResult)}
          >
            {isGeneratingMetricDefinitions ? (
              <div className="mt-5 rounded-lg border border-accent/20 bg-accent/10 px-4 py-5 text-sm font-medium text-accent">
                正在识别指标并生成候选口径……
              </div>
            ) : (
              <>
                {metricDefinitionNotice ? (
                  <p className="mt-3 rounded-lg border border-ink/10 bg-white/72 px-4 py-3 text-sm leading-6 text-ink/62">
                    {metricDefinitionNotice}
                  </p>
                ) : null}
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
              </>
            )}

            {selectedMetricOption?.id === "custom" ? (
              <InlineInput
                id="custom-metric-definition"
                label="补充自定义指标口径"
                onChange={handleCustomMetricChange}
                placeholder={getCustomMetricPlaceholder(metricDefinitionResult)}
                value={clarificationState.customMetricDefinition ?? ""}
              />
            ) : null}
          </ClarificationSection>
        );

      case "comparison_period":
        return (
          <ClarificationSection
            eyebrow="Step 3"
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
        );

      case "dimensions":
        return (
          <ClarificationSection
            eyebrow="Step 4"
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
                placeholder="请补充当前场景下需要优先拆解的维度……"
                value={customDimension}
              />
            ) : null}

            <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-sm leading-6 text-ink/58">
                可以选择多个维度。上传数据后，系统会判断这些维度是否能被实际验证。
              </p>
              <button
                className={primaryButtonClassName}
                disabled={draftDimensions.length === 0 || isEvaluating}
                onClick={handleConfirmDimensions}
                type="button"
              >
                下一步
              </button>
            </div>
          </ClarificationSection>
        );

      case "change_factors":
        return (
          <ClarificationSection
            eyebrow="Step 5"
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
                className={primaryButtonClassName}
                disabled={draftChangeFactors.length === 0 || isEvaluating}
                onClick={handleConfirmChangeFactors}
                type="button"
              >
                下一步
              </button>
            </div>
          </ClarificationSection>
        );

      case "upload_data":
        return (
          <div className="space-y-5">
            <UnderstandingCard
              dataRequirements={dataRequirements}
              isReadyForData={isReadyForData}
              metricDefinitionResult={metricDefinitionResult}
              state={clarificationState}
            />
            <DataNeedsSection dataRequirements={dataRequirements} />
            <UploadOnlySection
              isUploading={isUploading}
              onUploadFiles={handleUploadFiles}
              taskFeedback={getVisibleTaskFeedback("upload_data")}
              taskStepIndex={taskStepIndex}
              uploadError={uploadError}
              uploadResult={uploadResult}
            />
            {uploadResult ? (
              <DataFieldUnderstandingCard uploadResult={uploadResult} />
            ) : null}
          </div>
        );

      case "analysis_plan":
        return (
          <div className="space-y-5">
            {uploadResult ? (
              <DataFieldUnderstandingCard uploadResult={uploadResult} />
            ) : null}
            <section className={panelClassName}>
              <div>
                <p className="text-sm font-medium text-accent">Step 7</p>
                <h2 className="mt-1 text-xl font-semibold text-ink">
                  生成分析计划
                </h2>
                <p className="mt-2 text-sm leading-6 text-ink/62">
                  基于业务问题、指标口径、字段语义和已选维度生成可执行分析路径。
                </p>
              </div>
              <AnalysisPlanAction
                analysisPlanError={analysisPlanError}
                analysisPlanNotice={analysisPlanNotice}
                isGeneratingAnalysisPlan={isGeneratingAnalysisPlan}
                onGeneratePlan={handleGenerateAnalysisPlan}
              />
              <TaskProgressCard
                feedback={getVisibleTaskFeedback("analysis_plan")}
                stepIndex={taskStepIndex}
              />
              {analysisPlan ? (
                <AnalysisPlanSection
                  analysisPlan={analysisPlan}
                  isExecutingMetricSpec={isExecutingMetricSpec}
                  metricSpec={metricSpec}
                  metricSpecError={metricSpecError}
                  metricSpecExecutionError={metricSpecExecutionError}
                  metricSpecExecutionResult={metricSpecExecutionResult}
                  onExecuteMetricSpec={handleExecuteMetricSpec}
                  showMetricSpec={false}
                  uploadResult={uploadResult}
                />
              ) : (
                <PanelPlaceholder text="生成分析计划后，将展示可执行的分析步骤。" />
              )}
            </section>
          </div>
        );

      case "metric_calculation":
        return (
          <div className="space-y-5">
            <section className={panelClassName}>
              <div>
                <p className="text-sm font-medium text-accent">Step 8</p>
                <h2 className="mt-1 text-xl font-semibold text-ink">
                  执行指标计算
                </h2>
                <p className="mt-2 text-sm leading-6 text-ink/62">
                  指标计算结果是当前页面的主结论；基础分析仅用于探索记录数和通用分布。
                </p>
              </div>
              <MetricSpecCard
                isExecutingMetricSpec={isExecutingMetricSpec}
                metricSpec={metricSpec}
                metricSpecError={metricSpecError}
                metricSpecExecutionError={metricSpecExecutionError}
                metricSpecExecutionResult={metricSpecExecutionResult}
                onExecuteMetricSpec={handleExecuteMetricSpec}
                taskFeedback={getVisibleTaskFeedback("metric_calculation")}
                taskStepIndex={taskStepIndex}
              />
            </section>
            <BasicAnalysisDisclosure
              analysisExecutionError={analysisExecutionError}
              analysisExecutionResult={analysisExecutionResult}
              evidenceError={evidenceError}
              evidenceNotice={evidenceNotice}
              evidenceResult={evidenceResult}
              isExecutingAnalysis={isExecutingAnalysis}
              isGeneratingEvidence={isGeneratingEvidence}
              isGeneratingReport={isGeneratingReport}
              onExecuteAnalysis={handleExecuteBasicAnalysis}
              onGenerateEvidence={handleGenerateEvidenceChain}
              onGenerateReport={handleGenerateReportDraft}
              reportDraft={reportDraft}
              reportError={reportError}
              reportNotice={reportNotice}
              uploadResult={uploadResult}
            />
          </div>
        );

      case "evidence_chain":
        return (
          <section className={panelClassName}>
            <div>
              <p className="text-sm font-medium text-accent">Step 9</p>
              <h2 className="mt-1 text-xl font-semibold text-ink">
                生成证据链
              </h2>
              <p className="mt-2 text-sm leading-6 text-ink/62">
                优先使用上一步的指标计算结果、Top movers 和辅助指标对比来组织证据。
              </p>
            </div>
            {metricSpecExecutionResult ? (
              <MetricResultSummary result={metricSpecExecutionResult} />
            ) : null}
            <EvidenceChainSection
              evidenceError={evidenceError}
              evidenceNotice={evidenceNotice}
              evidenceResult={evidenceResult}
              isGeneratingEvidence={isGeneratingEvidence}
              usesMetricExecutionResult={Boolean(metricSpecExecutionResult)}
              onGenerateEvidence={handleGenerateEvidenceChain}
            />
            {evidenceResult ? (
              <ReportDraftSection
                isGeneratingReport={isGeneratingReport}
                onGenerateReport={handleGenerateReportDraft}
                reportDraft={reportDraft}
                reportError={reportError}
                reportNotice={reportNotice}
              />
            ) : null}
            <TaskProgressCard
              feedback={getVisibleTaskFeedback("evidence_chain")}
              stepIndex={taskStepIndex}
            />
          </section>
        );

      case "report_draft":
        return (
          <section className={panelClassName}>
            <div>
              <p className="text-sm font-medium text-accent">Step 10</p>
              <h2 className="mt-1 text-xl font-semibold text-ink">
                生成报告草稿
              </h2>
              <p className="mt-2 text-sm leading-6 text-ink/62">
                将业务问题、指标计算结果、证据链和限制说明整理成可编辑报告。
              </p>
            </div>
            <ReportDraftSection
              isGeneratingReport={isGeneratingReport}
              onGenerateReport={handleGenerateReportDraft}
              reportDraft={reportDraft}
              reportError={reportError}
              reportNotice={reportNotice}
            />
            <TaskProgressCard
              feedback={getVisibleTaskFeedback("report_draft")}
              stepIndex={taskStepIndex}
            />
          </section>
        );

      default:
        return null;
    }
  }

  return (
    <main className="sova-dark-workspace min-h-screen overflow-x-hidden bg-[#07090d] p-2 text-ink sm:p-4 lg:h-screen lg:overflow-hidden lg:p-6">
      <style>{`
        @keyframes workflowStepIn {
          from { opacity: 0; transform: translateY(8px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}</style>
      <div className="mx-auto grid min-h-[calc(100vh-1rem)] w-full max-w-[1600px] grid-cols-1 overflow-hidden border-white/8 bg-[#080a0f] sm:min-h-[calc(100vh-2rem)] sm:rounded-[24px] sm:border lg:h-[calc(100vh-3rem)] lg:min-h-0 lg:grid-cols-[minmax(260px,24%)_minmax(0,1fr)]">
        <WorkflowSidePanel
          activeStep={activeWorkflowStep}
          activeStepIndex={activeStepIndex}
          clarificationState={clarificationState}
          completedStepIds={completedWorkflowStepIds}
          isGeneratingAnalysisPlan={isGeneratingAnalysisPlan}
          isGeneratingEvidence={isGeneratingEvidence}
          isGeneratingReport={isGeneratingReport}
          isExecutingMetricSpec={isExecutingMetricSpec}
          isUploading={isUploading}
          metricExecutionResult={metricSpecExecutionResult}
          panelReadiness={panelReadiness}
          progress={workflowProgress}
          steps={workflowSteps}
          taskFeedback={taskFeedback}
          taskStepIndex={taskStepIndex}
          uploadResult={uploadResult}
        />
        <section className="min-w-0 bg-[#07090d] px-4 py-5 sm:px-6 lg:flex lg:min-h-0 lg:flex-col lg:px-8 lg:py-7">
        <header className="shrink-0">
          <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
            <div className="min-w-0">
              <h1 className="text-3xl font-semibold tracking-normal text-ink sm:text-4xl">
                SOVA AI
              </h1>
              <p className="mt-3 text-lg font-medium text-ink/70 sm:text-xl">
                指标异动分析工作台
              </p>
              <p className="hidden">
                AI 指标异动分析工作台
              </p>
              <h1 className="hidden">
                SOVA AI｜指标异动分析工作台
              </h1>
              <p className="hidden">
                从模糊业务问题出发，自动澄清指标口径、执行指标计算，并生成证据链和报告草稿。
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <button
                className="inline-flex min-h-11 items-center rounded-full border border-white/[0.08] bg-white/[0.04] px-4 py-2.5 text-sm font-semibold text-ink/66 transition hover:border-accent/32 hover:bg-accent/8 hover:text-accent focus:outline-none focus:ring-4 focus:ring-accent/18"
                onClick={() => setIsGuideOpen(true)}
                type="button"
              >
                使用说明
              </button>
              <a
                className="inline-flex min-h-11 items-center rounded-full border border-white/[0.08] bg-white/[0.04] px-4 py-2.5 text-sm font-semibold text-ink/66 transition hover:border-accent/32 hover:bg-accent/8 hover:text-accent focus:outline-none focus:ring-4 focus:ring-accent/18"
                href="https://github.com/Zev55555/Sova-ai"
                rel="noreferrer"
                target="_blank"
              >
                GitHub
              </a>
              <div className="hidden">
                Search analysis, files, reports...
              </div>
              <span className="hidden">
                Step {activeStepIndex + 1} / {workflowSteps.length}
              </span>
              <ApiSettings />
            </div>
          </div>
        </header>

        <div className="mt-6 flex min-h-0 flex-1">
        <div className="flex min-h-0 w-full">
          <section className="min-w-0 lg:flex lg:min-h-0 lg:flex-1 lg:flex-col">
            <WorkflowStepper
              activeStepId={activeWorkflowStep.id}
              completedStepIds={completedWorkflowStepIds}
              onSelectStep={(stepId) => setActiveStepId(stepId)}
              steps={workflowSteps}
            />

            <div
              className="mt-6 w-full space-y-4 transition-all duration-200 ease-out lg:mt-auto lg:min-h-0 lg:max-h-[calc(100vh-260px)] lg:overflow-y-auto lg:pr-1"
              key={activeWorkflowStep.id}
              style={{ animation: "workflowStepIn 180ms ease-out" }}
            >
              {renderWorkflowStep()}
              <WorkflowProgressModule
                activeStep={activeWorkflowStep}
                activeStepIndex={activeStepIndex}
                completedStepIds={completedWorkflowStepIds}
                progress={workflowProgress}
                steps={workflowSteps}
              />
            </div>
          </section>

        </div>
        </div>
        </section>
      </div>
      {isGuideOpen ? (
        <UsageGuideDialog onClose={() => setIsGuideOpen(false)} />
      ) : null}
    </main>
  );
}

function WorkspaceSidebar() {
  const navigationItems = [
    { label: "当前分析", active: true, soon: false },
    { label: "历史分析", active: false, soon: true },
    { label: "数据文件", active: false, soon: true },
    { label: "报告草稿", active: false, soon: true },
    { label: "设置", active: false, soon: true },
  ];

  return (
    <aside className="border-b border-white/8 bg-[#0b0d12] px-4 py-4 lg:flex lg:h-full lg:w-[232px] lg:shrink-0 lg:flex-col lg:border-b-0 lg:border-r lg:px-4 lg:py-5">
      <div className="flex items-center justify-between gap-4 lg:block">
        <div>
          <div className="flex items-center gap-3">
            <span className="h-8 w-8 rounded-full border border-accent/30 bg-accent/15" />
            <div>
              <p className="text-sm font-semibold text-ink">SOVA AI</p>
              <p className="text-xs text-ink/42">Metric Intelligence</p>
            </div>
          </div>
        </div>
        <span className="rounded-full border border-accent/20 bg-accent/10 px-2.5 py-1 text-xs font-medium text-accent lg:hidden">
          AI Ready
        </span>
      </div>

      <nav className="mt-4 flex gap-2 overflow-x-auto pb-1 lg:mt-8 lg:block lg:space-y-1 lg:overflow-visible lg:pb-0">
        {navigationItems.map((item) => (
          <button
            aria-disabled={!item.active}
            className={
              item.active
                ? "flex whitespace-nowrap rounded-lg border border-accent/25 bg-accent/10 px-3 py-2 text-left text-sm font-semibold text-accent lg:w-full"
                : "flex cursor-not-allowed items-center justify-between gap-3 whitespace-nowrap rounded-lg border border-transparent px-3 py-2 text-left text-sm font-medium text-ink/42 transition hover:border-white/8 hover:bg-white/[0.03] lg:w-full"
            }
            key={item.label}
            title={item.active ? undefined : "后续版本开放"}
            type="button"
          >
            <span>{item.label}</span>
            {item.soon ? (
              <span className="rounded-full border border-white/8 bg-white/[0.04] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-ink/38">
                Soon
              </span>
            ) : null}
          </button>
        ))}
      </nav>

      <div className="mt-auto hidden rounded-xl border border-white/8 bg-white/[0.03] p-3 lg:block">
        <p className="text-xs font-semibold text-ink/46">工作台状态</p>
        <p className="mt-2 text-sm font-medium text-ink">本地分析工作台</p>
        <p className="mt-1 text-xs leading-5 text-ink/42">
          AI 配置和数据分析流程已保留在当前项目中。
        </p>
      </div>
    </aside>
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
    <section className={panelClassName}>
      <div className="flex flex-col gap-2">
        <p className="text-sm font-medium text-accent">{eyebrow}</p>
        <h2 className="text-xl font-semibold tracking-normal text-ink">{title}</h2>
      </div>
      {children}
    </section>
  );
}

function OptionGrid({ children }: { children: React.ReactNode }) {
  return <div className="mt-5 grid gap-4 md:grid-cols-2">{children}</div>;
}

function StarterExamples({
  examples,
  onSelectExample,
}: {
  examples: StarterExample[];
  onSelectExample: (example: StarterExample) => void;
}) {
  return (
    <details className="mt-4 rounded-lg border border-ink/10 bg-ink/[0.02] p-3">
      <summary className="cursor-pointer text-sm font-semibold text-ink/66">
        查看示例问题
      </summary>
      <p className="mt-3 text-sm leading-6 text-ink/58">
        示例只用于帮你理解如何描述问题；点击后只填入输入框，不会自动提交。
      </p>
      <div className="mt-3 grid gap-2 md:grid-cols-2">
        {examples.map((example) => (
          <button
            className="rounded-md border border-ink/10 bg-white px-3 py-3 text-left transition hover:border-accent/35 hover:bg-accent/5 focus:outline-none focus:ring-4 focus:ring-accent/12"
            key={example.title}
            onClick={() => onSelectExample(example)}
            type="button"
          >
            <span className="text-sm font-semibold text-ink">
              {example.title}
            </span>
            <span className="mt-1 block text-sm leading-6 text-ink/66">
              {example.problem}
            </span>
            <span className="mt-2 block text-xs leading-5 text-ink/50">
              推荐口径：{example.metricDefinition}
            </span>
          </button>
        ))}
      </div>
    </details>
  );
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
          ? "min-h-36 rounded-lg border border-accent bg-white p-5 text-left shadow-sm transition focus:outline-none focus:ring-4 focus:ring-accent/14"
          : "min-h-36 rounded-lg border border-ink/10 bg-white/76 p-5 text-left transition hover:border-accent/35 hover:bg-white focus:outline-none focus:ring-4 focus:ring-accent/14"
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

function WorkflowStepper({
  steps,
  activeStepId,
  completedStepIds,
  onSelectStep,
}: {
  steps: WorkflowStep[];
  activeStepId: WorkflowStepId;
  completedStepIds: WorkflowStepId[];
  onSelectStep: (stepId: WorkflowStepId) => void;
}) {
  const stepRows = [steps.slice(0, 5), steps.slice(5, 10)];

  return (
    <nav className="rounded-[24px] border border-white/10 bg-[radial-gradient(circle_at_18%_0%,rgba(34,211,238,0.08),transparent_38%),radial-gradient(circle_at_82%_10%,rgba(124,58,237,0.1),transparent_42%),linear-gradient(180deg,rgba(17,20,30,0.9),rgba(8,10,16,0.88))] p-2.5 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)] backdrop-blur-xl">
      <div className="space-y-2">
        {stepRows.map((row, rowIndex) => (
          <div
            className="flex gap-2 overflow-x-auto [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
            key={rowIndex}
          >
            {row.map((step) => {
              const isActive = step.id === activeStepId;
              const isCompleted = completedStepIds.includes(step.id);
              const isClickable = isActive || isCompleted;

              return (
                <button
                  className={
                    isActive
                      ? "flex min-w-[96px] items-center justify-center rounded-full border border-cyan-300/38 bg-[radial-gradient(circle_at_20%_0%,rgba(34,211,238,0.22),transparent_46%),linear-gradient(180deg,rgba(20,45,58,0.78),rgba(14,18,30,0.92))] px-5 py-2.5 text-sm font-semibold text-cyan-50 shadow-[0_0_18px_rgba(34,211,238,0.11),inset_0_1px_0_rgba(255,255,255,0.06)] transition hover:border-cyan-300/48 sm:min-w-[116px]"
                      : isCompleted
                        ? "flex min-w-[96px] items-center justify-center rounded-full border border-cyan-300/16 bg-[radial-gradient(circle_at_22%_0%,rgba(34,211,238,0.12),transparent_46%),linear-gradient(180deg,rgba(16,29,39,0.66),rgba(11,14,23,0.86))] px-5 py-2.5 text-sm font-semibold text-cyan-100/78 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)] transition hover:border-cyan-300/24 sm:min-w-[116px]"
                        : "flex min-w-[96px] items-center justify-center rounded-full border border-white/[0.08] bg-[radial-gradient(circle_at_20%_0%,rgba(71,85,105,0.16),transparent_42%),linear-gradient(180deg,rgba(20,23,34,0.72),rgba(10,12,19,0.88))] px-5 py-2.5 text-sm font-medium text-ink/54 shadow-[inset_0_1px_0_rgba(255,255,255,0.035)] transition hover:border-white/[0.12] hover:text-ink/66 sm:min-w-[116px]"
                  }
                  disabled={!isClickable}
                  key={step.id}
                  onClick={() => onSelectStep(step.id)}
                  type="button"
                >
                  <span className="whitespace-nowrap">{step.shortLabel}</span>
                </button>
              );
            })}
          </div>
        ))}
      </div>
    </nav>
  );
}

function WorkflowProgressModule({
  activeStep,
  activeStepIndex,
  completedStepIds,
  progress,
  steps,
}: {
  activeStep: WorkflowStep;
  activeStepIndex: number;
  completedStepIds: WorkflowStepId[];
  progress: number;
  steps: WorkflowStep[];
}) {
  return (
    <section className="rounded-[26px] border border-white/10 bg-[radial-gradient(circle_at_18%_0%,rgba(34,211,238,0.09),transparent_38%),linear-gradient(180deg,rgba(18,21,31,0.92),rgba(9,11,17,0.9))] p-5 shadow-[0_20px_70px_rgba(0,0,0,0.28),inset_0_1px_0_rgba(255,255,255,0.045)] backdrop-blur-xl">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-accent/80">
            当前进度
          </p>
          <h3 className="mt-1 text-base font-semibold text-ink">
            {activeStep.label}
          </h3>
        </div>
        <div className="text-left sm:text-right">
          <p className="text-sm font-semibold text-ink">
            Step {activeStepIndex + 1} / {steps.length}
          </p>
          <p className="mt-1 text-xs text-ink/46">
            已完成 {completedStepIds.length} / {steps.length} · {progress}%
          </p>
        </div>
      </div>
      <div className="mt-4 h-2.5 overflow-hidden rounded-full bg-white/[0.055]">
        <div
          className="h-full rounded-full bg-[linear-gradient(90deg,rgba(34,211,238,0.95),rgba(124,58,237,0.88))] shadow-[0_0_18px_rgba(34,211,238,0.16)] transition-all duration-300"
          style={{ width: `${progress}%` }}
        />
      </div>
    </section>
  );
}

function UsageGuideDialog({ onClose }: { onClose: () => void }) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4 py-6 backdrop-blur-sm"
      onMouseDown={onClose}
      role="presentation"
    >
      <section
        aria-modal="true"
        className="max-h-[86vh] w-full max-w-3xl overflow-y-auto rounded-[28px] border border-white/10 bg-[#0b0e15] p-6 text-ink shadow-[0_30px_120px_rgba(0,0,0,0.55)] sm:p-7"
        onMouseDown={(event) => event.stopPropagation()}
        role="dialog"
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-accent/78">
              SOVA AI
            </p>
            <h2 className="mt-2 text-2xl font-semibold text-ink">使用说明</h2>
            <p className="mt-2 text-sm leading-6 text-ink/58">
              快速了解如何用 SOVA AI 排查业务指标异动。
            </p>
          </div>
          <button
            className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1.5 text-sm font-semibold text-ink/60 transition hover:border-accent/32 hover:text-accent"
            onClick={onClose}
            type="button"
          >
            关闭
          </button>
        </div>

        <div className="mt-6 space-y-5 text-sm leading-7 text-ink/68">
          <GuideSection title="SOVA AI 是什么">
            SOVA AI 是一个指标异动分析工作台，适合用来排查“为什么某个业务指标最近变好或变差”。你只需要输入一句业务问题，系统会引导你确认指标口径、选择对比周期和分析维度，并基于上传的数据生成指标变化、Top movers、辅助指标对比、证据链和报告草稿。
          </GuideSection>
          <GuideSection title="如何使用">
            <ol className="list-decimal space-y-2 pl-5">
              <li>描述业务问题，例如最近新用户 7 日激活率下降了。</li>
              <li>确认指标口径，例如激活率 = 激活用户数 / 新注册用户数。</li>
              <li>选择对比周期和分析维度，例如本周 vs 上周，按渠道、地区、设备拆解。</li>
              <li>上传 CSV 或 Excel 数据，系统会识别时间、分子、分母、维度和辅助指标字段。</li>
              <li>执行指标计算与可视化分析，查看整体变化、Top movers 和辅助指标。</li>
              <li>生成证据链和报告草稿，用于复盘、汇报或继续人工分析。</li>
            </ol>
          </GuideSection>
          <GuideSection title="适用场景">
            <p>
              SOVA AI 适合分析结构化表格数据中的本期 vs 上期指标对比问题，例如营销转化率下降、SaaS 新用户激活率下降、客服 SLA 超时率上升、物流配送延迟率上升、游戏排位胜率下降等。
            </p>
          </GuideSection>
          <GuideSection title="分析流程">
            <p>
              业务问题 → 指标口径 → 数据上传 → 字段识别 → 指标计算规格 → DuckDB 安全计算 → Top movers → 可视化分析 → 证据链 → 报告草稿。
            </p>
            <p className="mt-2">
              它不是让 AI 随便写 SQL，而是先生成结构化 Metric Spec，再用 DuckDB 执行可控的聚合分析。
            </p>
          </GuideSection>
          <GuideSection title="当前实验效果">
            在已测试的示例场景中，SOVA AI 可以跑通从业务问题到报告草稿的完整流程，并生成指标变化、Top movers、辅助指标对比、可视化拆解、证据链和报告草稿。它更适合作为第一轮数据排查工具，帮助用户形成分析思路和可验证线索，而不是直接替代人工判断。
          </GuideSection>
        </div>
      </section>
    </div>
  );
}

function GuideSection({
  children,
  title,
}: {
  children: ReactNode;
  title: string;
}) {
  return (
    <section className="rounded-[20px] border border-white/[0.075] bg-white/[0.035] p-4">
      <h3 className="text-sm font-semibold text-ink">{title}</h3>
      <div className="mt-2">{children}</div>
    </section>
  );
}

function UploadOnlySection({
  isUploading,
  onUploadFiles,
  taskFeedback,
  taskStepIndex,
  uploadError,
  uploadResult,
}: {
  isUploading: boolean;
  onUploadFiles: (files: File[]) => void;
  taskFeedback: AsyncTaskFeedback | null;
  taskStepIndex: number;
  uploadError: string;
  uploadResult: UploadResponse | null;
}) {
  function handleFileInputChange(event: React.ChangeEvent<HTMLInputElement>) {
    onUploadFiles(Array.from(event.target.files ?? []));
    event.target.value = "";
  }

  function handleDrop(event: React.DragEvent<HTMLLabelElement>) {
    event.preventDefault();
    event.stopPropagation();
    onUploadFiles(Array.from(event.dataTransfer.files));
  }

  return (
          <section className={panelClassName}>
      <div>
        <p className="text-sm font-medium text-accent">Step 6</p>
        <h2 className="mt-1 text-xl font-semibold text-ink">
          上传与本次指标异动相关的数据
        </h2>
        <p className="mt-2 text-sm leading-6 text-ink/62">
          系统会先识别字段结构和业务语义，再进入分析计划生成。
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
        htmlFor="workflow-data-files"
        onDragOver={(event) => {
          event.preventDefault();
          event.stopPropagation();
        }}
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
          id="workflow-data-files"
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

      <TaskProgressCard feedback={taskFeedback} stepIndex={taskStepIndex} />

      {uploadError ? (
        <p className="mt-4 whitespace-pre-line rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-700">
          {uploadError}
        </p>
      ) : null}

      {uploadResult ? (
        <div className="mt-5 rounded-lg border border-white/8 bg-white/[0.04] p-4">
          <DataUploadSummary uploadResult={uploadResult} />
          <details className="mt-4 rounded-lg border border-white/8 bg-white/[0.03] p-4">
            <summary className="cursor-pointer text-sm font-semibold text-ink">
              查看字段识别详情
            </summary>
            <DataSchemaResults uploadResult={uploadResult} />
          </details>
        </div>
      ) : null}
    </section>
  );
}

function BasicAnalysisDisclosure({
  analysisExecutionError,
  analysisExecutionResult,
  evidenceError,
  evidenceNotice,
  evidenceResult,
  isExecutingAnalysis,
  isGeneratingEvidence,
  isGeneratingReport,
  onExecuteAnalysis,
  onGenerateEvidence,
  onGenerateReport,
  reportDraft,
  reportError,
  reportNotice,
  uploadResult,
}: {
  analysisExecutionError: string;
  analysisExecutionResult: AnalysisExecutionResult | null;
  evidenceError: string;
  evidenceNotice: string;
  evidenceResult: EvidenceResult | null;
  isExecutingAnalysis: boolean;
  isGeneratingEvidence: boolean;
  isGeneratingReport: boolean;
  onExecuteAnalysis: () => void;
  onGenerateEvidence: () => void;
  onGenerateReport: () => void;
  reportDraft: ReportDraft | null;
  reportError: string;
  reportNotice: string;
  uploadResult: UploadResponse | null;
}) {
  return (
    <details className="rounded-[24px] border border-white/10 bg-white/[0.04] p-5 shadow-sm backdrop-blur">
      <summary className="cursor-pointer text-base font-semibold text-transparent">
        <span className="text-ink">可视化分析</span>
        辅助探索区：基础分析
      </summary>
      <p className="mt-3 rounded-[18px] border border-white/8 bg-white/[0.035] px-3 py-2 text-sm leading-6 text-transparent">
        <span className="text-ink/62">
          生成可视化分析后，再基于指标计算结果、Top movers 和辅助指标生成证据链。
        </span>
        基础分析用于探索记录数和通用分布；指标结论请优先参考上方“指标计算结果”。
      </p>
      <ExecuteAnalysisAction
        analysisExecutionError={analysisExecutionError}
        isExecutingAnalysis={isExecutingAnalysis}
        onExecuteAnalysis={onExecuteAnalysis}
      />
      {analysisExecutionResult ? (
        <AnalysisExecutionResultSection
          evidenceError={evidenceError}
          evidenceNotice={evidenceNotice}
          evidenceResult={evidenceResult}
          executionResult={analysisExecutionResult}
          isGeneratingEvidence={isGeneratingEvidence}
          isGeneratingReport={isGeneratingReport}
          onGenerateEvidence={onGenerateEvidence}
          onGenerateReport={onGenerateReport}
          reportDraft={reportDraft}
          reportError={reportError}
          reportNotice={reportNotice}
          uploadResult={uploadResult}
        />
      ) : null}
    </details>
  );
}

function MetricResultSummary({
  result,
}: {
  result: MetricSpecExecutionResult;
}) {
  const overall = result.overall_metric_comparison;

  return (
    <div className="mt-5 rounded-lg border border-accent/18 bg-accent/8 p-4 text-sm">
      <p className="font-semibold text-accent">已生成指标计算结果</p>
      <p className="mt-2 leading-6 text-ink/70">
        {overall.metric_name}：{formatMetricRate(overall.baseline.rate)} →{" "}
        {formatMetricRate(overall.current.rate)}，变化{" "}
        {formatDeltaRate(overall.delta_rate)}。
      </p>
      {result.top_movers.length ? (
        <p className="mt-1 leading-6 text-ink/62">
          Top movers：{result.top_movers.slice(0, 3).map((item) => `${item.dimension_label} ${item.value}`).join("、")}
        </p>
      ) : null}
    </div>
  );
}

function WorkflowSidePanel({
  activeStep,
  activeStepIndex,
  clarificationState,
  completedStepIds,
  isGeneratingAnalysisPlan,
  isGeneratingEvidence,
  isGeneratingReport,
  isExecutingMetricSpec,
  isUploading,
  metricExecutionResult,
  panelReadiness: _panelReadiness,
  progress,
  steps,
  taskFeedback,
  taskStepIndex,
  uploadResult,
}: {
  activeStep: WorkflowStep;
  activeStepIndex: number;
  clarificationState: ClarificationState;
  completedStepIds: WorkflowStepId[];
  isGeneratingAnalysisPlan: boolean;
  isGeneratingEvidence: boolean;
  isGeneratingReport: boolean;
  isExecutingMetricSpec: boolean;
  isUploading: boolean;
  metricExecutionResult: MetricSpecExecutionResult | null;
  panelReadiness: ReadinessState;
  progress: number;
  steps: WorkflowStep[];
  taskFeedback: AsyncTaskFeedback | null;
  taskStepIndex: number;
  uploadResult: UploadResponse | null;
}) {
  const overall = metricExecutionResult?.overall_metric_comparison;
  const topMovers = metricExecutionResult?.top_movers.slice(0, 3) ?? [];
  const auxiliaryMetrics =
    metricExecutionResult?.auxiliary_metric_comparisons?.slice(0, 2) ?? [];
  const primaryFile = uploadResult?.files[0] ?? null;
  const semanticContext = uploadResult?.semantic_context;
  const isProcessing =
    isUploading ||
    isGeneratingAnalysisPlan ||
    isExecutingMetricSpec ||
    isGeneratingEvidence ||
    isGeneratingReport;
  const stepStatus = getWorkflowStepStatus({
    activeStepId: activeStep.id,
    completedStepIds,
    isProcessing,
  });

  return (
    <aside className="border-b border-white/[0.045] bg-[#090b10] px-4 py-5 sm:px-5 lg:flex lg:h-full lg:min-h-0 lg:flex-col lg:overflow-y-auto lg:border-b-0 lg:border-r lg:border-white/[0.045]">
      <div className="mb-6 flex items-center gap-3">
        <span className="relative h-10 w-10 rounded-full bg-[conic-gradient(from_120deg,rgba(34,211,238,0.95),rgba(168,85,247,0.9),rgba(217,70,239,0.72),rgba(251,146,60,0.78),rgba(34,211,238,0.95))] p-[3px]">
          <span className="block h-full w-full rounded-full bg-[#090b10]" />
        </span>
        <div>
          <p className="text-sm font-semibold text-ink">SOVA AI</p>
          <p className="text-xs text-ink/42">Metric Intelligence</p>
        </div>
      </div>
      <section>
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-accent">
              当前进度
            </p>
            <h2 className="mt-1 text-lg font-semibold text-ink">
              {activeStep.label}
            </h2>
            <p className="mt-1 text-xs text-ink/46">
              Step {activeStepIndex + 1} / {steps.length}
            </p>
          </div>
          <WorkflowStatusBadge label={stepStatus} processing={isProcessing} />
        </div>

        <div className="hidden">
          <div className="h-2 overflow-hidden rounded-full bg-ink/[0.06]">
            <div
              className="h-full rounded-full bg-accent transition-all duration-300"
              style={{ width: `${progress}%` }}
            />
          </div>
          <p className="mt-2 text-xs text-ink/48">
            总体进度 {progress}% · 已完成 {completedStepIds.length} / {steps.length}
          </p>
        </div>
      </section>

      <SideTaskStatus feedback={taskFeedback} stepIndex={taskStepIndex} />

      <section className="mt-5">
        <PanelSectionTitle title="已确认信息" />
        <div className="mt-3 grid gap-2">
          <ConfirmedInfoItem
            label="业务问题"
            value={clarificationState.businessProblem}
          />
          <ConfirmedInfoItem
            label="指标口径"
            value={clarificationState.metricDefinition}
          />
          <ConfirmedInfoItem
            label="对比周期"
            value={clarificationState.comparisonPeriod}
          />
          <ConfirmedInfoItem
            label="分析维度"
            value={formatCompactList(clarificationState.dimensions, 3)}
          />
          <ConfirmedInfoItem
            label="变化因素"
            value={formatCompactList(clarificationState.changeFactors, 3)}
          />
          <ConfirmedInfoItem
            label="上传数据"
            value={uploadResult ? `${uploadResult.files.length} 个文件` : ""}
          />
        </div>
      </section>

      <section className="mt-5">
        <PanelSectionTitle title="数据状态" />
        {primaryFile ? (
          <div className="mt-3 rounded-[20px] border border-white/[0.075] bg-white/[0.03] p-3.5">
            <p className="truncate text-sm font-semibold text-ink">
              {primaryFile.filename}
            </p>
            <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
              <MiniStat label="行数" value={formatMetricNumber(primaryFile.row_count)} />
              <MiniStat label="字段数" value={formatMetricNumber(primaryFile.column_count)} />
            </div>
            <div className="mt-3 space-y-2 text-xs leading-5 text-ink/62">
              <p>
                <span className="text-ink/42">业务场景：</span>
                {semanticContext?.business_domain ?? "待识别"}
              </p>
              <p>
                <span className="text-ink/42">候选分子：</span>
                {formatFieldList(
                  semanticContext?.primary_metric.candidate_numerator_fields,
                )}
              </p>
              <p>
                <span className="text-ink/42">候选分母：</span>
                {formatFieldList(
                  semanticContext?.primary_metric.candidate_denominator_fields,
                )}
              </p>
            </div>
          </div>
        ) : (
          <PanelPlaceholder text="等待上传数据。" />
        )}
      </section>

      <section className="mt-5">
        <PanelSectionTitle title="核心指标摘要" />
        {overall ? (
          <div className="mt-3 rounded-[20px] border border-white/[0.075] bg-white/[0.03] p-4">
            <p className="text-sm font-semibold text-accent">
              {overall.metric_name}
            </p>
            <p className="mt-2 text-xl font-semibold text-ink">
              {formatMetricRate(overall.baseline.rate)} →{" "}
              {formatMetricRate(overall.current.rate)}
            </p>
            <p className="mt-1 text-sm font-semibold text-accent">
              {formatDeltaRate(overall.delta_rate)}
            </p>
            <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
              <MiniStat
                label={`${overall.baseline_label || "上周"}分母`}
                value={formatMetricNumber(overall.baseline.denominator)}
              />
              <MiniStat
                label={`${overall.current_label || "本周"}分母`}
                value={formatMetricNumber(overall.current.denominator)}
              />
              <MiniStat
                label={`${overall.baseline_label || "上周"}分子`}
                value={formatMetricNumber(overall.baseline.numerator)}
              />
              <MiniStat
                label={`${overall.current_label || "本周"}分子`}
                value={formatMetricNumber(overall.current.numerator)}
              />
            </div>
          </div>
        ) : (
          <PanelPlaceholder text="完成指标计算后将在这里显示核心结论。" />
        )}
      </section>

      <section className="mt-5">
        <PanelSectionTitle title="Top movers" />
        {topMovers.length ? (
          <ul className="mt-3 space-y-2">
            {topMovers.map((item) => (
              <li
                className="rounded-[18px] border border-white/[0.065] bg-white/[0.028] px-3 py-2.5 text-sm"
                key={`${item.dimension_field}-${item.value}`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate font-semibold text-ink">
                      {item.value}
                    </p>
                    <p className="mt-0.5 text-xs text-ink/46">
                      {item.dimension_label}
                    </p>
                  </div>
                  <span className="shrink-0 text-sm font-semibold text-accent">
                    {formatDeltaRate(item.delta_rate)}
                  </span>
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <PanelPlaceholder text="执行指标计算后显示变化最大的分组。" />
        )}
      </section>

      {auxiliaryMetrics.length ? (
        <section className="mt-5">
          <PanelSectionTitle title="辅助指标" />
          <ul className="mt-3 space-y-2">
            {auxiliaryMetrics.map((item) => (
              <li
                className="rounded-lg bg-white/[0.03] px-3 py-2 text-sm"
                key={item.field}
              >
                <p className="font-semibold text-ink">{item.label}</p>
                <p className="mt-1 text-xs text-ink/62">
                  {formatMetricAverage(item.baseline_avg)} →{" "}
                  {formatMetricAverage(item.current_avg)}
                </p>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <section className="mt-5 rounded-[20px] border border-white/[0.075] bg-white/[0.035] p-4">
        <h3 className="text-sm font-semibold text-ink">下一步建议</h3>
        <p className="mt-2 line-clamp-2 text-sm leading-6 text-ink/62">
          {isProcessing ? "系统正在处理，请稍等…" : getNextStepHint(activeStep.id)}
        </p>
      </section>
    </aside>
  );
}

function PanelSectionTitle({ title }: { title: string }) {
  return (
    <h3 className="text-xs font-semibold uppercase tracking-wide text-ink/46">
      {title}
    </h3>
  );
}

function TaskProgressCard({
  feedback,
  stepIndex,
}: {
  feedback: AsyncTaskFeedback | null;
  stepIndex: number;
}) {
  if (!feedback) {
    return null;
  }

  const definition = asyncTaskDefinitions[feedback.taskId];
  const isRunning = feedback.status === "running";
  const isSuccess = feedback.status === "success";
  const isError = feedback.status === "error";
  const title = isRunning
    ? definition.runningTitle
    : isSuccess
      ? definition.successTitle
      : `${definition.title}失败`;

  return (
    <div
      className={
        isError
          ? "mt-4 rounded-lg border border-red-200 bg-red-50 p-4"
          : isSuccess
            ? "mt-4 rounded-lg border border-accent/25 bg-accent/8 p-4"
            : "mt-4 rounded-lg border border-ink/10 bg-white p-4"
      }
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <p
            className={
              isError
                ? "text-sm font-semibold text-red-700"
                : "text-sm font-semibold text-ink"
            }
          >
            {title}
          </p>
          <p className="mt-1 text-xs leading-5 text-ink/50">
            {isRunning
              ? "SOVA AI 正在按步骤处理，请稍等。"
              : isSuccess
                ? "任务已完成，结果已更新到当前工作流。"
                : feedback.errorMessage}
          </p>
        </div>
        <TaskStatusIcon status={feedback.status} />
      </div>

      <ol className="mt-4 grid gap-2">
        {definition.steps.map((step, index) => {
          const isCurrent = isRunning && index === stepIndex;
          const isDone = isSuccess || (isRunning && index < stepIndex);

          return (
            <li
              className={
                isCurrent
                  ? "flex items-center gap-3 rounded-md bg-accent/8 px-3 py-2 text-sm text-ink transition-opacity duration-200"
                  : "flex items-center gap-3 rounded-md px-3 py-2 text-sm text-ink/58"
              }
              key={step}
            >
              <span
                className={
                  isDone
                    ? "flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-accent text-[10px] font-bold text-white"
                    : isCurrent
                      ? "flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-accent text-accent"
                      : isError
                        ? "h-5 w-5 shrink-0 rounded-full border border-red-200 bg-white"
                        : "h-5 w-5 shrink-0 rounded-full border border-ink/14 bg-white"
                }
              >
                {isDone ? "✓" : isCurrent ? <SmallSpinner /> : ""}
              </span>
              <span className={isCurrent ? "font-medium text-ink" : ""}>
                {step}
              </span>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

function SideTaskStatus({
  feedback,
  stepIndex,
}: {
  feedback: AsyncTaskFeedback | null;
  stepIndex: number;
}) {
  if (!feedback) {
    return null;
  }

  const definition = asyncTaskDefinitions[feedback.taskId];
  const currentStep = definition.steps[stepIndex] ?? definition.steps[0];
  const isRunning = feedback.status === "running";
  const isError = feedback.status === "error";

  return (
    <section
      className={
        isError
          ? "mt-5 rounded-lg border border-red-200 bg-red-50 p-4"
          : "mt-5 rounded-lg border border-accent/20 bg-accent/8 p-4"
      }
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <PanelSectionTitle title="当前任务" />
          <p className="mt-2 text-sm font-semibold text-ink">
            系统正在执行：{definition.title}
          </p>
          <p className="mt-1 text-xs leading-5 text-ink/58">
            当前步骤：{isRunning ? currentStep : feedback.status === "success" ? definition.successTitle : feedback.errorMessage}
          </p>
        </div>
        <TaskStatusIcon status={feedback.status} />
      </div>
    </section>
  );
}

function TaskStatusIcon({ status }: { status: AsyncTaskFeedback["status"] }) {
  if (status === "running") {
    return (
      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-accent/30 bg-white text-accent">
        <SmallSpinner />
      </span>
    );
  }

  if (status === "success") {
    return (
      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-accent text-sm font-bold text-white transition-transform duration-200">
        ✓
      </span>
    );
  }

  return (
    <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-red-100 text-sm font-bold text-red-700">
      !
    </span>
  );
}

function SmallSpinner() {
  return (
    <span className="h-3 w-3 animate-spin rounded-full border-2 border-current border-t-transparent" />
  );
}

function ConfirmedInfoItem({
  label,
  value,
}: {
  label: string;
  value?: string | null;
}) {
  const confirmed = Boolean(value?.trim());

  return (
    <div className="flex items-start gap-2 rounded-lg bg-white/[0.03] px-3 py-2">
      <span
        className={
          confirmed
            ? "mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-accent text-[10px] font-bold text-white"
            : "mt-0.5 h-4 w-4 shrink-0 rounded-full border border-ink/16 bg-ink/[0.03]"
        }
      >
        {confirmed ? "✓" : ""}
      </span>
      <div className="min-w-0">
        <p className="text-xs font-medium text-ink/42">{label}</p>
        <p
          className={
            confirmed
              ? "mt-0.5 line-clamp-2 text-sm leading-5 text-ink/72"
              : "mt-0.5 text-sm leading-5 text-ink/34"
          }
        >
          {confirmed ? value : "待确认"}
        </p>
      </div>
    </div>
  );
}

function WorkflowStatusBadge({
  label,
  processing,
}: {
  label: string;
  processing: boolean;
}) {
  return (
    <span
      className={
        processing
          ? "rounded-full border border-accent/30 bg-accent/10 px-3 py-1 text-xs font-semibold text-accent"
          : "rounded-full border border-ink/10 bg-ink/[0.03] px-3 py-1 text-xs font-semibold text-ink/58"
      }
    >
      {label}
    </span>
  );
}

function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md bg-white/[0.04] px-2.5 py-2">
      <p className="text-[11px] text-ink/42">{label}</p>
      <p className="mt-0.5 font-semibold text-ink">{value}</p>
    </div>
  );
}

function PanelPlaceholder({ text }: { text: string }) {
  return (
    <div className="mt-3 rounded-[20px] border border-white/[0.065] bg-white/[0.028] px-4 py-4 text-sm leading-6 text-ink/48">
      <p>{text}</p>
    </div>
  );
}

function UnderstandingCard({
  dataRequirements,
  state,
  isReadyForData,
  metricDefinitionResult,
}: {
  dataRequirements: string[];
  state: ClarificationState;
  isReadyForData: boolean;
  metricDefinitionResult: MetricDefinitionResult;
}) {
  if (isReadyForData) {
    return (
      <section className="rounded-lg border border-ink/10 bg-white/86 p-5 shadow-sm backdrop-blur sm:p-6">
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
            value={getDataNeedSummary(dataRequirements)}
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
      "当前已确认指标口径、对比周期和优先拆解维度。下一步将确认近期是否存在与当前场景相关的变化因素，用于辅助判断指标异动可能原因。";
  } else if (state.metricDefinition && state.comparisonPeriod) {
    summary =
      "当前已确认指标口径和对比周期。下一步将继续确认适合当前业务场景的优先拆解维度。";
  } else if (state.metricDefinition) {
    summary =
      "当前已确认指标口径，后续将继续确认对比周期、分析维度、近期变化因素和数据需求。";
  } else if (state.businessProblem.trim()) {
    summary = metricDefinitionResult.summaryText;
  }

  return (
    <section className="rounded-lg border border-ink/10 bg-white/86 p-5 shadow-sm backdrop-blur sm:p-6">
      <p className="text-sm font-medium text-accent">当前理解</p>
      <p className="mt-3 text-base leading-7 text-ink/76">{summary}</p>
    </section>
  );
}

function DataFieldUnderstandingCard({ uploadResult }: { uploadResult: UploadResponse }) {
  const semanticContext = uploadResult.semantic_context;
  const primaryMetric = semanticContext?.primary_metric;
  const keyFieldRoles =
    semanticContext?.field_roles
      ?.filter((role) => role.role !== "unknown")
      .slice(0, 12) ?? [];

  return (
    <section className="rounded-lg border border-ink/10 bg-white/86 p-5 shadow-sm backdrop-blur sm:p-6">
      <p className="text-sm font-medium text-accent">数据字段理解</p>
      <p className="mt-3 text-base leading-7 text-ink/76">
        以下理解基于当前业务问题、已选择口径和上传字段结构生成，后续分析会尽量基于这些语义进行。
      </p>
      {semanticContext ? (
        <div className="mt-5 space-y-4">
          <div className="grid gap-3 text-sm sm:grid-cols-2">
            <SummaryItem
              label="识别到的业务场景"
              value={semanticContext.business_domain}
            />
            {semanticContext.scenario_match ? (
              <>
                <SummaryItem
                  label="匹配场景"
                  value={
                    semanticContext.scenario_match.domain_label ??
                    semanticContext.business_domain
                  }
                />
                <SummaryItem
                  label="匹配置信度"
                  value={formatScenarioConfidence(semanticContext.scenario_match.score)}
                />
                <SummaryItem
                  label="匹配依据"
                  value={
                    semanticContext.scenario_match.matched_reasons?.length
                      ? semanticContext.scenario_match.matched_reasons
                          .slice(0, 3)
                          .join("；")
                      : "暂无明确依据"
                  }
                />
              </>
            ) : null}
            <SummaryItem
              label="核心指标"
              value={primaryMetric?.name ?? "待确认"}
            />
            <SummaryItem
              label="分子含义"
              value={primaryMetric?.numerator_meaning ?? "待确认"}
            />
            <SummaryItem
              label="分母含义"
              value={primaryMetric?.denominator_meaning ?? "待确认"}
            />
          </div>

          <div className="grid gap-3 text-sm sm:grid-cols-2">
            <SummaryItem
              label="候选分子字段"
              value={
                primaryMetric?.candidate_numerator_fields?.length
                  ? primaryMetric.candidate_numerator_fields.join("、")
                  : "暂未明确匹配"
              }
            />
            <SummaryItem
              label="候选分母字段"
              value={
                primaryMetric?.candidate_denominator_fields?.length
                  ? primaryMetric.candidate_denominator_fields.join("、")
                  : "暂未明确匹配"
              }
            />
          </div>

          {keyFieldRoles.length ? (
            <div>
              <h3 className="text-sm font-semibold text-ink">关键字段映射</h3>
              <div className="mt-3 grid gap-2 sm:grid-cols-2">
                {keyFieldRoles.map((role) => (
                  <div
                    className="rounded-md border border-ink/8 bg-white px-3 py-3"
                    key={`${role.field}-${role.role}-${role.matched_user_need}`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <p className="font-semibold text-ink">{role.field}</p>
                      <span className="rounded-full bg-accent/10 px-2 py-0.5 text-xs font-medium text-accent">
                        {formatSemanticRole(role.role)}
                      </span>
                    </div>
                    <p className="mt-1 text-ink/68">{role.semantic_label}</p>
                    <p className="mt-2 text-xs leading-5 text-ink/52">
                      {role.reason}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}

function DataNeedsSection({
  dataRequirements,
}: {
  dataRequirements: string[];
}) {
  const visibleRequirements = dataRequirements.length
    ? dataRequirements
    : ["指标发生时间字段", "指标分子和分母或目标结果字段", "核心业务对象 ID 字段", "可用于拆解的分层、场景或环境字段"];

  return (
    <section className="rounded-lg border border-ink/10 bg-white/86 p-5 shadow-sm backdrop-blur sm:p-6">
      <p className="text-sm font-medium text-accent">下一步需要的数据</p>
      <h2 className="mt-2 text-xl font-semibold text-ink">
        为了继续分析，建议准备以下数据
      </h2>
      <ul className="mt-4 grid gap-3 text-sm leading-6 text-ink/72 sm:grid-cols-2">
        {visibleRequirements.map((item) => (
          <li
            className="rounded-md border border-ink/8 bg-white px-4 py-3"
            key={item}
          >
            {item}
          </li>
        ))}
      </ul>
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
  analysisPlanNotice,
  analysisExecutionError,
  analysisExecutionResult,
  evidenceError,
  evidenceNotice,
  evidenceResult,
  isExecutingAnalysis,
  isGeneratingAnalysisPlan,
  isGeneratingEvidence,
  isGeneratingReport,
  isExecutingMetricSpec,
  metricSpec,
  metricSpecError,
  metricSpecExecutionError,
  metricSpecExecutionResult,
  onExecuteAnalysis,
  onExecuteMetricSpec,
  onGenerateEvidence,
  onUploadFiles,
  onGeneratePlan,
  onGenerateReport,
  reportDraft,
  reportError,
  reportNotice,
}: {
  isUploading: boolean;
  uploadError: string;
  uploadResult: UploadResponse | null;
  analysisPlan: AnalysisPlan | null;
  analysisPlanError: string;
  analysisPlanNotice: string;
  analysisExecutionError: string;
  analysisExecutionResult: AnalysisExecutionResult | null;
  evidenceError: string;
  evidenceNotice: string;
  evidenceResult: EvidenceResult | null;
  isExecutingAnalysis: boolean;
  isGeneratingAnalysisPlan: boolean;
  isGeneratingEvidence: boolean;
  isGeneratingReport: boolean;
  isExecutingMetricSpec: boolean;
  metricSpec: MetricSpec | null;
  metricSpecError: string;
  metricSpecExecutionError: string;
  metricSpecExecutionResult: MetricSpecExecutionResult | null;
  onExecuteAnalysis: () => void;
  onExecuteMetricSpec: () => void;
  onGenerateEvidence: () => void;
  onUploadFiles: (files: File[]) => void;
  onGeneratePlan: () => void;
  onGenerateReport: () => void;
  reportDraft: ReportDraft | null;
  reportError: string;
  reportNotice: string;
}) {
  function handleFileInputChange(event: React.ChangeEvent<HTMLInputElement>) {
    onUploadFiles(Array.from(event.target.files ?? []));
    event.target.value = "";
  }

  function handleDrop(event: React.DragEvent<HTMLLabelElement>) {
    event.preventDefault();
    event.stopPropagation();
    onUploadFiles(Array.from(event.dataTransfer.files));
  }

  return (
          <section className={panelClassName}>
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
        onDragOver={(event) => {
          event.preventDefault();
          event.stopPropagation();
        }}
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
        <p className="mt-4 whitespace-pre-line rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-700">
          {uploadError}
        </p>
      ) : null}

      {uploadResult ? (
        <>
          <DataSchemaResults uploadResult={uploadResult} />
          <AnalysisPlanAction
            analysisPlanError={analysisPlanError}
            analysisPlanNotice={analysisPlanNotice}
            isGeneratingAnalysisPlan={isGeneratingAnalysisPlan}
            onGeneratePlan={onGeneratePlan}
          />
          {analysisPlan ? (
            <>
              <AnalysisPlanSection
                analysisPlan={analysisPlan}
                isExecutingMetricSpec={isExecutingMetricSpec}
                metricSpec={metricSpec}
                metricSpecError={metricSpecError}
                metricSpecExecutionError={metricSpecExecutionError}
                metricSpecExecutionResult={metricSpecExecutionResult}
                onExecuteMetricSpec={onExecuteMetricSpec}
                uploadResult={uploadResult}
              />
              <ExecuteAnalysisAction
                analysisExecutionError={analysisExecutionError}
                isExecutingAnalysis={isExecutingAnalysis}
                onExecuteAnalysis={onExecuteAnalysis}
              />
              {!analysisExecutionResult ? (
                <>
                  <EvidenceChainSection
                    evidenceError={evidenceError}
                  evidenceNotice={evidenceNotice}
                  evidenceResult={evidenceResult}
                  isGeneratingEvidence={isGeneratingEvidence}
                  usesMetricExecutionResult={false}
                  onGenerateEvidence={onGenerateEvidence}
                />
                  <ReportDraftSection
                    isGeneratingReport={isGeneratingReport}
                    onGenerateReport={onGenerateReport}
                    reportDraft={reportDraft}
                    reportError={reportError}
                    reportNotice={reportNotice}
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
              evidenceNotice={evidenceNotice}
              evidenceResult={evidenceResult}
              executionResult={analysisExecutionResult}
              isGeneratingEvidence={isGeneratingEvidence}
              isGeneratingReport={isGeneratingReport}
              onGenerateEvidence={onGenerateEvidence}
              onGenerateReport={onGenerateReport}
              reportDraft={reportDraft}
              reportError={reportError}
              reportNotice={reportNotice}
              uploadResult={uploadResult}
            />
          ) : null}
        </>
      ) : (
        <>
          <AnalysisPlanAction
            analysisPlanError={analysisPlanError}
            analysisPlanNotice={analysisPlanNotice}
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
  analysisPlanNotice,
  isGeneratingAnalysisPlan,
  onGeneratePlan,
}: {
  analysisPlanError: string;
  analysisPlanNotice: string;
  isGeneratingAnalysisPlan: boolean;
  onGeneratePlan: () => void;
}) {
  return (
    <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:items-center">
      <button
        className={primaryButtonClassName}
        disabled={isGeneratingAnalysisPlan}
        onClick={onGeneratePlan}
        type="button"
      >
        {isGeneratingAnalysisPlan ? "正在生成分析计划……" : "生成分析计划"}
      </button>
      {analysisPlanNotice ? (
        <p className="text-sm font-medium text-accent">{analysisPlanNotice}</p>
      ) : null}
      {analysisPlanError ? (
        <p className="text-sm font-medium text-red-700">{analysisPlanError}</p>
      ) : null}
    </div>
  );
}

function AnalysisPlanSection({
  analysisPlan,
  isExecutingMetricSpec,
  metricSpec,
  metricSpecError,
  metricSpecExecutionError,
  metricSpecExecutionResult,
  onExecuteMetricSpec,
  showMetricSpec = true,
  uploadResult,
}: {
  analysisPlan: AnalysisPlan;
  isExecutingMetricSpec: boolean;
  metricSpec: MetricSpec | null;
  metricSpecError: string;
  metricSpecExecutionError: string;
  metricSpecExecutionResult: MetricSpecExecutionResult | null;
  onExecuteMetricSpec: () => void;
  showMetricSpec?: boolean;
  uploadResult: UploadResponse | null;
}) {
  const relevantLimitations = getRelevantLimitations(
    analysisPlan.analysis_limitations,
    uploadResult,
  );

  return (
    <section className="mt-6 rounded-lg border border-ink/10 bg-white p-5 shadow-sm">
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

        {showMetricSpec ? (
          <MetricSpecCard
            isExecutingMetricSpec={isExecutingMetricSpec}
            metricSpec={metricSpec}
            metricSpecError={metricSpecError}
            metricSpecExecutionError={metricSpecExecutionError}
            metricSpecExecutionResult={metricSpecExecutionResult}
            onExecuteMetricSpec={onExecuteMetricSpec}
            taskFeedback={null}
            taskStepIndex={0}
          />
        ) : null}

        {relevantLimitations.length ? (
          <AnalysisPlanCard title="当前限制">
            <ul className="space-y-2 text-sm leading-6 text-ink/66">
              {relevantLimitations.map((item) => (
                <li className="rounded-md bg-ink/[0.04] px-3 py-2" key={item}>
                  {item}
                </li>
              ))}
            </ul>
          </AnalysisPlanCard>
        ) : null}

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
        className={`${primaryButtonClassName} text-transparent`}
        disabled={isExecutingAnalysis}
        onClick={onExecuteAnalysis}
        type="button"
      >
        <span className="text-white">
          {isExecutingAnalysis ? "正在生成可视化分析" : "生成可视化分析"}
        </span>
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
  evidenceNotice,
  evidenceResult,
  executionResult,
  isGeneratingEvidence,
  isGeneratingReport,
  onGenerateEvidence,
  onGenerateReport,
  reportDraft,
  reportError,
  reportNotice,
  uploadResult,
}: {
  evidenceError: string;
  evidenceNotice: string;
  evidenceResult: EvidenceResult | null;
  executionResult: AnalysisExecutionResult;
  isGeneratingEvidence: boolean;
  isGeneratingReport: boolean;
  onGenerateEvidence: () => void;
  onGenerateReport: () => void;
  reportDraft: ReportDraft | null;
  reportError: string;
  reportNotice: string;
  uploadResult: UploadResponse | null;
}) {
  const relevantLimitations = getRelevantLimitations(
    executionResult.limitations,
    uploadResult,
  );

  return (
    <section className="mt-6 rounded-lg border border-ink/10 bg-white p-5 shadow-sm">
      <p className="text-sm font-medium text-accent">分析执行结果</p>
      <p className="mt-3 text-base leading-7 text-ink/76">
        {executionResult.execution_summary}
      </p>
      <AnalysisCharts tables={executionResult.tables} />
      <EvidenceChainSection
        evidenceError={evidenceError}
        evidenceNotice={evidenceNotice}
        evidenceResult={evidenceResult}
        isGeneratingEvidence={isGeneratingEvidence}
        usesMetricExecutionResult={false}
        onGenerateEvidence={onGenerateEvidence}
      />
      <ReportDraftSection
        isGeneratingReport={isGeneratingReport}
        onGenerateReport={onGenerateReport}
        reportDraft={reportDraft}
        reportError={reportError}
        reportNotice={reportNotice}
      />

      <div className="mt-5 space-y-4">
        {executionResult.tables.map((table) => (
          <ExecutionResultTableCard key={table.id} table={table} />
        ))}
      </div>

      {relevantLimitations.length ? (
        <section className="mt-5 rounded-lg border border-ink/10 bg-white p-4">
          <h3 className="text-base font-semibold text-ink">当前限制</h3>
          <ul className="mt-3 space-y-2 text-sm leading-6 text-ink/66">
            {relevantLimitations.map((item) => (
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

function MetricSpecCard({
  isExecutingMetricSpec,
  metricSpec,
  metricSpecError,
  metricSpecExecutionError,
  metricSpecExecutionResult,
  onExecuteMetricSpec,
  taskFeedback,
  taskStepIndex,
}: {
  isExecutingMetricSpec: boolean;
  metricSpec: MetricSpec | null;
  metricSpecError: string;
  metricSpecExecutionError: string;
  metricSpecExecutionResult: MetricSpecExecutionResult | null;
  onExecuteMetricSpec: () => void;
  taskFeedback: AsyncTaskFeedback | null;
  taskStepIndex: number;
}) {
  if (metricSpecError) {
    return (
      <AnalysisPlanCard title="指标计算规格">
        <p className="text-sm font-medium text-red-700">{metricSpecError}</p>
      </AnalysisPlanCard>
    );
  }

  if (!metricSpec) {
    return null;
  }

  return (
    <AnalysisPlanCard title="指标计算规格">
      <div className="grid gap-3 text-sm sm:grid-cols-2">
        <SummaryItem label="指标名称" value={metricSpec.metric_name} />
        <SummaryItem label="指标公式" value={metricSpec.metric_formula} />
        <SummaryItem
          label="分子字段"
          value={formatMetricSpecField(metricSpec.numerator)}
        />
        <SummaryItem
          label="分母字段"
          value={formatMetricSpecField(metricSpec.denominator)}
        />
        <SummaryItem
          label="对比周期字段"
          value={metricSpec.period_field || "暂未识别"}
        />
        <SummaryItem
          label="时间字段"
          value={metricSpec.time_field || "暂未识别"}
        />
      </div>

      <div className="mt-4 grid gap-4 md:grid-cols-2">
        <div>
          <h4 className="text-sm font-semibold text-ink">拆解维度</h4>
          {metricSpec.dimensions.length ? (
            <div className="mt-2 flex flex-wrap gap-2">
              {metricSpec.dimensions.map((dimension) => (
                <span
                  className="rounded-full border border-accent/20 bg-accent/8 px-3 py-1 text-xs font-medium text-accent"
                  key={dimension.field}
                >
                  {dimension.label}：{dimension.field}
                </span>
              ))}
            </div>
          ) : (
            <p className="mt-2 text-sm text-ink/58">暂未识别拆解维度。</p>
          )}
        </div>

        <div>
          <h4 className="text-sm font-semibold text-ink">辅助字段</h4>
          {metricSpec.auxiliary_fields.length ? (
            <div className="mt-2 flex flex-wrap gap-2">
              {metricSpec.auxiliary_fields.map((field) => (
                <span
                  className="rounded-full border border-ink/10 bg-ink/[0.04] px-3 py-1 text-xs font-medium text-ink/66"
                  key={field.field}
                >
                  {field.label}：{field.field}
                </span>
              ))}
            </div>
          ) : (
            <p className="mt-2 text-sm text-ink/58">暂未识别辅助字段。</p>
          )}
        </div>
      </div>

      {metricSpec.limitations.length ? (
        <div className="mt-4">
          <h4 className="text-sm font-semibold text-ink">当前限制</h4>
          <ul className="mt-2 space-y-2 text-sm leading-6 text-ink/66">
            {metricSpec.limitations.map((item) => (
              <li className="rounded-md bg-ink/[0.04] px-3 py-2" key={item}>
                {item}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center">
        <button
          className={primaryButtonClassName}
          disabled={isExecutingMetricSpec}
          onClick={onExecuteMetricSpec}
          type="button"
        >
          {isExecutingMetricSpec ? "正在执行指标计算……" : "执行指标计算"}
        </button>
        {metricSpecExecutionError ? (
          <p className="text-sm font-medium text-red-700">
            {metricSpecExecutionError}
          </p>
        ) : null}
      </div>

      <TaskProgressCard feedback={taskFeedback} stepIndex={taskStepIndex} />

      {metricSpecExecutionResult ? (
        <MetricSpecExecutionSection result={metricSpecExecutionResult} />
      ) : (
        <PanelPlaceholder text="执行指标计算后，将展示核心指标变化、Top movers 和辅助指标对比。" />
      )}
    </AnalysisPlanCard>
  );
}

function MetricSpecExecutionSection({
  result,
}: {
  result: MetricSpecExecutionResult;
}) {
  const overall = result.overall_metric_comparison;
  const topMovers = result.top_movers.slice(0, 5);
  const visibleBreakdowns = result.dimension_breakdowns.slice(0, 2);
  const hiddenBreakdowns = result.dimension_breakdowns.slice(2);

  return (
    <div className="mt-5 space-y-5 border-t border-ink/10 pt-5">
      <section className="rounded-lg border border-accent/25 bg-white p-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <p className="text-sm font-medium text-accent">主结论区</p>
            <h4 className="mt-1 text-xl font-semibold text-ink">
              {overall.metric_name}
            </h4>
            <p className="mt-2 text-sm leading-6 text-ink/58">
              核心指标对比是当前页面的主结论；后续 Top movers、辅助指标和维度拆解用于解释变化来源。
            </p>
          </div>
          <DeltaBadge value={overall.delta_rate} />
        </div>

        <div className="mt-5 grid gap-4 md:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
          <div className="rounded-lg border border-ink/10 bg-surface/70 p-4">
            <div className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-3">
              <MetricRateBlock
                label={overall.baseline_label || "上周"}
                rate={overall.baseline.rate}
              />
              <span className="text-xl font-semibold text-ink/30">→</span>
              <MetricRateBlock
                label={overall.current_label || "本周"}
                rate={overall.current.rate}
              />
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2 md:grid-cols-1">
            <SummaryItem
              label={`${overall.baseline_label || "上周"}分母`}
              value={formatMetricNumber(overall.baseline.denominator)}
            />
            <SummaryItem
              label={`${overall.current_label || "本周"}分母`}
              value={formatMetricNumber(overall.current.denominator)}
            />
            <SummaryItem
              label={`${overall.baseline_label || "上周"}分子`}
              value={formatMetricNumber(overall.baseline.numerator)}
            />
            <SummaryItem
              label={`${overall.current_label || "本周"}分子`}
              value={formatMetricNumber(overall.current.numerator)}
            />
          </div>
        </div>
      </section>

      {topMovers.length ? (
        <section className="rounded-lg border border-ink/10 bg-white p-5">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-sm font-medium text-accent">解释区</p>
              <h4 className="mt-1 text-base font-semibold text-ink">
                Top movers
              </h4>
            </div>
            <span className="rounded-full border border-ink/10 bg-surface px-3 py-1 text-xs font-medium text-ink/58">
              前 {topMovers.length} 个高异动分组
            </span>
          </div>
          <div className="mt-3 grid gap-2">
            {topMovers.map((item) => (
              <div
                className="rounded-md border border-ink/10 bg-surface/60 px-3 py-3 text-sm"
                key={`${item.dimension_field}-${item.value}`}
              >
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div className="min-w-0">
                    <p className="text-xs font-medium text-ink/46">
                      {item.dimension_label}
                    </p>
                    <p className="mt-1 font-semibold text-ink">{item.value}</p>
                    <p className="mt-1 text-xs leading-5 text-ink/50">
                      {item.reason}
                    </p>
                  </div>
                  <div className="shrink-0 text-left sm:text-right">
                    <p className="text-sm font-semibold text-ink">
                      {formatMetricRate(item.baseline_rate)} →{" "}
                      {formatMetricRate(item.current_rate)}
                    </p>
                    <p className={getDeltaTextClass(item.delta_rate)}>
                      {formatDeltaRate(item.delta_rate)}
                    </p>
                    <p className="mt-1 text-xs text-ink/46">
                      本周样本量 {formatMetricNumber(item.current_denominator)}
                    </p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </section>
      ) : null}

      {result.auxiliary_metric_comparisons?.length ? (
        <section className="rounded-lg border border-ink/10 bg-white p-5">
          <h4 className="text-base font-semibold text-ink">辅助指标对比</h4>
          <p className="mt-1 text-sm leading-6 text-ink/58">
            用于判断辅助字段是否与核心指标变化同步移动。
          </p>
          <div className="mt-3 overflow-x-auto rounded-lg border border-ink/8 bg-white">
            <table className="w-full min-w-[680px] border-collapse text-left text-xs">
              <thead>
                <tr className="border-b border-ink/10 text-ink/48">
                  <th className="py-2 pl-4 pr-3 font-medium">字段</th>
                  <th className="py-2 pr-3 font-medium">上周均值</th>
                  <th className="py-2 pr-3 font-medium">本周均值</th>
                  <th className="py-2 pr-3 font-medium">变化值</th>
                  <th className="py-2 pr-4 font-medium">变化百分比</th>
                </tr>
              </thead>
              <tbody>
                {result.auxiliary_metric_comparisons.map((item) => (
                  <tr className="border-b border-ink/6" key={item.field}>
                    <td className="py-2 pl-4 pr-3 font-medium text-ink">
                      {item.label}：{item.field}
                    </td>
                    <td className="py-2 pr-3 text-ink/66">
                      {formatMetricAverage(item.baseline_avg)}
                    </td>
                    <td className="py-2 pr-3 text-ink/66">
                      {formatMetricAverage(item.current_avg)}
                    </td>
                    <td className="py-2 pr-3 text-ink/66">
                      {formatSignedAverage(item.delta_avg)}
                    </td>
                    <td className="py-2 pr-4 text-ink/66">
                      {formatSignedPercent(item.delta_pct)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}

      {result.dimension_breakdowns.length ? (
        <section className="rounded-lg border border-ink/10 bg-white p-5">
          <h4 className="text-base font-semibold text-ink">维度拆解结果</h4>
          <p className="mt-1 text-sm leading-6 text-ink/58">
            默认展示前 {visibleBreakdowns.length} 个维度，更多明细折叠保留，避免一次性铺满页面。
          </p>
          <div className="mt-4 space-y-4">
            {visibleBreakdowns.map((breakdown) => (
              <MetricDimensionBreakdownTable
                breakdown={breakdown}
                key={breakdown.dimension_field}
              />
            ))}
          </div>
          {hiddenBreakdowns.length ? (
            <details className="mt-4 rounded-lg border border-ink/10 bg-surface/60 p-4">
              <summary className="cursor-pointer text-sm font-semibold text-ink">
                查看其余 {hiddenBreakdowns.length} 个维度拆解
              </summary>
              <div className="mt-4 space-y-4">
                {hiddenBreakdowns.map((breakdown) => (
                  <MetricDimensionBreakdownTable
                    breakdown={breakdown}
                    key={breakdown.dimension_field}
                  />
                ))}
              </div>
            </details>
          ) : null}
        </section>
      ) : null}

      {result.warnings.length ? (
        <section>
          <h4 className="text-base font-semibold text-ink">执行提示</h4>
          <ul className="mt-2 space-y-2 text-sm leading-6 text-ink/66">
            {result.warnings.map((item) => (
              <li className="rounded-md bg-ink/[0.04] px-3 py-2" key={item}>
                {item}
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}

function MetricRateBlock({
  label,
  rate,
}: {
  label: string;
  rate: number | null;
}) {
  return (
    <div>
      <p className="text-xs font-medium text-ink/46">{label}</p>
      <p className="mt-2 text-3xl font-semibold tracking-normal text-ink">
        {formatMetricRate(rate)}
      </p>
    </div>
  );
}

function DeltaBadge({ value }: { value: number | null }) {
  const className =
    value === null || Number.isNaN(value)
      ? "border-ink/10 bg-ink/[0.03] text-ink/58"
      : value > 0
        ? "border-red-200 bg-red-50 text-red-700"
        : value < 0
          ? "border-accent/25 bg-accent/10 text-accent"
          : "border-ink/10 bg-ink/[0.03] text-ink/58";

  return (
    <div className={`rounded-lg border px-4 py-3 ${className}`}>
      <p className="text-xs font-medium">变化百分点</p>
      <p className="mt-1 text-2xl font-semibold tracking-normal">
        {formatDeltaRate(value)}
      </p>
    </div>
  );
}

function getDeltaTextClass(value: number | null) {
  if (value === null || Number.isNaN(value)) {
    return "mt-1 text-sm font-semibold text-ink/58";
  }

  if (value > 0) {
    return "mt-1 text-sm font-semibold text-red-700";
  }

  if (value < 0) {
    return "mt-1 text-sm font-semibold text-accent";
  }

  return "mt-1 text-sm font-semibold text-ink/58";
}

function MetricDimensionBreakdownTable({
  breakdown,
}: {
  breakdown: MetricSpecExecutionResult["dimension_breakdowns"][number];
}) {
  return (
    <div className="overflow-x-auto rounded-lg border border-ink/8 bg-white">
      <div className="border-b border-ink/8 px-4 py-3">
        <h5 className="text-sm font-semibold text-ink">
          {breakdown.dimension_label}
        </h5>
      </div>
      <table className="w-full min-w-[760px] border-collapse text-left text-xs">
        <thead>
          <tr className="border-b border-ink/10 text-ink/48">
            <th className="py-2 pl-4 pr-3 font-medium">维度值</th>
            <th className="py-2 pr-3 font-medium">上周指标率</th>
            <th className="py-2 pr-3 font-medium">本周指标率</th>
            <th className="py-2 pr-3 font-medium">变化百分点</th>
            <th className="py-2 pr-3 font-medium">本周分母</th>
            <th className="py-2 pr-4 font-medium">本周分子</th>
          </tr>
        </thead>
        <tbody>
          {breakdown.rows.slice(0, 20).map((row) => (
            <tr className="border-b border-ink/6" key={row.value}>
              <td className="py-2 pl-4 pr-3 font-medium text-ink">
                {row.value}
              </td>
              <td className="py-2 pr-3 text-ink/66">
                {formatMetricRate(row.baseline_rate)}
              </td>
              <td className="py-2 pr-3 text-ink/66">
                {formatMetricRate(row.current_rate)}
              </td>
              <td className="py-2 pr-3 text-ink/66">
                {formatDeltaRate(row.delta_rate)}
              </td>
              <td className="py-2 pr-3 text-ink/66">
                {formatMetricNumber(row.current_denominator)}
              </td>
              <td className="py-2 pr-4 text-ink/66">
                {formatMetricNumber(row.current_numerator)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function formatMetricSpecField(field: MetricSpec["numerator"]) {
  if (!field.field) {
    return "暂未明确";
  }

  return `${field.label}：${field.field}（${field.aggregation ?? "待确认"}）`;
}

function isMetricSpecExecutable(metricSpec: MetricSpec) {
  return Boolean(metricSpec.numerator?.field && metricSpec.denominator?.field);
}

function hasAuxiliaryMetricComparisons(
  result: MetricSpecExecutionResult | null,
) {
  return Boolean(result?.auxiliary_metric_comparisons?.length);
}

function getCompletedWorkflowStepIds({
  state,
  hasStarted,
  uploadResult,
  analysisPlan,
  metricSpecExecutionResult,
  evidenceResult,
  reportDraft,
}: {
  state: ClarificationState;
  hasStarted: boolean;
  uploadResult: UploadResponse | null;
  analysisPlan: AnalysisPlan | null;
  metricSpecExecutionResult: MetricSpecExecutionResult | null;
  evidenceResult: EvidenceResult | null;
  reportDraft: ReportDraft | null;
}) {
  const completed: WorkflowStepId[] = [];

  if (hasStarted && state.businessProblem.trim()) {
    completed.push("business_problem");
  }

  if (state.metricDefinition) {
    completed.push("metric_definition");
  }

  if (state.comparisonPeriod) {
    completed.push("comparison_period");
  }

  if (state.dimensions.length) {
    completed.push("dimensions");
  }

  if (state.changeFactors.length) {
    completed.push("change_factors");
  }

  if (uploadResult) {
    completed.push("upload_data");
  }

  if (analysisPlan) {
    completed.push("analysis_plan");
  }

  if (metricSpecExecutionResult) {
    completed.push("metric_calculation");
  }

  if (evidenceResult) {
    completed.push("evidence_chain");
  }

  if (reportDraft) {
    completed.push("report_draft");
  }

  return completed;
}

function getNextStepHint(stepId: WorkflowStepId) {
  const hintMap: Record<WorkflowStepId, string> = {
    business_problem: "先用自然语言描述业务指标异动，系统会生成后续澄清选项。",
    metric_definition: "选择最贴近业务口径的指标定义，或补充自定义口径。",
    comparison_period: "确认本次异动要比较的时间窗口。",
    dimensions: "选择最想优先排查的拆解维度，后续会和上传字段做语义匹配。",
    change_factors: "补充近期业务变化，帮助证据链区分事实、线索和限制。",
    upload_data: "上传 CSV 或 Excel，完成字段结构和语义识别。",
    analysis_plan: "生成分析计划，确认哪些维度和字段可以被实际验证。",
    metric_calculation: "执行指标计算，优先查看本周 vs 上周的真实指标变化和 Top movers。",
    evidence_chain: "生成证据链，把指标变化、分子分母和 Top movers 组织为可解释证据。",
    report_draft: "生成报告草稿，再基于业务语境人工审阅和补充结论。",
  };

  return hintMap[stepId];
}

function getWorkflowStepStatus({
  activeStepId,
  completedStepIds,
  isProcessing,
}: {
  activeStepId: WorkflowStepId;
  completedStepIds: WorkflowStepId[];
  isProcessing: boolean;
}) {
  if (isProcessing) {
    return "处理中";
  }

  if (completedStepIds.includes(activeStepId)) {
    return "已完成";
  }

  if (completedStepIds.length === 0 && activeStepId === "business_problem") {
    return "未开始";
  }

  return activeStepId === "business_problem" ? "进行中" : "等待用户操作";
}

function formatFieldList(fields?: string[] | null) {
  if (!fields?.length) {
    return "待识别";
  }

  return fields.slice(0, 3).join("、");
}

function formatCompactList(items: string[], visibleCount: number) {
  if (!items.length) {
    return "";
  }

  const visibleItems = items.slice(0, visibleCount).join("、");
  const hiddenCount = items.length - visibleCount;

  return hiddenCount > 0 ? `${visibleItems} +${hiddenCount}` : visibleItems;
}

function formatMetricNumber(value: number) {
  return value.toLocaleString("zh-CN");
}

function formatMetricRate(value: number | null) {
  if (value === null || Number.isNaN(value)) {
    return "无法计算";
  }

  return `${value.toFixed(2)}%`;
}

function formatDeltaRate(value: number | null) {
  if (value === null || Number.isNaN(value)) {
    return "无法计算";
  }

  const sign = value > 0 ? "+" : "";
  return `${sign}${value.toFixed(2)}pp`;
}

function formatMetricAverage(value: number | null) {
  if (value === null || Number.isNaN(value)) {
    return "无法计算";
  }

  return value.toFixed(2);
}

function formatSignedAverage(value: number | null) {
  if (value === null || Number.isNaN(value)) {
    return "无法计算";
  }

  const sign = value > 0 ? "+" : "";
  return `${sign}${value.toFixed(2)}`;
}

function formatSignedPercent(value: number | null) {
  if (value === null || Number.isNaN(value)) {
    return "无法计算";
  }

  const sign = value > 0 ? "+" : "";
  return `${sign}${value.toFixed(2)}%`;
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

function DataUploadSummary({ uploadResult }: { uploadResult: UploadResponse }) {
  const totalRows = uploadResult.files.reduce(
    (sum, file) => sum + file.row_count,
    0,
  );
  const totalColumns = uploadResult.files.reduce(
    (sum, file) => sum + file.column_count,
    0,
  );
  const primaryFile = uploadResult.files[0];

  return (
    <div>
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h3 className="text-base font-semibold text-ink">数据已识别</h3>
          <p className="mt-1 max-w-2xl text-sm leading-6 text-ink/58">
            已上传 {uploadResult.files.length} 个文件，字段明细和样例数据已默认折叠，避免打断当前分析流程。
          </p>
        </div>
        <span className="w-fit rounded-full border border-accent/20 bg-accent/10 px-3 py-1 text-xs font-semibold text-accent">
          Ready
        </span>
      </div>

      <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-4">
        <SummaryItem label="主文件" value={primaryFile?.filename ?? "待识别"} />
        <SummaryItem label="总行数" value={totalRows.toLocaleString("zh-CN")} />
        <SummaryItem label="字段数" value={totalColumns.toLocaleString("zh-CN")} />
        <SummaryItem
          label="识别场景"
          value={uploadResult.semantic_context?.business_domain ?? "待识别"}
        />
      </dl>
    </div>
  );
}

function DataSchemaResults({ uploadResult }: { uploadResult: UploadResponse }) {
  const supportedItems =
    uploadResult.semantic_context?.supported_analysis?.length
      ? uploadResult.semantic_context.supported_analysis
      : uploadResult.supported_analysis.map((title) => ({
          title,
          reason: "当前字段结构支持该分析方向。",
          related_fields: [],
        }));
  const unsupportedItems =
    uploadResult.semantic_context?.unsupported_analysis?.length
      ? uploadResult.semantic_context.unsupported_analysis
      : uploadResult.missing_requirements.map((reason) => ({
          title: "暂不支持的分析方向",
          reason,
          required_fields_or_context: [],
        }));

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
        {supportedItems.length ? (
          <div className="mt-3 grid gap-2">
            {supportedItems.map((item) => (
              <div
                className="rounded-md border border-accent/18 bg-accent/8 px-3 py-3 text-sm"
                key={item.title}
              >
                <p className="font-semibold text-accent">{item.title}</p>
                <p className="mt-1 leading-6 text-ink/62">{item.reason}</p>
                {item.related_fields?.length ? (
                  <p className="mt-1 text-xs text-ink/46">
                    相关字段：{item.related_fields.join("、")}
                  </p>
                ) : null}
              </div>
            ))}
          </div>
        ) : (
          <p className="mt-3 text-sm leading-6 text-ink/58">
            暂未识别到可直接支持的分析方向，建议补充与当前业务问题、指标口径和已选维度相关的字段。
          </p>
        )}
      </section>

      <section className="rounded-lg border border-ink/10 bg-white p-4">
        <h3 className="text-base font-semibold text-ink">
          当前数据暂不支持的部分
        </h3>
        {unsupportedItems.length ? (
          <ul className="mt-3 space-y-2 text-sm leading-6 text-ink/66">
            {unsupportedItems.map((item) => (
              <li className="rounded-md bg-ink/[0.04] px-3 py-2" key={`${item.title}-${item.reason}`}>
                <span className="font-semibold text-ink">{item.title}：</span>
                {item.reason}
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

      <details className="mt-5 rounded-md border border-ink/8 bg-surface/60 p-3">
        <summary className="cursor-pointer text-sm font-semibold text-ink">
          查看字段明细
        </summary>
        <div className="mt-3 overflow-x-auto">
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
      </details>

      <div className="mt-5">
        <h4 className="text-sm font-semibold text-ink">前 5 行样例数据</h4>
        <details className="mt-3 rounded-md border border-ink/8 bg-surface/60 p-3">
          <summary className="cursor-pointer text-sm font-semibold text-ink">
            查看前 5 行样例
          </summary>
          <SampleRowsTable file={file} />
        </details>
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

function getBusinessClarificationNotice(generated: BusinessClarificationResult) {
  if (generated.source === "fallback") {
    if (generated.fallbackReason) {
      return `AI 业务澄清生成失败：${generated.fallbackReason}。已使用本地规则继续生成澄清卡片。`;
    }

    return "AI 业务澄清生成失败，已使用本地规则继续生成澄清卡片。";
  }

  return "AI 已根据你的业务问题生成澄清卡片。";
}

function isValidBrowserFile(file: unknown): file is File {
  return (
    typeof File !== "undefined" &&
    file instanceof File &&
    Boolean(file.name) &&
    file.size > 0
  );
}

function getCustomMetricPlaceholder(result: MetricDefinitionResult) {
  if (!result.metricName) {
    return "请补充你们业务中该指标的计算方式……";
  }

  return `请补充你们业务中“${result.metricName}”的计算方式……`;
}

function getDataNeedSummary(dataRequirements: string[]) {
  if (dataRequirements.length === 0) {
    return "指标发生时间字段、指标分子和分母或目标结果字段、核心业务对象 ID 字段、可用于拆解的分层、场景或环境字段";
  }

  return dataRequirements.join("、");
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
      item !== "数据字段匹配情况待确认" &&
      !isLegacyGenericDataLimitation(item, uploadResult),
  );
  const semanticUnsupported =
    uploadResult.semantic_context?.unsupported_analysis?.map(
      (item) => item.reason,
    ) ?? [];
  const readinessLimitations = uploadResult.semantic_context
    ? semanticUnsupported
    : getRelevantLimitations(missingInfo, uploadResult);
  const dataRequirementStatus =
    semanticUnsupported.length
      ? `数据需求：仍有 ${semanticUnsupported.length} 个当前场景相关缺失项`
      : uploadResult.supported_analysis.length
    ? "数据需求：已初步满足"
    : "数据字段匹配情况待确认";

  return {
    ...readiness,
    confirmed_info: [...confirmedInfo, "数据状态：已上传并完成字段识别"],
    missing_info: [...readinessLimitations, dataRequirementStatus],
    next_question: "可以生成分析计划，系统将在下一阶段规划具体拆解路径。",
  };
}

function isLegacyGenericDataLimitation(
  item: string,
  uploadResult: UploadResponse,
) {
  if (!uploadResult.semantic_context?.scenario_match) {
    return false;
  }

  const text = item.toLowerCase();
  return ["用户字段", "渠道来源字段", "金额字段", "优惠券相关字段"].some(
    (term) => text.includes(term.toLowerCase()),
  );
}

function getRelevantLimitations(
  limitations: string[],
  uploadResult: UploadResponse | null,
) {
  return limitations.filter((item) => isRelevantLimitation(item, uploadResult));
}

function isRelevantLimitation(
  limitation: string,
  uploadResult: UploadResponse | null,
) {
  if (!uploadResult?.semantic_context) {
    return true;
  }

  const text = limitation.toLowerCase();
  const contextText = buildSemanticContextText(uploadResult).toLowerCase();

  if (hasAnyText(text, ["优惠券", "coupon"])) {
    return hasAnyText(contextText, ["优惠券", "coupon", "核销"]);
  }
  if (hasAnyText(text, ["gmv", "金额", "销售额", "支付", "收入"])) {
    return hasAnyText(contextText, [
      "电商",
      "退款",
      "订单金额",
      "退款金额",
      "gmv",
      "金额",
      "销售额",
      "支付",
      "收入",
    ]);
  }
  if (hasAnyText(text, ["渠道来源字段", "渠道字段", "渠道来源"])) {
    return hasAnyText(contextText, [
      "渠道",
      "来源",
      "流量来源",
      "订单来源",
      "获客渠道",
      "招聘渠道",
      "客服渠道",
    ]);
  }
  if (hasAnyText(text, ["缺少用户字段", "用户字段"])) {
    return hasAnyText(contextText, [
      "用户",
      "客户",
      "会员",
      "学生",
      "user",
      "customer",
      "member",
      "student",
    ]);
  }
  if (hasAnyText(text, ["acs"])) {
    return hasAnyText(contextText, ["游戏", "胜率", "对局", "acs"]);
  }

  return true;
}

function buildSemanticContextText(uploadResult: UploadResponse) {
  const semanticContext = uploadResult.semantic_context;
  const fieldRoles = semanticContext?.field_roles ?? [];
  const supportedAnalysis = semanticContext?.supported_analysis ?? [];
  const unsupportedAnalysis = semanticContext?.unsupported_analysis ?? [];

  return [
    semanticContext?.business_domain,
    semanticContext?.scenario_match?.scenario_id,
    semanticContext?.scenario_match?.domain_label,
    semanticContext?.primary_metric?.name,
    semanticContext?.primary_metric?.definition,
    ...fieldRoles.flatMap((role) => [
      role.field,
      role.original_name,
      role.semantic_label,
      role.matched_user_need,
    ]),
    ...supportedAnalysis.flatMap((item) => [
      item.title,
      item.reason,
      ...(item.related_fields ?? []),
    ]),
    ...unsupportedAnalysis.flatMap((item) => [
      item.title,
      item.reason,
      ...(item.required_fields_or_context ?? []),
    ]),
  ]
    .filter((item): item is string => Boolean(item))
    .join(" ");
}

function hasAnyText(text: string, keywords: string[]) {
  return keywords.some((keyword) => text.includes(keyword.toLowerCase()));
}

function formatMissingRate(value: number) {
  return `${Math.round(value * 1000) / 10}%`;
}

function formatSemanticRole(role: string) {
  const roleLabels: Record<string, string> = {
    id: "ID",
    time: "时间",
    period: "周期",
    metric_numerator: "指标分子",
    metric_denominator: "指标分母",
    dimension: "拆解维度",
    auxiliary_metric: "辅助指标",
    explanatory_field: "解释字段",
    status: "状态",
    unknown: "待判断",
  };

  return roleLabels[role] ?? role;
}

function formatScenarioConfidence(score: number) {
  if (score >= 0.65) {
    return "高";
  }
  if (score >= 0.25) {
    return "中";
  }
  return "低";
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
