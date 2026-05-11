export type UploadColumn = {
  original_name: string;
  clean_name: string;
  dtype: string;
  missing_rate: number;
  sample_values: unknown[];
};

export type UploadFileSchema = {
  filename: string;
  table_name: string;
  row_count: number;
  column_count: number;
  columns: UploadColumn[];
  sample_rows: Record<string, unknown>[];
};

export type SemanticFieldRole = {
  field: string;
  original_name?: string;
  semantic_label: string;
  role:
    | "id"
    | "time"
    | "period"
    | "metric_numerator"
    | "metric_denominator"
    | "dimension"
    | "auxiliary_metric"
    | "explanatory_field"
    | "status"
    | "unknown";
  matched_user_need: string;
  confidence: "high" | "medium" | "low";
  reason: string;
};

export type SemanticAnalysisItem = {
  title: string;
  reason: string;
  related_fields?: string[];
  required_fields_or_context?: string[];
};

export type SemanticContext = {
  source?: "llm" | "fallback";
  fallback_reason?: string | null;
  scenario_match?: {
    scenario_id: string;
    score: number;
    domain_label?: string;
    matched_reasons: string[];
  } | null;
  business_domain: string;
  primary_metric: {
    name: string;
    definition: string;
    numerator_meaning: string;
    denominator_meaning: string;
    candidate_numerator_fields: string[];
    candidate_denominator_fields: string[];
  };
  field_roles: SemanticFieldRole[];
  supported_analysis: SemanticAnalysisItem[];
  unsupported_analysis: SemanticAnalysisItem[];
  irrelevant_modules: Array<{
    module: string;
    reason: string;
  }>;
};

export type UploadResponse = {
  upload_id: string;
  files: UploadFileSchema[];
  supported_analysis: string[];
  missing_requirements: string[];
  semantic_context?: SemanticContext;
};

export type UploadBusinessContext = {
  businessProblem: string;
  businessDomain: string;
  metricName: string;
  metricDefinition?: string | null;
  detectedScenario: string;
  selectedDimensions?: string[];
  selectedChangeFactors?: string[];
  dataRequirements: string[];
};

export async function uploadDataFiles(
  files: File[],
  businessContext?: UploadBusinessContext,
): Promise<UploadResponse> {
  const apiBaseUrl =
    process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:8000";
  const requestUrl = `${apiBaseUrl}/api/data/upload`;
  const pageOrigin =
    typeof window !== "undefined" ? window.location.origin : "未知页面来源";
  const validFiles = files.filter(isValidUploadFile);

  const diagnostics = buildUploadDiagnostics(files, requestUrl, pageOrigin, []);

  if (validFiles.length !== files.length || validFiles.length === 0) {
    throw new Error(
      `上传失败：没有读取到有效文件，请重新选择 CSV 或 Excel 文件。\n${formatUploadDiagnostics(diagnostics)}`,
    );
  }

  const formData = new FormData();
  validFiles.forEach((file) => {
    formData.append("files", file);
  });
  if (businessContext) {
    formData.append("business_context_json", JSON.stringify(businessContext));
  }
  const formDataKeys = Array.from(formData.keys());
  const requestDiagnostics = buildUploadDiagnostics(
    validFiles,
    requestUrl,
    pageOrigin,
    formDataKeys,
  );

  let response: Response;
  try {
    console.info("MetricFlow upload diagnostics", requestDiagnostics);
    response = await fetch(requestUrl, {
      method: "POST",
      body: formData,
    });
  } catch (error) {
    throw new Error(buildUploadConnectionError(requestDiagnostics, error));
  }

  if (!response.ok) {
    const errorPayload = await response.json().catch(() => null);
    const detail =
      typeof errorPayload?.detail === "string"
        ? errorPayload.detail
        : "数据上传失败，请稍后重试。";
    throw new Error(`上传失败：${detail}\n${formatUploadDiagnostics(requestDiagnostics)}`);
  }

  return (await response.json()) as UploadResponse;
}

function isValidUploadFile(file: unknown): file is File {
  return (
    typeof File !== "undefined" &&
    file instanceof File &&
    Boolean(file.name) &&
    file.size > 0
  );
}

type UploadDiagnostics = {
  filesCount: number;
  fileNames: string[];
  fileSizes: number[];
  fileTypes: string[];
  fileInstanceChecks: boolean[];
  formDataKeys: string[];
  requestUrl: string;
  pageOrigin: string;
};

function buildUploadDiagnostics(
  files: unknown[],
  requestUrl: string,
  pageOrigin: string,
  formDataKeys: string[],
): UploadDiagnostics {
  return {
    filesCount: files.length,
    fileNames: files.map((file) =>
      isFileLike(file) ? file.name : "[不是 File 对象]",
    ),
    fileSizes: files.map((file) => (isFileLike(file) ? file.size : 0)),
    fileTypes: files.map((file) => (isFileLike(file) ? file.type || "(空类型)" : "(非文件)")),
    fileInstanceChecks: files.map((file) => typeof File !== "undefined" && file instanceof File),
    formDataKeys,
    requestUrl,
    pageOrigin,
  };
}

function isFileLike(file: unknown): file is Pick<File, "name" | "size" | "type"> {
  return (
    typeof file === "object" &&
    file !== null &&
    "name" in file &&
    "size" in file
  );
}

function formatUploadDiagnostics(diagnostics: UploadDiagnostics) {
  return [
    `requestUrl：${diagnostics.requestUrl}`,
    `pageOrigin：${diagnostics.pageOrigin}`,
    `filesCount：${diagnostics.filesCount}`,
    `fileNames：${diagnostics.fileNames.join("、") || "无"}`,
    `fileSizes：${diagnostics.fileSizes.join("、") || "无"}`,
    `fileTypes：${diagnostics.fileTypes.join("、") || "无"}`,
    `fileInstanceChecks：${diagnostics.fileInstanceChecks.join("、") || "无"}`,
    `formDataKeys：${diagnostics.formDataKeys.join("、") || "无"}`,
  ].join("\n");
}

function buildUploadConnectionError(diagnostics: UploadDiagnostics, error: unknown) {
  const errorName = error instanceof Error && error.name ? error.name : "未知错误类型";
  const detail = error instanceof Error && error.message ? error.message : "未知网络错误";

  return [
    "无法连接后端上传服务。浏览器已无法取得 HTTP 响应，因此这不是后端返回的 4xx/5xx。",
    `错误类型：${errorName}`,
    `底层错误：${detail}`,
    formatUploadDiagnostics(diagnostics),
  ].join("\n");
}
