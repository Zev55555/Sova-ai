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
    <section className="mt-6 rounded-[24px] border border-white/10 bg-[#0d0f14]/90 p-5 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)] backdrop-blur-xl transition-colors hover:border-cyan-300/16">
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
        <div className="mt-5 rounded-[22px] border border-white/8 bg-white/[0.04] p-5">
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
              <ReportSectionBlock
                content={section.content}
                heading={section.heading}
                key={`${section.heading}-${index}`}
                label={`Section ${String(index + 1).padStart(2, "0")}`}
              />
            ))}
          </div>

          <section className="mt-5 rounded-[20px] border border-amber-300/18 bg-amber-300/[0.06] p-5">
            <h4 className="text-base font-semibold text-amber-800">报告说明</h4>
            <p className="mt-2 text-sm leading-7 text-amber-100/72">
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

type ReportContentBlock =
  | { kind: "paragraph"; text: string }
  | { kind: "subheading"; text: string }
  | { kind: "list"; items: string[] };

function ReportSectionBlock({
  content,
  heading,
  label,
}: {
  content: string;
  heading: string;
  label: string;
}) {
  return (
    <section className="rounded-[22px] border border-white/10 bg-white/[0.035] p-5 transition-colors hover:border-cyan-300/16 sm:p-6">
      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-accent/82">
        {label}
      </p>
      <h4 className="mt-2 text-lg font-semibold leading-7 text-ink">
        {heading}
      </h4>
      <FormattedReportContent content={content} heading={heading} />
    </section>
  );
}

function FormattedReportContent({
  content,
  heading,
}: {
  content: string;
  heading: string;
}) {
  const blocks = parseReportContentReadable(content, heading);

  if (!blocks.length) {
    return null;
  }

  return (
    <div className="mt-5 max-w-4xl space-y-4 text-sm leading-7 text-ink/72">
      {blocks.map((block, index) => {
        if (block.kind === "subheading") {
          return (
            <h5
              className="rounded-full border border-cyan-300/14 bg-cyan-300/[0.055] px-3 py-1.5 text-sm font-semibold text-cyan-100/88"
              key={`${block.kind}-${index}-${block.text}`}
            >
              {block.text}
            </h5>
          );
        }

        if (block.kind === "list") {
          return (
            <ul
              className="space-y-3 rounded-[18px] border border-white/[0.06] bg-white/[0.025] p-4"
              key={`${block.kind}-${index}`}
            >
              {block.items.map((item) => {
                const parsed = parseListItemReadable(item);

                return (
                  <li className="grid grid-cols-[auto_minmax(0,1fr)] gap-3 leading-7 text-ink/72" key={item}>
                    <span className="pt-0.5 text-xs font-semibold text-accent/78">
                      {parsed.marker}
                    </span>
                    <span>{parsed.text}</span>
                  </li>
                );
              })}
            </ul>
          );
        }

        return (
          <p className="leading-7 text-ink/72" key={`${block.kind}-${index}`}>
            {block.text}
          </p>
        );
      })}
    </div>
  );
}

function parseReportContent(content: string, heading: string): ReportContentBlock[] {
  const lines = normalizeReportLines(content)
    .filter((line, index) => !(index === 0 && isSameHeading(line, heading)));
  const blocks: ReportContentBlock[] = [];
  let listItems: string[] = [];

  function flushList() {
    if (listItems.length) {
      blocks.push({ kind: "list", items: listItems });
      listItems = [];
    }
  }

  lines.forEach((line) => {
    if (isReportListItem(line)) {
      listItems.push(line);
      return;
    }

    flushList();

    if (isReportSubheading(line)) {
      blocks.push({ kind: "subheading", text: line });
      return;
    }

    blocks.push({ kind: "paragraph", text: line });
  });

  flushList();

  return blocks;
}

function normalizeReportLines(content: string) {
  const normalized = content
    .replace(/\r\n/g, "\n")
    .replace(/([。；;])\s+(?=(?:\d+[）.)]|[一二三四五六七八九十]+、|【))/g, "$1\n")
    .replace(/\s+(?=\d+[）.)])/g, "\n")
    .replace(/\s+(?=【[^】]+】)/g, "\n");

  return normalized
    .split(/\n+/)
    .flatMap(splitInlineReportItems)
    .map((line) => line.trim())
    .filter(Boolean);
}

