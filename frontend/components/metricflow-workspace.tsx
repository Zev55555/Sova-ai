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
import { AnalysisCharts } from "@/components/analysis-charts";
import { ApiSettings } from "@/components/api-settings";
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

const specialChangeFactorIds = ["none", "unknown"];

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
    setAnalysisPlanNotice("");
    setIsGeneratingAnalysisPlan(false);
    setMetricSpec(null);
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
  }

  async function handleUploadFiles(files: File[]) {
    const selectedFiles = files.filter(isValidBrowserFile);

    setUploadResult(null);
    setUploadError("");
    setAnalysisPlan(null);
    setAnalysisPlanError("");
    setAnalysisPlanNotice("");
    setMetricSpec(null);
    setMetricSpecError("");
    setMetricSpecExecutionResult(null);
    setMetricSpecExecutionError("");
    setAnalysisExecutionResult(null);
    setAnalysisExecutionError("");
    setEvidenceResult(null);
    setEvidenceError("");
    setEvidenceNotice("");
    setReportDraft(null);
    setReportError("");
    setReportNotice("");

    if (selectedFiles.length !== files.length || selectedFiles.length === 0) {
      setUploadError("上传失败：没有读取到有效文件，请重新选择 CSV 或 Excel 文件。");
      return;
    }

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
      setUploadError("");
    } catch (error) {
      setUploadResult(null);
      setAnalysisPlan(null);
      setMetricSpec(null);
      setMetricSpecExecutionResult(null);
      setAnalysisExecutionResult(null);
      setEvidenceResult(null);
      setReportDraft(null);
      setUploadError(
        error instanceof Error ? error.message : "数据上传失败，请稍后重试。",
      );
    } finally {
      setIsUploading(false);
    }
  }

  async function handleGenerateAnalysisPlan() {
    if (!uploadResult) {
      setAnalysisPlanNotice("");
      setAnalysisPlanError("请先上传数据并完成字段识别。");
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

    setIsGeneratingAnalysisPlan(true);
    setAnalysisPlanError("");
    setAnalysisPlanNotice("");
    setMetricSpec(null);
    setMetricSpecError("");
    setMetricSpecExecutionResult(null);
    setMetricSpecExecutionError("");
    setAnalysisExecutionResult(null);
    setAnalysisExecutionError("");
    setEvidenceResult(null);
    setEvidenceError("");
    setEvidenceNotice("");
    setReportDraft(null);
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
          setAnalysisPlanNotice(
            `AI 分析计划生成失败：${reason}。已使用本地规则继续生成分析计划。`,
          );
          return;
        }
      }

      const nextAnalysisPlan = await generateAnalysisPlan(planInput);
      setAnalysisPlan(nextAnalysisPlan);
      await handleBuildMetricSpec(nextAnalysisPlan);
      setAnalysisPlanNotice(
        "当前使用本地规则生成分析计划。你也可以在 API 设置中配置模型，获得更智能的分析计划。",
      );
    } catch {
      setAnalysisPlanError("分析计划生成失败，请稍后重试或检查上传数据。");
    } finally {
      setIsGeneratingAnalysisPlan(false);
    }
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
    if (!uploadResult || !metricSpec) {
      setMetricSpecExecutionError("请先生成指标计算规格。");
      return;
    }

    if (!isMetricSpecExecutable(metricSpec)) {
      setMetricSpecExecutionResult(null);
      setMetricSpecExecutionError(
        "指标计算规格缺少分子或分母字段，请检查字段语义识别。",
      );
      return;
    }

    setIsExecutingMetricSpec(true);
    setMetricSpecExecutionError("");
    setMetricSpecExecutionResult(null);

    try {
      const result = await executeMetricSpec({
        uploadId: uploadResult.upload_id,
        metricSpec,
      });
      setMetricSpecExecutionResult(result);
    } catch (error) {
      setMetricSpecExecutionError(
        error instanceof Error ? error.message : "指标计算执行失败，请稍后重试。",
      );
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
    if (metricSpec && !isMetricSpecExecutable(metricSpec) && !analysisExecutionResult) {
      setEvidenceNotice("");
      setEvidenceError("指标计算规格缺少分子或分母字段，请检查字段语义识别。");
      return;
    }

    if (!analysisPlan || (!analysisExecutionResult && !metricSpecExecutionResult)) {
      setEvidenceNotice("");
      setEvidenceError("请先执行指标计算或基础分析，再生成证据链。");
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

    setIsGeneratingEvidence(true);
    setEvidenceError("");
    setEvidenceNotice("");
    setReportDraft(null);
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
          setEvidenceNotice(
            `AI 证据链生成失败：${reason}。已使用本地规则继续生成证据链。`,
          );
          return;
        }
      }

      const nextEvidenceResult = await generateEvidenceChain(evidenceInput);
      setEvidenceResult(nextEvidenceResult);
      setEvidenceNotice(
        metricSpecExecutionResult
          ? "已使用指标计算结果生成证据链。"
          : "当前使用本地规则生成证据链。你也可以在 API 设置中配置模型，获得更自然的证据链表达。",
      );
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
    if (!analysisPlan || (!analysisExecutionResult && !metricSpecExecutionResult) || !evidenceResult) {
      setReportNotice("");
      setReportError("请先生成证据链，再生成报告草稿。");
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
          setReportNotice(
            `AI 报告生成失败：${reason}。已使用本地规则继续生成报告草稿。`,
          );
          return;
        }
      }

      const nextReportDraft = await generateReportDraft(reportInput);
      setReportDraft(nextReportDraft);
      setReportNotice(
        metricSpecExecutionResult
          ? "已使用指标计算结果生成报告草稿。"
          : "当前使用本地规则生成报告草稿。你也可以在 API 设置中配置模型，获得更自然的报告表达。",
      );
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
          <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <p className="mb-2 text-sm font-medium text-accent">
                中文 AI 指标异动分析工作台
              </p>
              <h1 className="text-2xl font-semibold tracking-normal text-ink sm:text-3xl">
                MetricFlow AI｜指标异动分析工作台
              </h1>
              <p className="mt-3 max-w-3xl text-sm leading-6 text-ink/68 sm:text-base">
                从模糊业务问题出发，逐步澄清指标口径、分析维度和数据需求。
              </p>
            </div>
            <ApiSettings />
          </div>
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
                  onChange={(event) => {
                    setClarificationState((current) => ({
                      ...current,
                      businessProblem: event.target.value,
                      analysisTarget: "",
                    }));
                    setBusinessClarificationResult(null);
                    setMetricDefinitionNotice("");
                  }}
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
                    !clarificationState.businessProblem.trim() ||
                    isEvaluating ||
                    isGeneratingMetricDefinitions
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
                    placeholder="请补充当前场景下需要优先拆解的维度……"
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
              dataRequirements={dataRequirements}
              isReadyForData={isReadyForData}
              metricDefinitionResult={metricDefinitionResult}
              state={clarificationState}
            />

            {uploadResult ? (
              <DataFieldUnderstandingCard uploadResult={uploadResult} />
            ) : null}

            {isReadyForData ? (
              <>
                <DataNeedsSection dataRequirements={dataRequirements} />
                <DataUploadSection
                  analysisPlan={analysisPlan}
                  analysisPlanError={analysisPlanError}
                  analysisPlanNotice={analysisPlanNotice}
                  analysisExecutionError={analysisExecutionError}
                  analysisExecutionResult={analysisExecutionResult}
                  evidenceError={evidenceError}
                  evidenceNotice={evidenceNotice}
                  evidenceResult={evidenceResult}
                  isUploading={isUploading}
                  isExecutingAnalysis={isExecutingAnalysis}
                  isGeneratingAnalysisPlan={isGeneratingAnalysisPlan}
                  isGeneratingEvidence={isGeneratingEvidence}
                  isGeneratingReport={isGeneratingReport}
                  isExecutingMetricSpec={isExecutingMetricSpec}
                  metricSpec={metricSpec}
                  metricSpecError={metricSpecError}
                  metricSpecExecutionError={metricSpecExecutionError}
                  metricSpecExecutionResult={metricSpecExecutionResult}
                  onExecuteAnalysis={handleExecuteBasicAnalysis}
                  onExecuteMetricSpec={handleExecuteMetricSpec}
                  onGenerateEvidence={handleGenerateEvidenceChain}
                  onGeneratePlan={handleGenerateAnalysisPlan}
                  onGenerateReport={handleGenerateReportDraft}
                  onUploadFiles={handleUploadFiles}
                  reportDraft={reportDraft}
                  reportError={reportError}
                  reportNotice={reportNotice}
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
    <section className="rounded-lg border border-ink/10 bg-white/72 p-5 shadow-soft backdrop-blur sm:p-6">
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
    <section className="rounded-lg border border-accent/20 bg-white/78 p-5 shadow-soft backdrop-blur sm:p-6">
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
    <section className="rounded-lg border border-accent/25 bg-white/78 p-5 shadow-soft backdrop-blur sm:p-6">
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
        className="rounded-lg bg-ink px-5 py-3 text-sm font-semibold text-surface transition hover:bg-accent focus:outline-none focus:ring-4 focus:ring-accent/18 disabled:cursor-not-allowed disabled:bg-ink/35"
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
  uploadResult,
}: {
  analysisPlan: AnalysisPlan;
  isExecutingMetricSpec: boolean;
  metricSpec: MetricSpec | null;
  metricSpecError: string;
  metricSpecExecutionError: string;
  metricSpecExecutionResult: MetricSpecExecutionResult | null;
  onExecuteMetricSpec: () => void;
  uploadResult: UploadResponse | null;
}) {
  const relevantLimitations = getRelevantLimitations(
    analysisPlan.analysis_limitations,
    uploadResult,
  );

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

        <MetricSpecCard
          isExecutingMetricSpec={isExecutingMetricSpec}
          metricSpec={metricSpec}
          metricSpecError={metricSpecError}
          metricSpecExecutionError={metricSpecExecutionError}
          metricSpecExecutionResult={metricSpecExecutionResult}
          onExecuteMetricSpec={onExecuteMetricSpec}
        />

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
    <section className="mt-6 rounded-lg border border-accent/25 bg-white/82 p-5 shadow-soft">
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
}: {
  isExecutingMetricSpec: boolean;
  metricSpec: MetricSpec | null;
  metricSpecError: string;
  metricSpecExecutionError: string;
  metricSpecExecutionResult: MetricSpecExecutionResult | null;
  onExecuteMetricSpec: () => void;
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
          className="rounded-lg bg-accent px-5 py-3 text-sm font-semibold text-white transition hover:bg-ink focus:outline-none focus:ring-4 focus:ring-accent/18 disabled:cursor-not-allowed disabled:bg-ink/35"
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

      {metricSpecExecutionResult ? (
        <MetricSpecExecutionSection result={metricSpecExecutionResult} />
      ) : null}
    </AnalysisPlanCard>
  );
}

