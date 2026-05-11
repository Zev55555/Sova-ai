"use client";

import { useEffect, useState } from "react";
import { formatReportDraft, type ReportDraft } from "@/lib/report-draft";

type ReportDraftSectionProps = {
  reportDraft: ReportDraft | null;
  reportError: string;
  reportNotice: string;
  isGeneratingReport: boolean;
  onGenerateReport: () => void;
};

export function ReportDraftSection({
  reportDraft,
  reportError,
  reportNotice,
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
    <section className="mt-6 rounded-2xl border border-white/8 bg-panel/88 p-5">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-sm font-medium text-accent">证据输出区</p>
          <h3 className="mt-1 text-lg font-semibold text-ink">报告草稿</h3>
          <p className="mt-3 max-w-3xl text-sm leading-6 text-ink/66">
            系统会基于当前业务澄清、指标计算结果和证据链生成一份可继续编辑的分析报告草稿。
          </p>
        </div>
        <button
          className="rounded-lg bg-accent px-5 py-3 text-sm font-semibold text-white transition hover:bg-accent/85 focus:outline-none focus:ring-4 focus:ring-accent/18 disabled:cursor-not-allowed disabled:bg-white/12 disabled:text-white/40"
          disabled={isGeneratingReport}
          onClick={onGenerateReport}
          type="button"
        >
          {isGeneratingReport ? "正在生成报告草稿……" : "生成报告草稿"}
        </button>
      </div>

      <p className="mt-4 rounded-md border border-ink/10 bg-surface/70 px-4 py-3 text-sm leading-6 text-ink/62">
        当前报告为可编辑草稿，适合用于整理分析思路。请结合业务背景和更多数据继续校正。
      </p>

      {reportNotice ? (
        <p className="mt-4 rounded-md border border-accent/20 bg-accent/10 px-4 py-3 text-sm font-medium text-accent">
          {reportNotice}
        </p>
      ) : null}

      {reportError ? (
        <p className="mt-4 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-700">
          {reportError}
        </p>
      ) : null}

      {reportDraft ? (
        <div className="mt-5 rounded-xl border border-white/8 bg-white/[0.04] p-5">
          <div className="mb-4 rounded-md border border-accent/20 bg-accent/10 px-4 py-3 text-sm font-medium text-accent">
            报告草稿已生成，可继续编辑
          </div>
          <div className="flex flex-col gap-3 border-b border-ink/10 pb-4 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <h3 className="text-xl font-semibold text-ink">
                {reportDraft.title}
              </h3>
              <p className="mt-2 text-sm leading-6 text-ink/58">
                这是最终输出预览，不改变报告内容，只优化章节阅读层级。
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

          <div className="mt-5 max-h-[58vh] space-y-5 overflow-y-auto pr-1">
            {reportDraft.sections.map((section, index) => (
              <section
                className="rounded-xl border border-white/8 bg-white/[0.03] p-4"
                key={section.heading}
              >
                <p className="text-xs font-semibold uppercase tracking-wide text-accent">
                  {getReportSectionLabel(index)}
                </p>
                <h4 className="mt-1 text-base font-semibold text-ink">
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
      ) : (
        <p className="mt-4 rounded-lg border border-dashed border-ink/12 bg-ink/[0.02] px-4 py-4 text-sm leading-6 text-ink/46">
          生成报告草稿后，将展示可编辑的分析报告。
        </p>
      )}
    </section>
  );
}

function getReportSectionLabel(index: number) {
  const labels = [
    "一、分析背景",
    "二、当前已确认信息",
    "三、数据与字段情况",
    "四、初步分析发现",
    "五、证据链摘要",
    "六、可能原因",
    "七、当前限制",
    "八、建议下一步验证",
  ];

  return labels[index] ?? `章节 ${index + 1}`;
}