function splitInlineReportItems(line: string) {
  const markerPattern = /(\d+[）.)]|[一二三四五六七八九十]+、|【[^】]+】)/g;
  const matches = Array.from(line.matchAll(markerPattern));

  if (matches.length <= 1 || matches[0].index === undefined) {
    return [line];
  }

  const chunks: string[] = [];
  const firstIndex = matches[0].index;

  if (firstIndex > 0) {
    chunks.push(line.slice(0, firstIndex));
  }

  matches.forEach((match, index) => {
    const start = match.index ?? 0;
    const end = matches[index + 1]?.index ?? line.length;
    chunks.push(line.slice(start, end));
  });

  return chunks;
}

function isReportListItem(line: string) {
  return /^(?:\d+[）.)]|[一二三四五六七八九十]+、|[-•])\s*/.test(line);
}

function isReportSubheading(line: string) {
  return /^【[^】]+】/.test(line);
}

function isSameHeading(line: string, heading: string) {
  return line.replace(/\s/g, "") === heading.replace(/\s/g, "");
}

function parseReportContentSafe(
  content: string,
  heading: string,
): ReportContentBlock[] {
  const lines = removeDuplicateLeadingHeadingsSafe(
    normalizeReportLinesSafe(content),
    heading,
  );
  const blocks: ReportContentBlock[] = [];
  let listItems: string[] = [];

  function flushList() {
    if (listItems.length) {
      blocks.push({ kind: "list", items: listItems });
      listItems = [];
    }
  }

  lines.forEach((line) => {
    if (isReportListItemSafe(line)) {
      listItems.push(line);
      return;
    }

    flushList();

    if (isReportSubheadingSafe(line)) {
      blocks.push({ kind: "subheading", text: line });
      return;
    }

    blocks.push({ kind: "paragraph", text: line });
  });

  flushList();

  return blocks;
}

function normalizeReportLinesSafe(content: string) {
  return content
    .replace(/\r\n/g, "\n")
    .split(/\n+/)
    .flatMap(splitInlineReportItemsSafe)
    .map((line) => line.trim())
    .filter(Boolean);
}

function splitInlineReportItemsSafe(line: string) {
  const markerPattern =
    /(?:^|\s)((?:\d+[）)]|\d+\.(?=\s)|第[\u4e00-\u5341]+[，,、]|[\u4e00-\u5341]+、|[-•]\s+))/g;
  const matches = Array.from(line.matchAll(markerPattern));

  if (matches.length <= 1 || matches[0].index === undefined) {
    return [line];
  }

  const chunks: string[] = [];
  const firstIndex = matches[0].index + matches[0][0].indexOf(matches[0][1]);

  if (firstIndex > 0) {
    chunks.push(line.slice(0, firstIndex));
  }

  matches.forEach((match, index) => {
    const start = (match.index ?? 0) + match[0].indexOf(match[1]);
    const end = matches[index + 1]?.index ?? line.length;
    chunks.push(line.slice(start, end));
  });

  return chunks;
}

function isReportListItemSafe(line: string) {
  return /^(?:\d+[）)]|\d+\s*\.(?=\s)|第[\u4e00-\u5341]+[，,、]|[\u4e00-\u5341]+、|[-•]\s+)/.test(
    line,
  );
}

function isReportSubheadingSafe(line: string) {
  return /^【[^】]+】/.test(line);
}

function parseListItem(item: string) {
  const match = item.match(
    /^(\d+[）)]|\d+\s*\.|第[\u4e00-\u5341]+[，,、]|[\u4e00-\u5341]+、|[-•])\s*(.*)$/,
  );

  if (!match) {
    return { marker: "•", text: item };
  }

  return {
    marker: match[1],
    text: match[2] || item,
  };
}

function removeDuplicateLeadingHeadingsSafe(lines: string[], heading: string) {
  const nextLines = [...lines];

  while (nextLines.length && isSameHeadingSafe(nextLines[0], heading)) {
    nextLines.shift();
  }

  return nextLines;
}

