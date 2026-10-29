import { useCallback, useEffect, useState } from 'react';
import { ChevronDown, ChevronUp, RefreshCw, Search } from 'lucide-react';
import { apiRequest } from '../services/api.js';
import {
  EmptyBlock,
  ErrorBanner,
  LoadingBlock,
  Pagination,
  titleCase,
} from './StateBlocks.jsx';

const PAGE_SIZE = 25;

const SECONDARY_BUTTON =
  'inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-60';

function formatDateTime(value) {
  if (!value) return '—';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? String(value) : date.toLocaleString();
}

function DetailsView({ details }) {
  if (details === null || details === undefined) {
    return <p className="text-xs text-slate-500">No extra details were recorded.</p>;
  }
  return (
    <pre className="max-h-64 overflow-auto rounded-lg bg-slate-900 p-3 text-xs leading-5 text-slate-100">
      {typeof details === 'string' ? details : JSON.stringify(details, null, 2)}
    </pre>
  );
}

export default function AuditTrailPage() {
  const [items, setItems] = useState([]);
  const [total, setTotal] = useState(0);
  const [actions, setActions] = useState([]);
  const [page, setPage] = useState(1);
  const [action, setAction] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [openId, setOpenId] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const params = new URLSearchParams({ page: String(page), pageSize: String(PAGE_SIZE) });
      if (action) params.set('action', action);
      if (search) params.set('search', search);

      const response = await apiRequest(`/audit?${params.toString()}`);
      setItems(response?.data?.items ?? []);
      setTotal(Number(response?.data?.total ?? 0));
      setActions(response?.data?.actions ?? []);
    } catch (err) {
      setError(err.message || 'Unable to load the audit trail.');
    } finally {
      setLoading(false);
    }
  }, [page, action, search]);

  useEffect(() => {
    load();
  }, [load]);

  function applySearch(event) {
    event.preventDefault();
    setPage(1);
    setSearch(searchInput.trim());
  }

  function resetFilters() {
    setAction('');
    setSearchInput('');
    setSearch('');
    setPage(1);
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
        <div>
          <p className="text-sm font-medium text-slate-500">Reporting</p>
          <h1 className="mt-1 text-2xl font-bold tracking-tight text-slate-900">Audit trail</h1>
          <p className="mt-1 max-w-2xl text-sm text-slate-500">
            Read-only record of sensitive actions and workflow decisions, newest first.
          </p>
        </div>
        <button type="button" onClick={load} disabled={loading} className={SECONDARY_BUTTON}>
          <RefreshCw size={15} className={loading ? 'animate-spin' : ''} /> Refresh
        </button>
      </div>

      <section className="panel-card overflow-hidden">
        <form
          onSubmit={applySearch}
          className="flex flex-col gap-3 border-b border-slate-100 p-4 lg:flex-row lg:items-end"
        >
          <label className="block lg:w-72">
            <span className="mb-1.5 block text-xs font-semibold text-slate-600">Action</span>
            <select
              value={action}
              onChange={(event) => {
                setAction(event.target.value);
                setPage(1);
              }}
              className="h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm outline-none focus:border-navy-800"
            >
              <option value="">All actions</option>
              {actions.map((name) => (
                <option key={name} value={name}>
                  {titleCase(name)}
                </option>
              ))}
            </select>
          </label>

          <label className="block lg:w-72">
            <span className="mb-1.5 block text-xs font-semibold text-slate-600">User (name or email)</span>
            <span className="relative block">
              <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="search"
                value={searchInput}
                onChange={(event) => setSearchInput(event.target.value)}
                placeholder="Search user…"
                className="h-10 w-full rounded-lg border border-slate-200 pl-9 pr-3 text-sm outline-none focus:border-navy-800"
              />
            </span>
          </label>

          <div className="flex gap-2">
            <button type="submit" className="primary-button">Search</button>
            <button type="button" onClick={resetFilters} className={SECONDARY_BUTTON}>Reset</button>
          </div>
        </form>

        <ErrorBanner message={error} onRetry={load} />

        {loading && items.length === 0 ? (
          <LoadingBlock label="Loading audit records…" />
        ) : items.length === 0 ? (
          <EmptyBlock title="No audit records found">
            Change the filters, or perform an action in the system and refresh.
          </EmptyBlock>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead className="border-b border-slate-200 bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-5 py-3 font-semibold">Time</th>
                  <th className="px-5 py-3 font-semibold">User</th>
                  <th className="px-5 py-3 font-semibold">Action</th>
                  <th className="px-5 py-3 font-semibold">Record</th>
                  <th className="px-5 py-3 font-semibold">IP address</th>
                  <th className="px-5 py-3 font-semibold">Details</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {items.map((item) => {
                  const open = openId === item.id;
                  return (
                    <tr key={item.id} className="align-top hover:bg-slate-50/60">
                      <td className="whitespace-nowrap px-5 py-4 text-slate-600">
                        {formatDateTime(item.createdAt)}
                      </td>
                      <td className="px-5 py-4">
                        {item.user ? (
                          <>
                            <p className="font-medium text-slate-900">{item.user.name}</p>
                            <p className="text-xs text-slate-500">
                              {titleCase(item.user.role)} · {item.user.email}
                            </p>
                          </>
                        ) : (
                          <span className="text-slate-400">System / unknown</span>
                        )}
                      </td>
                      <td className="px-5 py-4 font-medium text-slate-800">{titleCase(item.action)}</td>
                      <td className="px-5 py-4 text-slate-600">
                        {item.entityType ? titleCase(item.entityType) : '—'}
                        {item.entityId !== null && (
                          <span className="block text-xs text-slate-400">#{item.entityId}</span>
                        )}
                      </td>
                      <td className="px-5 py-4 text-slate-600">{item.ipAddress || '—'}</td>
                      <td className="min-w-[220px] px-5 py-4">
                        <button
                          type="button"
                          onClick={() => setOpenId(open ? null : item.id)}
                          aria-expanded={open}
                          className="inline-flex items-center gap-1 text-xs font-semibold text-navy-800 hover:underline"
                        >
                          {open ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                          {open ? 'Hide' : 'Show'}
                        </button>
                        {open && (
                          <div className="mt-2">
                            <DetailsView details={item.details} />
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        <Pagination page={page} pageSize={PAGE_SIZE} total={total} onChange={setPage} />
      </section>
    </div>
  );
}