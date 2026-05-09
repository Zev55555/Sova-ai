"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { ExecutionResultTable } from "@/lib/analysis-execution";

type ChartSpec =
  | {
      id: string;
      kind: "line" | "bar";
      title: string;
      description: string;
      data: Record<string, unknown>[];
      xKey: string;
      yKeys: string[];
    }
  | {
      id: string;
      kind: "metric";
      title: string;
      description: string;
      metrics: { label: string; value: string }[];
      note?: string;
    };

const chartColors = ["#256f6a", "#7a5b22", "#6d5bd0", "#b45309"];

export function AnalysisCharts({ tables }: { tables: ExecutionResultTable[] }) {
  const chartSpecs = buildChartSpecs(tables);

  return (
    <section className="mt-5 rounded-lg border border-ink/10 bg-white p-4">
      <h3 className="text-base font-semibold text-ink">可视化分析</h3>
      <p className="mt-2 text-sm leading-6 text-ink/58">
        系统根据当前结果表自动生成基础图表，用于快速观察指标变化和维度差异。
      </p>

      {chartSpecs.length ? (
        <div className="mt-4 grid gap-4">
          {chartSpecs.map((spec) => (
            <ChartCard key={spec.id} spec={spec} />
          ))}
        </div>
      ) : (
        <p className="mt-4 rounded-md bg-ink/[0.04] px-4 py-3 text-sm leading-6 text-ink/62">
          当前结果表暂不适合生成图表，可以继续查看表格结果。
        </p>
      )}
    </section>
  );
}

function ChartCard({ spec }: { spec: ChartSpec }) {
  return (
    <article className="rounded-lg border border-ink/10 bg-surface/70 p-4">
      <h4 className="text-base font-semibold text-ink">{spec.title}</h4>
      <p className="mt-2 text-sm leading-6 text-ink/58">{spec.description}</p>

      {spec.kind === "metric" ? (
        <MetricCards spec={spec} />
      ) : (
        <div className="mt-4 h-72 w-full">
          <ResponsiveContainer height="100%" width="100%">
            {spec.kind === "line" ? (
              <LineChart data={spec.data} margin={{ left: 8, right: 16 }}>
                <CartesianGrid stroke="#dde3df" strokeDasharray="4 4" />
                <XAxis dataKey={spec.xKey} tick={{ fill: "#53635d", fontSize: 12 }} />
                <YAxis tick={{ fill: "#53635d", fontSize: 12 }} />
                <Tooltip />
                {spec.yKeys.map((key, index) => (
                  <Line
                    dataKey={key}
                    dot={false}
                    key={key}
                    stroke={chartColors[index % chartColors.length]}
                    strokeWidth={2}
                    type="monotone"
                  />
                ))}
              </LineChart>
            ) : (
              <BarChart data={spec.data} margin={{ left: 8, right: 16 }}>
                <CartesianGrid stroke="#dde3df" strokeDasharray="4 4" />
                <XAxis dataKey={spec.xKey} tick={{ fill: "#53635d", fontSize: 12 }} />
                <YAxis tick={{ fill: "#53635d", fontSize: 12 }} />
                <Tooltip />
                {spec.yKeys.map((key, index) => (
                  <Bar
                    dataKey={key}
                    fill={chartColors[index % chartColors.length]}
                    key={key}
                    radius={[4, 4, 0, 0]}
                  />
                ))}
              </BarChart>
            )}
          </ResponsiveContainer>
        </div>
      )}

      <p className="mt-3 text-xs leading-5 text-ink/48">
        该图用于观察数据分布和变化方向，具体原因需要结合更多数据进一步验证。
      </p>
    </article>
  );
}

function MetricCards({
  spec,
}: {
  spec: Extract<ChartSpec, { kind: "metric" }>;
}) {
  return (
    <div className="mt-4">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {spec.metrics.map((metric) => (
          <div
            className="rounded-md border border-ink/8 bg-white px-4 py-3"
            key={metric.label}
          >
            <p className="text-xs font-medium text-ink/48">{metric.label}</p>
            <p className="mt-1 text-lg font-semibold text-ink">{metric.value}</p>
          </div>
        ))}
      </div>
      {spec.note ? (
        <p className="mt-3 text-sm leading-6 text-ink/58">{spec.note}</p>
      ) : null}
    </div>
  );
}

