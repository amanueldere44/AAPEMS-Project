// Small shared class names and helpers for the follow-up workflow pages.
export const btn =
  'inline-flex items-center justify-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50';
export const field = 'h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-800';
export const area = 'w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800';
export const label = 'block text-sm font-medium text-slate-700';

export function fmtDate(value) {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}

export function Restricted({ title = 'Access restricted', children }) {
  return (
    <section className="rounded-2xl border border-rose-100 bg-white p-8">
      <h1 className="text-xl font-semibold text-slate-900">{title}</h1>
      <p className="mt-2 text-sm text-slate-600">{children}</p>
    </section>
  );
}

export function Alert({ tone = 'error', children }) {
  if (!children) return null;
  const styles =
    tone === 'error'
      ? 'border-rose-200 bg-rose-50 text-rose-800'
      : 'border-emerald-200 bg-emerald-50 text-emerald-800';
  return (
    <p role={tone === 'error' ? 'alert' : 'status'} className={`rounded-lg border px-3 py-2 text-sm ${styles}`}>
      {children}
    </p>
  );
}

export function Pager({ page, pageSize, total, onPage }) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  return (
    <div className="flex items-center justify-between border-t border-slate-100 px-4 py-3 text-xs text-slate-500">
      <span>
        {total} record{total === 1 ? '' : 's'} · page {page} of {pages}
      </span>
      <span className="flex gap-2">
        <button type="button" className={btn} disabled={page <= 1} onClick={() => onPage(page - 1)}>
          Previous
        </button>
        <button type="button" className={btn} disabled={page >= pages} onClick={() => onPage(page + 1)}>
          Next
        </button>
      </span>
    </div>
  );
}