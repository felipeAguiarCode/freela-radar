import type { DailySummary } from '../types';

interface Props {
  summary: DailySummary;
}

interface Cell {
  label: string;
  value: string;
  delta: string;
}

export function DailySummaryCard({ summary }: Props) {
  const cells: Cell[] = [
    { label: 'Encontradas', value: String(summary.found), delta: `+${summary.deltas.found} hoje` },
    { label: 'Analisadas', value: String(summary.analyzed), delta: `+${summary.deltas.analyzed} hoje` },
    { label: 'Propostas', value: String(summary.proposals), delta: `+${summary.deltas.proposals} hoje` },
    { label: 'Conversão', value: `${summary.conversion}%`, delta: `+${summary.deltas.conversion}%` },
  ];
  return (
    <section className="bg-card rounded-2xl border border-border p-5 shadow-card">
      <h3 className="text-[15px] font-semibold text-primary mb-4">Resumo do dia</h3>
      <div className="grid grid-cols-4 divide-x divide-border">
        {cells.map((c, i) => (
          <div key={c.label} className={`px-3 ${i === 0 ? 'pl-0' : ''} ${i === cells.length - 1 ? 'pr-0' : ''}`}>
            <div className="text-[12px] text-secondary">{c.label}</div>
            <div className="text-[24px] font-bold text-primary tabular-nums leading-tight mt-1">{c.value}</div>
            <div className="text-[12px] font-medium text-[#16a34a] mt-1">{c.delta}</div>
          </div>
        ))}
      </div>
    </section>
  );
}
