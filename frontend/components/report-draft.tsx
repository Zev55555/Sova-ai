"use client";

import { useEffect, useState } from "react";
import { formatReportDraft, type ReportDraft } from "@/lib/report-draft";

type ReportDraftSectionProps = {
  reportDraft: ReportDraft | null;
  reportError: string;
  isGeneratingReport: boolean;
  onGenerateReport: () => void;
};

export function ReportDraftSection({
  reportDraft,
  reportError,
  isGeneratingReport,
  onGenerateReport,
}: ReportDraftSectionProps) {
  const [copyMessage, setCopyMessage] = useState("");

  useEffect(() => {
    setCopyMessage("");
  }, [reportDraft]);

  async function handleCopyReport() {
    if (!reportDraft) {
      return;
    }

    try {
      await navigator.clipboard.writeText(formatReportDraft(reportDraft));
      setCopyMessage("报告内容已复制，可以粘贴到文档中继续修改。");
    } catch {
      setCopyMessage("复制失败，请手动选择报告内容复制。");
    }
  }

  return (
    <section className="mt-6 rounded-lg border border-accent/25 bg-white/82 p-5 shadow-soft">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-sm font-medium text-accent">报告草稿</p>
          <p className="mt-3 max-w-3xl text-sm leading-6 text-ink/66">
            系统会基于当前业务澄清结果、分析计划、执行结果和证据链生成一份可继续修改的分析报告草稿。
          </p>
        </div>
        <button
          className="rounded-lg bg-ink px-5 py-3 text-sm font-semibold text-surface transition hover:bg-accent focus:outline-none focus:ring-4 focus:ring-accent/18 disabled:cursor-not-allowed disabled:bg-ink/35"
          disabled={isGeneratingReport}
          onClick={onGenerateReport}
          type="button"
        >
          {isGeneratingReport ? "正在生成报告草稿" : "生成报告草稿"}
        </button>
      </div>

      <p className="mt-4 rounded-md border border-ink/10 bg-surface/70 px-4 py-3 text-sm leading-6 text-ink/62">
        当前报告为规则版草稿，适合用于整理分析思路。后续可接入真实 LLM 提升表达质量。
      </p>

      {reportError ? (
        <p className="mt-4 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-700">
          {reportError}
        </p>
      ) : null}

      {reportDraft ? (
        <div className="mt-5 rounded-lg border border-ink/10 bg-white p-5">
          <div className="flex flex-col gap-3 border-b border-ink/10 pb-4 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <h3 className="text-xl font-semibold text-ink">
                {reportDraft.title}
              </h3>
              <p className="mt-2 text-sm leading-6 text-ink/58">
                这是一份可继续编辑的报告预览，建议结合业务背景和更多数据继续校正。
              </p>
            </div>
            <button
              className="rounded-lg border border-accent/30 bg-accent/10 px-4 py-2 text-sm font-semibold text-accent transition hover:border-accent hover:bg-accent/15 focus:outline-none focus:ring-4 focus:ring-accent/18"
              onClick={handleCopyReport}
              type="button"
            >
              复制报告内容
            </button>
          </div>

          {copyMessage ? (
            <p className="mt-4 rounded-md border border-accent/20 bg-accent/10 px-4 py-3 text-sm font-medium text-accent">
              {copyMessage}
            </p>
          ) : null}

          <div className="mt-5 space-y-5">
            {reportDraft.sections.map((section) => (
              <section
                className="rounded-lg border border-ink/8 bg-surface/60 p-4"
                key={section.heading}
              >
                <h4 className="text-base font-semibold text-ink">
                  {section.heading}
                </h4>
                <p className="mt-3 whitespace-pre-line text-sm leading-7 text-ink/70">
                  {section.content}
                </p>
              </section>
            ))}
          </div>

          <section className="mt-5 rounded-lg border border-amber-200 bg-amber-50 p-4">
            <h4 className="text-base font-semibold text-amber-800">报告说明</h4>
            <p className="mt-2 text-sm leading-6 text-amber-800/80">
              {reportDraft.disclaimer}
            </p>
          </section>
        </div>
      ) : null}
    </section>
  );
}
