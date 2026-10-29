import { AlertCircle, CheckCircle2, ChevronLeft, ChevronRight, Inbox } from 'lucide-react';

// Shared loading, error, empty and success states plus a status pill and pagination.

export function formatDate(value) {
  if (!value) return '—';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? String(value).slice(0, 10) : date.toLocaleDateString();
}

export function titleCase(value = '') {
  return String(value).replaceAll('_', ' ').replace(/\b\w/g, (letter) => letter.toUpperCase());
}

export function LoadingBlock({ label = 'Loading…' }) {
  return (
    <div className="flex items-center gap-3 p-6 text-sm text-slate-600" role="status" aria-live="polite">
      <span className="h-5 w-5 animate-spin rounded-full border-2 border-slate-300 border-t-navy-900" aria-hidden="true" />
      {label}
    </div>
  );
}

export function ErrorBanner({ message, onRetry }) {
  if (!message) return null;
  return (
    <div className="flex items-start gap-3 rounded-lg border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800" role="alert">
      <AlertCircle size={18} className="mt-0.5 shrink-0" aria-hidden="true" />
      <div className="flex-1">{message}</div>
      {onRetry && (
        <button type="button" onClick={onRetry} className="font-medium underline">
          Try again
        </button>
      )}
    </div>
  );
}

export function SuccessBanner({ message }) {
  if (!message) return null;
  return (
    <div className="flex items-start gap-3 rounded-lg border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800" role="status">
      <CheckCircle2 size={18} className="mt-0.5 shrink-0" aria-hidden="true" />
      <div>{message}</div>
    </div>
  );
}

export function EmptyBlock({ title, children }) {
  return (
    <div className="flex flex-col items-center gap-2 p-10 text-center text-slate-500">
      <Inbox size={28} aria-hidden="true" />
      <div className="font-medium text-slate-700">{title}</div>
      {children && <div className="max-w-md text-sm">{children}</div>}
    </div>
  );
}

const PILL = {
  draft: 'status-gray', retired: 'status-gray', submitted: 'status-green', published: 'status-green',
  active: 'status-green', closed: 'status-gray', upcoming: 'status-blue', pending: 'status-amber',
  reviewed: 'status-blue', archived: 'status-green',
};

export function StatusPill({ status }) {
  return <span className={`status-pill ${PILL[status] || 'status-gray'}`}>{titleCase(status)}</span>;
}

export function Pagination({ page, pageSize, total, onChange }) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  if (total <= pageSize) return null;
  return (
    <nav className="flex items-center justify-between border-t border-slate-200 px-4 py-3 text-sm text-slate-600" aria-label="Pagination">
      <span>Page {page} of {pages} · {total} records</span>
      <div className="flex gap-2">
        <button type="button" className="icon-button" disabled={page <= 1} onClick={() => onChange(page - 1)} aria-label="Previous page">
          <ChevronLeft size={18} />
        </button>
        <button type="button" className="icon-button" disabled={page >= pages} onClick={() => onChange(page + 1)} aria-label="Next page">
          <ChevronRight size={18} />
        </button>
      </div>
    </nav>
  );
}