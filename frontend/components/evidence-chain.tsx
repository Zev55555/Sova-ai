"use client";

import type { ReactNode } from "react";
import type { EvidenceResult } from "@/lib/evidence-chain";

type EvidenceChainSectionProps = {
  evidenceResult: EvidenceResult | null;
  evidenceError: string;
  isGeneratingEvidence: boolean;
  onGenerateEvidence: () => void;
};

const confidenceToneMap = {
  高: "border-accent/25 bg-accent/10 text-accent",
  中: "border-amber-200 bg-amber-50 text-amber-700",
  低: "border-red-200 bg-red-50 text-red-700",
};

const tableLabelMap: Record<string, string> = {
  overall_trend: "整体趋势分析",
  user_breakdown: "用户维度分析",
  region_breakdown: "地区 / 城市分析",
  channel_breakdown: "渠道分析",
  amount_summary: "金额分析",
  coupon_summary: "优惠券相关分析",
};

export function EvidenceChainSection({
  evidenceResult,
  evidenceError,
  isGeneratingEvidence,
  onGenerateEvidence,
}: EvidenceChainSectionProps) {
  return (
    <section className="mt-6 rounded-lg border border-accent/25 bg-white/82 p-5 shadow-soft">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-sm font-medium text-accent">证据链</p>
          <p className="mt-3 max-w-3xl text-sm leading-6 text-ink/66">
            系统会把结果表和图表转化为可追踪的分析发现。以下内容为当前数据支持的初步判断，不代表最终因果结论。
          </p>
        </div>
        <button
          className="rounded-lg bg-ink px-5 py-3 text-sm font-semibold text-surface transition hover:bg-accent focus:outline-none focus:ring-4 focus:ring-accent/18 disabled:cursor-not-allowed disabled:bg-ink/35"
          disabled={isGeneratingEvidence}
          onClick={onGenerateEvidence}
          type="button"
        >
          {isGeneratingEvidence ? "正在生成证据链" : "生成证据链"}
        </button>
      </div>

      {evidenceError ? (
        <p className="mt-4 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-700">
          {evidenceError}
        </p>
      ) : null}

      {evidenceResult ? (
        <div className="mt-5 space-y-4">
          <section className="rounded-lg border border-ink/10 bg-surface/70 p-4">
            <h3 className="text-base font-semibold text-ink">初步摘要</h3>
            <p className="mt-2 text-sm leading-6 text-ink/66">
              {evidenceResult.summary}
            </p>
          </section>

          {evidenceResult.evidence_chains.length ? (
            <div className="space-y-4">
              {evidenceResult.evidence_chains.map((chain) => (
                <article
                  className="rounded-lg border border-ink/10 bg-white p-4"
                  key={chain.id}
                >
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                    <h3 className="text-base font-semibold text-ink">
                      {chain.title}
                    </h3>
                    <span
                      className={`inline-flex w-fit rounded-full border px-3 py-1 text-xs font-semibold ${confidenceToneMap[chain.confidence_level]}`}
                    >
                      可信程度：{chain.confidence_level}
                    </span>
                  </div>

                  <EvidenceBlock title="初步发现">
                    <p>{chain.finding}</p>
                  </EvidenceBlock>

                  <EvidenceBlock title="数据证据">
                    <ul className="space-y-2">
                      {chain.evidence.map((item) => (
                        <li className="rounded-md bg-ink/[0.04] px-3 py-2" key={item}>
                          {item}
                        </li>
                      ))}
                    </ul>
                  </EvidenceBlock>

                  <EvidenceBlock title="相关结果表 / 图表">
                    <div className="flex flex-wrap gap-2">
                      {chain.related_table_ids.map((tableId) => (
                        <span
                          className="rounded-full border border-ink/10 bg-surface px-3 py-1 text-xs font-medium text-ink/62"
                          key={tableId}
                        >
                          {tableLabelMap[tableId] ?? "相关结果表"}
                        </span>
                      ))}
                      <span className="rounded-full border border-accent/25 bg-accent/10 px-3 py-1 text-xs font-medium text-accent">
                        {chain.related_chart ?? "暂无关联图表"}
                      </span>
                    </div>
                  </EvidenceBlock>

                  <EvidenceBlock title="下一步验证建议">
                    <p>{chain.suggested_next_check}</p>
                  </EvidenceBlock>
                </article>
              ))}
            </div>
          ) : (
            <p className="rounded-md border border-ink/10 bg-white px-4 py-3 text-sm leading-6 text-ink/62">
              当前结果暂不足以生成证据链，请补充更多字段或重新执行分析。
            </p>
          )}

          {evidenceResult.limitations.length ? (
            <section className="rounded-lg border border-ink/10 bg-white p-4">
              <h3 className="text-base font-semibold text-ink">当前限制</h3>
              <ul className="mt-3 space-y-2 text-sm leading-6 text-ink/66">
                {evidenceResult.limitations.map((item) => (
                  <li className="rounded-md bg-ink/[0.04] px-3 py-2" key={item}>
                    {item}
                  </li>
                ))}
              </ul>
            </section>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}

function EvidenceBlock({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <section className="mt-4 text-sm leading-6 text-ink/66">
      <h4 className="mb-2 text-sm font-semibold text-ink">{title}</h4>
      {children}
    </section>
  );
}
