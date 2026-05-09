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

export type UploadResponse = {
  upload_id: string;
  files: UploadFileSchema[];
  supported_analysis: string[];
  missing_requirements: string[];
};

export async function uploadDataFiles(
  files: File[],
  dimensions: string[],
): Promise<UploadResponse> {
  const apiBaseUrl =
    process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:8000";
  const formData = new FormData();

  files.forEach((file) => {
    formData.append("files", file);
  });
  formData.append("dimensions", JSON.stringify(dimensions));

  const response = await fetch(`${apiBaseUrl}/api/data/upload`, {
    method: "POST",
    body: formData,
  });

  if (!response.ok) {
    const errorPayload = await response.json().catch(() => null);
    const detail =
      typeof errorPayload?.detail === "string"
        ? errorPayload.detail
        : "数据上传失败，请稍后重试。";
    throw new Error(detail);
  }

  return (await response.json()) as UploadResponse;
}