function isSameHeadingSafe(line: string, heading: string) {
  const normalizedLine = normalizeHeadingTextSafe(line);
  const normalizedHeading = normalizeHeadingTextSafe(heading);

  return (
    normalizedLine === normalizedHeading ||
    normalizedLine.endsWith(normalizedHeading) ||
    normalizedHeading.endsWith(normalizedLine)
  );
}

function normalizeHeadingTextSafe(value: string) {
  return value
    .replace(/\s/g, "")
    .replace(/^【(.+)】$/, "$1")
    .replace(/^[\u4e00-\u5341]+[、.．]/, "")
    .replace(/^第[\u4e00-\u5341]+[章节節]?[，,、]/, "")
    .replace(/[：:。.]$/, "");
}

function parseReportContentReadable(
  content: string,
  heading: string,
): ReportContentBlock[] {
  const lines = removeDuplicateLeadingHeadingsReadable(
    normalizeReportLinesReadable(content),
    heading,
  );
  const blocks: ReportContentBlock[] = [];
  let listItems: string[] = [];

  function flushList() {
    if (listItems.length) {
      blocks.push({ kind: "list", items: listItems });
      listItems = [];
    }
  }

  lines.forEach((line) => {
    if (isReportListItemReadable(line)) {
      listItems.push(line);
      return;
    }

    flushList();

    if (/^【[^】]+】/.test(line)) {
      blocks.push({ kind: "subheading", text: line });
      return;
    }

    blocks.push({ kind: "paragraph", text: line });
  });

  flushList();

  return blocks;
}

function normalizeReportLinesReadable(content: string) {
  return content
    .replace(/\r\n/g, "\n")
    .split(/\n+/)
    .flatMap(splitInlineNumberedItemsReadable)
    .map((line) => line.trim())
    .filter(Boolean);
}

function splitInlineNumberedItemsReadable(line: string) {
  const markerPattern =
    /(?:^|\s)((?:\d+[）)]|\d+\.(?=\s)|第[\u4e00-\u5341]+[，,]))/g;
  const matches = Array.from(line.matchAll(markerPattern));

  if (matches.length <= 1 || matches[0].index === undefined) {
    return [line];
  }

  const chunks: string[] = [];
  const firstIndex = matches[0].index + matches[0][0].indexOf(matches[0][1]);

  if (firstIndex > 0) {
    chunks.push(line.slice(0, firstIndex));
  }

  matches.forEach((match, index) => {
    const start = (match.index ?? 0) + match[0].indexOf(match[1]);
    const end = matches[index + 1]?.index ?? line.length;
    chunks.push(line.slice(start, end));
  });

  return chunks;
}

function isReportListItemReadable(line: string) {
  return /^(?:\d+[）)]|\d+\s*\.(?=\s)|第[\u4e00-\u5341]+[，,])/.test(
    line,
  );
}

function parseListItemReadable(item: string) {
  const match = item.match(
    /^(\d+[）)]|\d+\s*\.|第[\u4e00-\u5341]+[，,])\s*(.*)$/,
  );

  if (!match) {
    return { marker: "", text: item };
  }

  return {
    marker: match[1],
    text: match[2] || item,
  };
}

function removeDuplicateLeadingHeadingsReadable(
  lines: string[],
  heading: string,
) {
  const nextLines = [...lines];

  while (nextLines.length && isSameHeadingReadable(nextLines[0], heading)) {
    nextLines.shift();
  }

  return nextLines;
}

function isSameHeadingReadable(line: string, heading: string) {
  const normalizedLine = normalizeHeadingTextReadable(line);
  const normalizedHeading = normalizeHeadingTextReadable(heading);

  return (
    normalizedLine === normalizedHeading ||
    normalizedLine.endsWith(normalizedHeading) ||
    normalizedHeading.endsWith(normalizedLine)
  );
}

function normalizeHeadingTextReadable(value: string) {
  return value
    .replace(/\s/g, "")
    .replace(/^【(.+)】$/, "$1")
    .replace(/^[\u4e00-\u5341]+[、.．]/, "")
    .replace(/^第[\u4e00-\u5341]+[章节節]?[，,、]/, "")
    .replace(/[：:。.]$/, "");
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