function MetricSpecExecutionSection({
  result,
}: {
  result: MetricSpecExecutionResult;
}) {
  const overall = result.overall_metric_comparison;
  const summaryItems = [
    {
      label: `${overall.baseline_label || "上周"}分母`,
      value: formatMetricNumber(overall.baseline.denominator),
    },
    {
      label: `${overall.baseline_label || "上周"}分子`,
      value: formatMetricNumber(overall.baseline.numerator),
    },
    {
      label: `${overall.baseline_label || "上周"}指标率`,
      value: formatMetricRate(overall.baseline.rate),
    },
    {
      label: `${overall.current_label || "本周"}分母`,
      value: formatMetricNumber(overall.current.denominator),
    },
    {
      label: `${overall.current_label || "本周"}分子`,
      value: formatMetricNumber(overall.current.numerator),
    },
    {
      label: `${overall.current_label || "本周"}指标率`,
      value: formatMetricRate(overall.current.rate),
    },
    {
      label: "变化百分点",
      value: formatDeltaRate(overall.delta_rate),
    },
  ];

  return (
    <div className="mt-5 space-y-5 border-t border-ink/10 pt-5">
      <section>
        <h4 className="text-base font-semibold text-ink">指标计算结果</h4>
        <div className="mt-3 grid gap-3 text-sm sm:grid-cols-4">
          {summaryItems.map((item) => (
            <SummaryItem
              key={item.label}
              label={item.label}
              value={item.value}
            />
          ))}
        </div>
      </section>

      {result.top_movers.length ? (
        <section>
          <h4 className="text-base font-semibold text-ink">Top 异动分组</h4>
          <div className="mt-3 grid gap-2">
            {result.top_movers.map((item) => (
              <div
                className="rounded-md border border-accent/18 bg-accent/8 px-3 py-3 text-sm"
                key={`${item.dimension_field}-${item.value}`}
              >
                <p className="font-semibold text-accent">
                  {item.dimension_label}：{item.value}
                </p>
                <p className="mt-1 text-ink/66">
                  {formatMetricRate(item.baseline_rate)} →{" "}
                  {formatMetricRate(item.current_rate)}，
                  变化 {formatDeltaRate(item.delta_rate)}，本周样本{" "}
                  {formatMetricNumber(item.current_denominator)}。
                </p>
                <p className="mt-1 text-xs text-ink/46">{item.reason}</p>
              </div>
            ))}
          </div>
        </section>
      ) : null}

      {result.auxiliary_metric_comparisons?.length ? (
        <section>
          <h4 className="text-base font-semibold text-ink">辅助指标对比</h4>
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
        <section className="space-y-4">
          <h4 className="text-base font-semibold text-ink">维度拆解结果</h4>
          {result.dimension_breakdowns.map((breakdown) => (
            <MetricDimensionBreakdownTable
              breakdown={breakdown}
              key={breakdown.dimension_field}
            />
          ))}
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
