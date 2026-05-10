import type { MetricSpec } from "@/lib/metric-spec";

export type OverallMetricComparison = {
  metric_name: string;
  baseline_label: string;
  current_label: string;
  baseline: {
    denominator: number;
    numerator: number;
    rate: number | null;
  };
  current: {
    denominator: number;
    numerator: number;
    rate: number | null;
  };
  delta_rate: number | null;
  delta_numerator: number;
  delta_denominator: number;
};

export type MetricDimensionBreakdown = {
  dimension_field: string;
  dimension_label: string;
  rows: Array<{
    value: string;
    baseline_denominator: number;
    baseline_numerator: number;
    baseline_rate: number | null;
    current_denominator: number;
    current_numerator: number;
    current_rate: number | null;
    delta_rate: number | null;
    delta_numerator: number;
    current_share: number | null;
  }>;
};

export type MetricTopMover = {
  dimension_field: string;
  dimension_label: string;
  value: string;
  baseline_rate: number | null;
  current_rate: number | null;
  delta_rate: number | null;
  current_denominator: number;
  current_numerator: number;
  reason: string;
};

export type AuxiliaryMetricComparison = {
  field: string;
  label: string;
  baseline_avg: number;
  current_avg: number;
  delta_avg: number;
  delta_pct: number | null;
};

export type MetricSpecExecutionResult = {
  overall_metric_comparison: OverallMetricComparison;
  dimension_breakdowns: MetricDimensionBreakdown[];
  top_movers: MetricTopMover[];
  auxiliary_metric_comparisons: AuxiliaryMetricComparison[];
  warnings: string[];
  source: "metric_spec_executor";
};

export async function executeMetricSpec(input: {
  uploadId: string;
  metricSpec: MetricSpec;
  tableName?: string | null;
}): Promise<MetricSpecExecutionResult> {
  const apiBaseUrl =
    process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:8000";

  const response = await fetch(`${apiBaseUrl}/api/metric-spec/execute`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      upload_id: input.uploadId,
      table_name: input.tableName,
      metric_spec: input.metricSpec,
    }),
  });

  if (!response.ok) {
    const errorPayload = await response.json().catch(() => null);
    const detail =
      typeof errorPayload?.detail === "string"
        ? errorPayload.detail
        : "指标计算执行失败，请稍后重试。";
    throw new Error(detail);
  }

  const payload = (await response.json()) as {
    metric_execution_result: MetricSpecExecutionResult;
  };
  return payload.metric_execution_result;
}
