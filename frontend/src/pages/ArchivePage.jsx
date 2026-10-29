import { confirmAction } from '../utils/confirmAction.js';
﻿import { useCallback, useEffect, useState } from 'react';
import { Check, ChevronDown, ChevronRight } from 'lucide-react';
import {
  ARCHIVE_LEVELS, getArchiveLevels, listArchiveSummaries, recordArchiveLevel,
} from '../services/archiveApi.js';
import {
  EmptyBlock, ErrorBanner, LoadingBlock, Pagination, StatusPill, SuccessBanner, formatDate,
} from './StateBlocks.jsx';

const PAGE_SIZE = 10;
const LEVEL_KEYS = Object.keys(ARCHIVE_LEVELS);

function LevelPanel({ item, canRecord, onRecorded, onError }) {
  const [levels, setLevels] = useState(null);
  const [reference, setReference] = useState('');
  const [busy, setBusy] = useState('');

  const load = useCallback(() => {
    getArchiveLevels(item.summaryId).then(setLevels).catch((err) => onError(err.message));
  }, [item.summaryId, onError]);
  useEffect(() => { load(); }, [load]);

  async function record(level) {
    if (!await confirmAction(`Record this report in the ${ARCHIVE_LEVELS[level]}?`)) return;
    setBusy(level); onError('');
    try {
      const result = await recordArchiveLevel(item.summaryId, level, reference.trim());
      setReference('');
      onRecorded(result.status === 'archived'
        ? 'Recorded at the last level. The report is now fully archived.'
        : `Recorded in the ${ARCHIVE_LEVELS[level]}.`);
      load();
    } catch (err) {
      onError(err.message);
    } finally {
      setBusy('');
    }
  }

  if (!levels) return <LoadingBlock label="Loading archive levelsâ€¦" />;
  return (
    <div className="space-y-3 bg-slate-50 p-4">
      {canRecord && item.status !== 'archived' && (
        <label className="block text-sm font-medium text-slate-700">Archive reference for the level you record (optional)
          <input maxLength={120} className="mt-1 w-full max-w-sm rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-normal"
            value={reference} onChange={(e) => setReference(e.target.value)} />
        </label>
      )}
      <ul className="grid gap-3 md:grid-cols-3">
        {levels.map((level) => (
          <li key={level.level} className="rounded-lg border border-slate-200 bg-white p-4 text-sm">
            <div className="font-medium text-slate-900">{ARCHIVE_LEVELS[level.level]}</div>
            {level.recorded ? (
              <div className="mt-2 text-slate-600">
                <span className="inline-flex items-center gap-1 text-emerald-700"><Check size={14} /> Recorded</span>
                <div>{formatDate(level.archivedAt)} Â· {level.archivedByName}</div>
                {level.archiveReference && <div className="text-xs text-slate-500">Ref: {level.archiveReference}</div>}
              </div>
            ) : (
              <div className="mt-2">
                <span className="text-slate-500">Not yet recorded</span>
                {canRecord && (
                  <button type="button" className="primary-button mt-3 w-full" disabled={Boolean(busy)} onClick={() => record(level.level)}>
                    {busy === level.level ? 'Recordingâ€¦' : 'Record'}
                  </button>
                )}
              </div>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

export default function ArchivePage({ user }) {
  const canRecord = user?.role === 'archives';
  const [state, setState] = useState('pending');
  const [page, setPage] = useState(1);
  const [result, setResult] = useState({ items: [], total: 0 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [openId, setOpenId] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setResult(await listArchiveSummaries({ state, page, pageSize: PAGE_SIZE }));
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [state, page]);
  useEffect(() => { load(); }, [load]);

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold text-slate-900">Evaluation archive</h1>
        <p className="mt-1 text-sm text-slate-600">
          Final evaluation summaries forwarded for archiving. Each report is recorded once in the department, the
          college / school / institute, and the university archives; it is fully archived after the third.
        </p>
      </header>
      <ErrorBanner message={error} onRetry={load} />
      <SuccessBanner message={message} />

      <section className="panel-card">
        <div className="border-b border-slate-200 p-4">
          <label className="text-sm font-medium text-slate-700">Show
            <select className="ml-3 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm" value={state}
              onChange={(e) => { setState(e.target.value); setPage(1); setOpenId(null); }}>
              <option value="pending">Waiting to be archived</option>
              <option value="archived">Fully archived</option>
            </select>
          </label>
        </div>
        {loading ? <LoadingBlock label="Loading reportsâ€¦" /> : result.items.length === 0 ? (
          <EmptyBlock title={state === 'pending' ? 'Nothing is waiting to be archived' : 'No fully archived reports yet'}>
            Reports appear here after they are finalized and forwarded to the archive.
          </EmptyBlock>
        ) : (
          <ul className="divide-y divide-slate-100">
            {result.items.map((item) => (
              <li key={item.summaryId}>
                <button type="button" className="flex w-full flex-wrap items-center justify-between gap-3 p-4 text-left hover:bg-slate-50"
                  aria-expanded={openId === item.summaryId} onClick={() => setOpenId(openId === item.summaryId ? null : item.summaryId)}>
                  <span className="flex items-center gap-3">
                    {openId === item.summaryId ? <ChevronDown size={18} /> : <ChevronRight size={18} />}
                    <span>
                      <span className="block font-medium text-slate-900">{item.instructorName}</span>
                      <span className="block text-sm text-slate-500">{item.cycleTitle} ({item.academicYear}) Â· forwarded {formatDate(item.forwardedAt)}</span>
                    </span>
                  </span>
                  <span className="flex items-center gap-3 text-sm text-slate-600">
                    {item.recordedLevels.length} of {LEVEL_KEYS.length} levels
                    <StatusPill status={item.status} />
                  </span>
                </button>
                {openId === item.summaryId && (
                  <LevelPanel item={item} canRecord={canRecord} onError={setError}
                    onRecorded={(text) => { setMessage(text); load(); }} />
                )}
              </li>
            ))}
          </ul>
        )}
        <Pagination page={page} pageSize={PAGE_SIZE} total={result.total} onChange={setPage} />
      </section>
    </div>
  );
}
