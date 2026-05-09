import type { ReadinessStage, ReadinessState } from "@/lib/readiness";

const stages: ReadinessStage[] = [
  "问题识别",
  "指标口径",
  "对比周期",
  "分析维度",
  "数据准备",
];

type ReadinessPanelProps = {
  readiness: ReadinessState;
};

export function ReadinessPanel({ readiness }: ReadinessPanelProps) {
  const currentIndex = stages.indexOf(readiness.current_stage);
  const progressWidth = `${Math.max(12, Math.min(readiness.progress, 100))}%`;

  return (
    <aside className="lg:sticky lg:top-6">
      <section className="rounded-lg border border-ink/10 bg-ink p-5 text-surface shadow-soft">
        <div className="mb-6">
          <p className="text-sm text-surface/62">分析就绪面板</p>
          <h2 className="mt-1 text-xl font-semibold tracking-normal">
            分析就绪进度
          </h2>
          <p className="mt-3 text-sm leading-6 text-surface/72">
            该进度表示：当前业务问题是否已经足够清晰，可以进入数据分析阶段。
          </p>
        </div>

        <div>
          <div className="h-3 overflow-hidden rounded-full bg-surface/12">
            <div
              className="h-full rounded-full bg-accent transition-all duration-300"
              style={{ width: progressWidth }}
            />
          </div>

          <div className="mt-4 grid grid-cols-5 gap-2 text-center text-[11px] leading-4 sm:text-xs">
            {stages.map((stage, index) => {
              const isDone = index < currentIndex;
              const isCurrent = index === currentIndex;
              return (
                <div
                  className={
                    isCurrent
                      ? "text-accent"
                      : isDone
                        ? "text-surface"
                        : "text-surface/42"
                  }
                  key={stage}
                >
                  <div
                    className={
                      isDone
                        ? "mx-auto mb-2 flex h-6 w-6 items-center justify-center rounded-full bg-accent text-xs font-bold text-ink"
                        : isCurrent
                          ? "mx-auto mb-2 flex h-6 w-6 items-center justify-center rounded-full border border-accent text-xs font-bold"
                          : "mx-auto mb-2 flex h-6 w-6 items-center justify-center rounded-full border border-surface/18 text-xs"
                    }
                  >
                    {isDone ? "✓" : isCurrent ? "●" : "○"}
                  </div>
                  <span>{stage}</span>
                </div>
              );
            })}
          </div>
        </div>

        <PanelBlock title="当前状态">
          <p className="text-sm leading-6 text-surface/82">
            {readiness.status_text}
          </p>
        </PanelBlock>

        <PanelBlock title="已确认信息">
          <InfoList items={readiness.confirmed_info} emptyText="暂无已确认信息" />
        </PanelBlock>

        <PanelBlock title="待确认信息">
          <InfoList items={readiness.missing_info} emptyText="暂无待确认信息" />
        </PanelBlock>

        <PanelBlock title="下一步问题">
          <p className="rounded-md border border-accent/40 bg-accent/12 p-3 text-sm leading-6 text-surface">
            {readiness.next_question}
          </p>
        </PanelBlock>
      </section>
    </aside>
  );
}

function PanelBlock({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="mt-6 border-t border-surface/10 pt-5">
      <h3 className="text-sm font-semibold text-surface">{title}</h3>
      <div className="mt-3">{children}</div>
    </div>
  );
}

function InfoList({
  items,
  emptyText,
}: {
  items: string[];
  emptyText: string;
}) {
  if (items.length === 0) {
    return <p className="text-sm text-surface/55">{emptyText}</p>;
  }

  return (
    <ul className="space-y-2">
      {items.map((item) => (
        <li className="flex gap-2 text-sm leading-6 text-surface/78" key={item}>
          <span className="mt-[0.55rem] h-1.5 w-1.5 shrink-0 rounded-full bg-accent" />
          <span>{item}</span>
        </li>
      ))}
    </ul>
  );
}
