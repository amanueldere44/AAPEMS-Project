
export default function StatCard({
  label,
  value,
  note,
  icon: Icon,
  tone = 'navy',
}) {
  const tones = {
    navy: {
      background: 'var(--asems-stat-navy-bg)',
      color: 'var(--asems-stat-navy-text)',
    },
    gold: {
      background: 'var(--asems-stat-gold-bg)',
      color: 'var(--asems-stat-gold-text)',
    },
    teal: {
      background: 'var(--asems-stat-teal-bg)',
      color: 'var(--asems-stat-teal-text)',
    },
    slate: {
      background: 'var(--asems-stat-slate-bg)',
      color: 'var(--asems-stat-slate-text)',
    },
  };

  const iconTone = tones[tone] || tones.navy;

  return (
    <article className="asems-stat-card min-w-0 p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="asems-muted text-sm font-medium">
            {label}
          </p>

          <p className="asems-text-primary mt-2 text-3xl font-semibold tracking-tight">
            {value ?? '—'}
          </p>
        </div>

        {Icon && (
          <span
            className="asems-stat-icon rounded-xl p-3"
            style={{
              background: iconTone.background,
              color: iconTone.color,
            }}
          >
            <Icon size={20} aria-hidden="true" />
          </span>
        )}
      </div>

      {note && (
        <p className="asems-muted mt-3 text-xs leading-5">
          {note}
        </p>
      )}
    </article>
  );
}
