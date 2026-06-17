/**
 * Compact metric strip for the role dashboards. Purely presentational — the
 * page computes the figures for the selected cycle and passes them in.
 */
export function SummaryCards({
  title,
  cards,
}: {
  title: string;
  cards: { label: string; value: string; hint?: string }[];
}) {
  return (
    <section className="space-y-3">
      <h2 className="text-lg font-semibold">{title}</h2>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {cards.map((c) => (
          <div key={c.label} className="rounded-lg border bg-card p-4">
            <p className="text-2xl font-semibold tracking-tight">{c.value}</p>
            <p className="text-xs text-muted-foreground">{c.label}</p>
            {c.hint && <p className="mt-0.5 text-[11px] text-muted-foreground">{c.hint}</p>}
          </div>
        ))}
      </div>
    </section>
  );
}