function buildChartSpecs(tables: ExecutionResultTable[]): ChartSpec[] {
  return tables
    .map((table) => {
      if (table.id === "overall_trend") {
        return buildOverallTrendChart(table);
      }
      if (table.id === "user_breakdown") {
        return buildCategoryBarChart(
          table,
          "用户维度拆解",
          "用于观察不同用户群体的指标表现差异。",
          ["用户类型", "user_type", "segment", "is_new_user"],
        );
      }
      if (table.id === "region_breakdown") {
        return buildCategoryBarChart(
          table,
          "地区 / 城市拆解",
          "用于观察不同地区对指标变化的贡献。",
          ["地区", "城市", "city", "region", "province", "area"],
        );
      }
      if (table.id === "channel_breakdown") {
        return buildCategoryBarChart(
          table,
          "渠道来源拆解",
          "用于观察不同渠道来源下的指标表现。",
          ["渠道", "channel", "source", "utm_source"],
        );
      }
      if (table.id === "amount_summary") {
        return buildAmountMetrics(table);
      }
      if (table.id === "coupon_summary") {
        return buildCouponMetrics(table);
      }
      return null;
    })
    .filter((spec): spec is ChartSpec => Boolean(spec));
}

function buildOverallTrendChart(table: ExecutionResultTable): ChartSpec | null {
  const xKey = findColumn(table.columns, ["日期", "时间", "date", "time"]);
  const yKeys = table.columns.filter(
    (column) =>
      column !== xKey &&
      matchesColumn(column, [
        "记录数",
        "订单数",
        "金额总和",
        "count",
        "record_count",
        "order_count",
        "amount_sum",
        "gmv_sum",
      ]) &&
      table.rows.some((row) => toNumber(row[column]) !== null),
  );

  if (!xKey || !yKeys.length || !table.rows.length) {
    return null;
  }

  return {
    id: "overall_trend_chart",
    kind: "line",
    title: "整体趋势变化",
    description: "用于观察指标在时间维度上的变化趋势。",
    data: normalizeRows(table.rows, yKeys),
    xKey,
    yKeys,
  };
}

function buildCategoryBarChart(
  table: ExecutionResultTable,
  title: string,
  description: string,
  categoryKeywords: string[],
): ChartSpec | null {
  const xKey = findColumn(table.columns, categoryKeywords) ?? table.columns[0];
  const yKey =
    findColumn(table.columns, ["记录数", "用户数", "订单数", "金额总和", "count"]) ??
    table.columns.find((column) => column !== xKey && table.rows.some((row) => toNumber(row[column]) !== null));

  if (!xKey || !yKey || !table.rows.length) {
    return null;
  }

  return {
    id: `${table.id}_chart`,
    kind: "bar",
    title,
    description,
    data: normalizeRows(table.rows.slice(0, 12), [yKey]),
    xKey,
    yKeys: [yKey],
  };
}

function buildAmountMetrics(table: ExecutionResultTable): ChartSpec | null {
  const row = table.rows[0];
  if (!row) {
    return null;
  }

  const metricLabels = ["总金额", "平均金额", "最大值", "最小值"];
  const metrics = metricLabels
    .filter((label) => label in row)
    .map((label) => ({
      label,
      value: formatMetricValue(row[label]),
    }));

  if (!metrics.length) {
    return null;
  }

  return {
    id: "amount_summary_metrics",
    kind: "metric",
    title: "金额指标概览",
    description: "用于快速查看金额字段的基础统计情况。",
    metrics,
  };
}

function buildCouponMetrics(table: ExecutionResultTable): ChartSpec | null {
  const row = table.rows[0];
  if (!row) {
    return null;
  }

  const metricLabels = ["总记录数", "有优惠券字段记录数", "可能使用记录数", "可能使用率"];
  const metrics = metricLabels
    .filter((label) => label in row)
    .map((label) => ({
      label,
      value: formatMetricValue(row[label]),
    }));

  if (!metrics.length) {
    return null;
  }

  return {
    id: "coupon_summary_metrics",
    kind: "metric",
    title: "优惠券相关分析",
    description: "用于观察优惠券相关字段的基础统计表现。",
    metrics,
    note: "当前展示的是字段支持下的基础统计，领取口径和使用口径仍需结合业务定义进一步确认。",
  };
}

function normalizeRows(rows: Record<string, unknown>[], numericKeys: string[]) {
  return rows.map((row) => {
    const nextRow = { ...row };
    numericKeys.forEach((key) => {
      const value = toNumber(row[key]);
      if (value !== null) {
        nextRow[key] = value;
      }
    });
    return nextRow;
  });
}

function findColumn(columns: string[], keywords: string[]) {
  return columns.find((column) => matchesColumn(column, keywords));
}

function matchesColumn(column: string, keywords: string[]) {
  const normalizedColumn = normalizeText(column);
  return keywords.some((keyword) => normalizedColumn.includes(normalizeText(keyword)));
}

function normalizeText(value: string) {
  return value.toLowerCase().replace(/\s+/g, "_").replace(/\//g, "_");
}

function toNumber(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function formatMetricValue(value: unknown) {
  const numericValue = toNumber(value);
  if (numericValue === null) {
    return value === null || value === undefined || value === "" ? "空" : String(value);
  }

  return numericValue.toLocaleString("zh-CN", {
    maximumFractionDigits: 4,
  });
}
