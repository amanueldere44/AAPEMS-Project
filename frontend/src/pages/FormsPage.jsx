import { confirmAction } from '../utils/confirmAction.js';
import { useCallback, useEffect, useState } from 'react';
import {
  ArrowDown,
  ArrowLeft,
  ArrowUp,
  FilePlus2,
  Plus,
  Rocket,
  Save,
  Trash2,
} from 'lucide-react';
import { apiRequest } from '../services/api.js';
import {
  EmptyBlock,
  ErrorBanner,
  LoadingBlock,
  StatusPill,
  SuccessBanner,
  formatDate,
} from './StateBlocks.jsx';

const TYPE_LABEL = {
  student: 'Student evaluation',
  department_head: 'Department head evaluation',
  peer: 'Peer evaluation',
  self: 'Self evaluation',
};

const INPUT =
  'w-full rounded-lg border border-slate-200 bg-white px-3 text-sm outline-none focus:border-navy-800 disabled:bg-slate-50';
const SECONDARY_BUTTON =
  'inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-60';
const ROW_BUTTON =
  'inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50';

let nextUid = 1;
const uid = () => `k${nextUid++}`;

function toEditable(version) {
  return (version.sections ?? []).map((section) => ({
    uid: uid(),
    sectionKey: section.sectionKey,
    title: section.title,
    criteria: section.criteria.map((criterion) => ({ uid: uid(), text: criterion.text })),
  }));
}

// Same rules as the server, so mistakes are shown before saving.
function validateDraft(sections) {
  if (sections.length === 0) return 'Add at least one section.';
  if (sections.length > 30) return 'A form can have at most 30 sections.';

  const keys = new Set();
  for (const [index, section] of sections.entries()) {
    const number = index + 1;
    const key = section.sectionKey.trim();
    if (!key) return `Section ${number} needs a key.`;
    if (key.length > 50 || !/^[A-Za-z0-9_-]+$/.test(key)) {
      return `Section ${number}: the key may only contain letters, digits, "_" and "-" (up to 50 characters).`;
    }
    if (keys.has(key.toLowerCase())) return `Section key "${key}" is used more than once.`;
    keys.add(key.toLowerCase());

    if (!section.title.trim()) return `Section ${number} needs a title.`;
    if (section.title.trim().length > 255) return `Section ${number}: the title is too long.`;
    if (section.criteria.length === 0) return `Section ${number} needs at least one criterion.`;
    if (section.criteria.length > 100) return `Section ${number} can have at most 100 criteria.`;

    for (const [criterionIndex, criterion] of section.criteria.entries()) {
      const text = criterion.text.trim();
      if (!text) return `Section ${number}, criterion ${criterionIndex + 1} is empty.`;
      if (text.length > 600) return `Section ${number}, criterion ${criterionIndex + 1} is too long (600 characters maximum).`;
    }
  }
  return '';
}

function move(list, index, direction) {
  const target = index + direction;
  if (target < 0 || target >= list.length) return list;
  const copy = [...list];
  [copy[index], copy[target]] = [copy[target], copy[index]];
  return copy;
}

/* ------------------------------------------------------------------ */
/* Read-only view of a published or retired version                    */
/* ------------------------------------------------------------------ */

function VersionView({ version }) {
  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
        This version is {version.status} and cannot be changed. To change the form, start a new draft.
      </div>

      {version.instructions && (
        <p className="panel-card whitespace-pre-line p-4 text-sm leading-6 text-slate-600">{version.instructions}</p>
      )}

      <p className="text-xs text-slate-500">
        Scale {version.scaleMin} to {version.scaleMax}
        {version.allowNa ? ', N/A allowed' : ', N/A not allowed'}
      </p>

      {version.sections.map((section) => (
        <section key={section.id} className="panel-card overflow-hidden">
          <div className="border-b border-slate-100 bg-slate-50 px-5 py-3">
            <h3 className="text-sm font-semibold text-slate-800">
              {section.sectionKey}. {section.title}
            </h3>
          </div>
          <ol className="divide-y divide-slate-100">
            {section.criteria.map((criterion, index) => (
              <li key={criterion.id} className="px-5 py-3 text-sm text-slate-700">
                {index + 1}. {criterion.text}
              </li>
            ))}
          </ol>
        </section>
      ))}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Draft editor                                                        */
/* ------------------------------------------------------------------ */

function DraftEditor({ version, onSaved, onPublished, onDiscarded }) {
  const [instructions, setInstructions] = useState(version.instructions ?? '');
  const [allowNa, setAllowNa] = useState(Boolean(version.allowNa));
  const [sections, setSections] = useState(() => toEditable(version));
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const criterionCount = sections.reduce((sum, section) => sum + section.criteria.length, 0);

  function touch() {
    setDirty(true);
    setNotice('');
  }

  function patchSection(sectionUid, patch) {
    setSections((current) => current.map((s) => (s.uid === sectionUid ? { ...s, ...patch } : s)));
    touch();
  }

  function patchCriterion(sectionUid, criterionUid, text) {
    setSections((current) =>
      current.map((s) =>
        s.uid === sectionUid
          ? { ...s, criteria: s.criteria.map((c) => (c.uid === criterionUid ? { ...c, text } : c)) }
          : s,
      ),
    );
    touch();
  }

  function addSection() {
    setSections((current) => {
      let n = current.length + 1;
      const used = new Set(current.map((s) => s.sectionKey.toLowerCase()));
      while (used.has(`s${n}`)) n += 1;
      return [...current, { uid: uid(), sectionKey: `S${n}`, title: '', criteria: [{ uid: uid(), text: '' }] }];
    });
    touch();
  }

  async function removeSection(sectionUid) {
    if (!await confirmAction('Remove this section and all of its criteria from the draft?')) return;
    setSections((current) => current.filter((s) => s.uid !== sectionUid));
    touch();
  }

  function addCriterion(sectionUid) {
    setSections((current) =>
      current.map((s) =>
        s.uid === sectionUid ? { ...s, criteria: [...s.criteria, { uid: uid(), text: '' }] } : s,
      ),
    );
    touch();
  }

  function removeCriterion(sectionUid, criterionUid) {
    setSections((current) =>
      current.map((s) =>
        s.uid === sectionUid ? { ...s, criteria: s.criteria.filter((c) => c.uid !== criterionUid) } : s,
      ),
    );
    touch();
  }

  function moveCriterion(sectionUid, index, direction) {
    setSections((current) =>
      current.map((s) => (s.uid === sectionUid ? { ...s, criteria: move(s.criteria, index, direction) } : s)),
    );
    touch();
  }

  async function persist() {
    const problem = validateDraft(sections);
    if (problem) {
      setError(problem);
      return false;
    }
    const response = await apiRequest(`/forms/versions/${version.id}`, {
      method: 'PUT',
      body: JSON.stringify({
        instructions: instructions.trim() || null,
        allowNa,
        sections: sections.map((section) => ({
          sectionKey: section.sectionKey.trim(),
          title: section.title.trim(),
          criteria: section.criteria.map((criterion) => ({ text: criterion.text.trim() })),
        })),
      }),
    });
    const saved = response?.data?.version;
    if (saved) {
      setSections(toEditable(saved));
      setInstructions(saved.instructions ?? '');
      setAllowNa(Boolean(saved.allowNa));
    }
    setDirty(false);
    return true;
  }

  async function handleSave() {
    setBusy(true);
    setError('');
    setNotice('');
    try {
      if (await persist()) {
        setNotice('Draft saved.');
        onSaved?.();
      }
    } catch (err) {
      setError(err.message || 'Unable to save the draft.');
    } finally {
      setBusy(false);
    }
  }

  async function handlePublish() {
    const problem = validateDraft(sections);
    if (problem) {
      setError(problem);
      return;
    }
    const confirmed = await confirmAction(
      `Publish version ${version.versionNo} of ${version.code}?\n\n` +
        'It becomes the form used for new assignments and the current published version is retired. ' +
        'Assignments that already exist keep the version they were created with.',
    );
    if (!confirmed) return;

    setBusy(true);
    setError('');
    setNotice('');
    try {
      if (dirty && !(await persist())) return;
      await apiRequest(`/forms/versions/${version.id}/publish`, { method: 'POST' });
      onPublished?.();
    } catch (err) {
      setError(err.message || 'Unable to publish the draft.');
    } finally {
      setBusy(false);
    }
  }

  async function handleDiscard() {
    if (!await confirmAction('Discard this draft? This cannot be undone.')) return;
    setBusy(true);
    setError('');
    try {
      await apiRequest(`/forms/versions/${version.id}`, { method: 'DELETE' });
      onDiscarded?.();
    } catch (err) {
      setError(err.message || 'Unable to discard the draft.');
    } finally {
      setBusy(false);
    }
  }

  const actionBar = (
    <div className="flex flex-wrap items-center gap-2">
      <button type="button" onClick={handleSave} disabled={busy || !dirty} className={SECONDARY_BUTTON}>
        <Save size={15} /> Save draft
      </button>
      <button type="button" onClick={handlePublish} disabled={busy} className="primary-button disabled:opacity-60">
        <Rocket size={15} /> Publish
      </button>
      <button type="button" onClick={handleDiscard} disabled={busy} className={`${SECONDARY_BUTTON} text-rose-700`}>
        <Trash2 size={15} /> Discard draft
      </button>
      <span className="text-xs text-slate-500">
        {dirty ? 'Unsaved changes' : 'All changes saved'} · {sections.length} sections · {criterionCount} criteria
      </span>
    </div>
  );

  return (
    <div className="space-y-5">
      <div className="rounded-lg border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-900">
        You are editing a draft. Nothing changes for evaluators until you publish it.
      </div>

      {actionBar}
      <ErrorBanner message={error} />
      <SuccessBanner message={notice} />

      <section className="panel-card space-y-4 p-5">
        <label className="block">
          <span className="mb-1.5 block text-xs font-semibold text-slate-600">Instructions shown to evaluators</span>
          <textarea
            rows={4}
            maxLength={5000}
            value={instructions}
            onChange={(event) => {
              setInstructions(event.target.value);
              touch();
            }}
            className={`${INPUT} p-3`}
          />
        </label>
        <label className="flex items-center gap-2 text-sm text-slate-700">
          <input
            type="checkbox"
            checked={allowNa}
            onChange={(event) => {
              setAllowNa(event.target.checked);
              touch();
            }}
          />
          Allow N/A answers (excluded from the average)
        </label>
        <p className="text-xs text-slate-500">
          The rating scale ({version.scaleMin} to {version.scaleMax}) and the evaluator weight ({version.weight}%) are
          fixed by the official forms and cannot be changed here.
        </p>
      </section>

      {sections.map((section, sectionIndex) => (
        <section key={section.uid} className="panel-card overflow-hidden">
          <div className="flex flex-col gap-3 border-b border-slate-100 bg-slate-50 px-5 py-3 lg:flex-row lg:items-end">
            <label className="block lg:w-40">
              <span className="mb-1 block text-xs font-semibold text-slate-600">Section key</span>
              <input
                value={section.sectionKey}
                maxLength={50}
                onChange={(event) => patchSection(section.uid, { sectionKey: event.target.value })}
                className={`${INPUT} h-9`}
              />
            </label>
            <label className="block flex-1">
              <span className="mb-1 block text-xs font-semibold text-slate-600">Section title</span>
              <input
                value={section.title}
                maxLength={255}
                onChange={(event) => patchSection(section.uid, { title: event.target.value })}
                className={`${INPUT} h-9`}
              />
            </label>
            <div className="flex gap-1.5">
              <button
                type="button"
                aria-label="Move section up"
                disabled={sectionIndex === 0}
                onClick={() => {
                  setSections((current) => move(current, sectionIndex, -1));
                  touch();
                }}
                className={ROW_BUTTON}
              >
                <ArrowUp size={13} />
              </button>
              <button
                type="button"
                aria-label="Move section down"
                disabled={sectionIndex === sections.length - 1}
                onClick={() => {
                  setSections((current) => move(current, sectionIndex, 1));
                  touch();
                }}
                className={ROW_BUTTON}
              >
                <ArrowDown size={13} />
              </button>
              <button type="button" onClick={() => removeSection(section.uid)} className={`${ROW_BUTTON} text-rose-700`}>
                <Trash2 size={13} /> Remove
              </button>
            </div>
          </div>

          <ol className="divide-y divide-slate-100">
            {section.criteria.map((criterion, index) => (
              <li key={criterion.uid} className="flex flex-col gap-2 px-5 py-3 sm:flex-row sm:items-start">
                <span className="w-6 pt-2 text-sm tabular-nums text-slate-500">{index + 1}.</span>
                <textarea
                  rows={2}
                  maxLength={600}
                  value={criterion.text}
                  onChange={(event) => patchCriterion(section.uid, criterion.uid, event.target.value)}
                  aria-label={`Criterion ${index + 1} of section ${section.sectionKey}`}
                  className={`${INPUT} p-2`}
                />
                <div className="flex gap-1.5">
                  <button
                    type="button"
                    aria-label="Move criterion up"
                    disabled={index === 0}
                    onClick={() => moveCriterion(section.uid, index, -1)}
                    className={ROW_BUTTON}
                  >
                    <ArrowUp size={13} />
                  </button>
                  <button
                    type="button"
                    aria-label="Move criterion down"
                    disabled={index === section.criteria.length - 1}
                    onClick={() => moveCriterion(section.uid, index, 1)}
                    className={ROW_BUTTON}
                  >
                    <ArrowDown size={13} />
                  </button>
                  <button
                    type="button"
                    aria-label="Remove criterion"
                    onClick={() => removeCriterion(section.uid, criterion.uid)}
                    className={`${ROW_BUTTON} text-rose-700`}
                  >
                    <Trash2 size={13} />
                  </button>
                </div>
              </li>
            ))}
          </ol>

          <div className="border-t border-slate-100 px-5 py-3">
            <button type="button" onClick={() => addCriterion(section.uid)} className={ROW_BUTTON}>
              <Plus size={13} /> Add criterion
            </button>
          </div>
        </section>
      ))}

      <button type="button" onClick={addSection} className={SECONDARY_BUTTON}>
        <Plus size={15} /> Add section
      </button>

      {actionBar}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* One form: version history, viewer and editor                        */
/* ------------------------------------------------------------------ */

function FormDetail({ form, onBack, onChanged }) {
  const [versions, setVersions] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [version, setVersion] = useState(null);
  const [loadingList, setLoadingList] = useState(true);
  const [loadingVersion, setLoadingVersion] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const loadVersions = useCallback(
    async (preferredId = null) => {
      setLoadingList(true);
      setError('');
      try {
        const response = await apiRequest(`/forms/${form.formId}/versions`);
        const list = response?.data?.versions ?? [];
        setVersions(list);
        const preferred = list.find((item) => Number(item.id) === Number(preferredId));
        const draft = list.find((item) => item.status === 'draft');
        const published = list.find((item) => item.status === 'published');
        setSelectedId((preferred ?? draft ?? published ?? list[0])?.id ?? null);
      } catch (err) {
        setError(err.message || 'Unable to load the version history.');
      } finally {
        setLoadingList(false);
      }
    },
    [form.formId],
  );

  useEffect(() => {
    loadVersions();
  }, [loadVersions]);

  useEffect(() => {
    if (!selectedId) {
      setVersion(null);
      return undefined;
    }
    let active = true;
    setLoadingVersion(true);
    apiRequest(`/forms/versions/${selectedId}`)
      .then((response) => {
        if (active) setVersion(response?.data?.version ?? null);
      })
      .catch((err) => {
        if (active) setError(err.message || 'Unable to load this version.');
      })
      .finally(() => {
        if (active) setLoadingVersion(false);
      });
    return () => {
      active = false;
    };
  }, [selectedId]);

  const hasDraft = versions.some((item) => item.status === 'draft');

  async function startDraft() {
    setBusy(true);
    setError('');
    setNotice('');
    try {
      const response = await apiRequest(`/forms/${form.formId}/versions`, { method: 'POST' });
      const created = response?.data?.version;
      setNotice('A new draft was created as a copy of the latest version.');
      await loadVersions(created?.id);
    } catch (err) {
      setError(err.message || 'Unable to start a new draft.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-5">
      <div>
        <button type="button" onClick={onBack} className={ROW_BUTTON}>
          <ArrowLeft size={13} /> All forms
        </button>
        <h1 className="mt-4 text-2xl font-bold tracking-tight text-slate-900">
          {form.code} · {form.title}
        </h1>
        <p className="mt-1 text-sm text-slate-500">
          {TYPE_LABEL[form.evaluatorType] ?? form.evaluatorType} · weight {form.weight}%
        </p>
      </div>

      <ErrorBanner message={error} onRetry={() => loadVersions(selectedId)} />
      <SuccessBanner message={notice} />

      <section className="panel-card overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-5 py-3">
          <h2 className="text-sm font-semibold text-slate-800">Version history</h2>
          <button type="button" onClick={startDraft} disabled={busy || hasDraft} className={SECONDARY_BUTTON}>
            <FilePlus2 size={15} /> Start new draft
          </button>
        </div>

        {loadingList ? (
          <LoadingBlock label="Loading versions…" />
        ) : versions.length === 0 ? (
          <EmptyBlock title="No versions found" />
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead className="border-b border-slate-200 bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-5 py-3 font-semibold">Version</th>
                  <th className="px-5 py-3 font-semibold">Status</th>
                  <th className="px-5 py-3 font-semibold">Sections</th>
                  <th className="px-5 py-3 font-semibold">Criteria</th>
                  <th className="px-5 py-3 font-semibold">Published</th>
                  <th className="px-5 py-3 font-semibold">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {versions.map((item) => (
                  <tr key={item.id} className={Number(item.id) === Number(selectedId) ? 'bg-slate-50' : ''}>
                    <td className="px-5 py-3 font-medium text-slate-900">v{item.versionNo}</td>
                    <td className="px-5 py-3"><StatusPill status={item.status} /></td>
                    <td className="px-5 py-3 tabular-nums text-slate-600">{item.sectionCount}</td>
                    <td className="px-5 py-3 tabular-nums text-slate-600">{item.criterionCount}</td>
                    <td className="px-5 py-3 text-slate-600">{formatDate(item.publishedAt)}</td>
                    <td className="px-5 py-3">
                      <button type="button" onClick={() => setSelectedId(item.id)} className={ROW_BUTTON}>
                        {item.status === 'draft' ? 'Edit' : 'View'}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {loadingVersion ? (
        <LoadingBlock label="Loading version…" />
      ) : version ? (
        version.status === 'draft' ? (
          <DraftEditor
            key={version.id}
            version={version}
            onSaved={() => loadVersions(version.id)}
            onPublished={async () => {
              setNotice(`Version ${version.versionNo} was published.`);
              await loadVersions(version.id);
              onChanged?.();
            }}
            onDiscarded={async () => {
              setNotice('The draft was discarded.');
              setSelectedId(null);
              await loadVersions();
              onChanged?.();
            }}
          />
        ) : (
          <VersionView key={version.id} version={version} />
        )
      ) : null}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Page                                                                */
/* ------------------------------------------------------------------ */

export default function FormsPage() {
  const [forms, setForms] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selected, setSelected] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const response = await apiRequest('/forms');
      setForms(response?.data?.forms ?? []);
    } catch (err) {
      setError(err.message || 'Unable to load the evaluation forms.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  if (selected) {
    return (
      <FormDetail
        form={selected}
        onBack={() => setSelected(null)}
        onChanged={load}
      />
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <p className="text-sm font-medium text-slate-500">Evaluations</p>
        <h1 className="mt-1 text-2xl font-bold tracking-tight text-slate-900">Official evaluation forms</h1>
        <p className="mt-1 max-w-2xl text-sm text-slate-500">
          Criteria and sections of the official forms. Published versions are locked; to change a form, start a draft,
          edit it and publish it. Evaluator weights (40/35/15/10) are fixed by the official forms.
        </p>
      </div>

      <ErrorBanner message={error} onRetry={load} />

      <section className="panel-card overflow-hidden">
        {loading ? (
          <LoadingBlock label="Loading forms…" />
        ) : forms.length === 0 ? (
          <EmptyBlock title="No published forms found" />
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead className="border-b border-slate-200 bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-5 py-3 font-semibold">Code</th>
                  <th className="px-5 py-3 font-semibold">Form</th>
                  <th className="px-5 py-3 font-semibold">Evaluator</th>
                  <th className="px-5 py-3 font-semibold">Weight</th>
                  <th className="px-5 py-3 font-semibold">Published</th>
                  <th className="px-5 py-3 font-semibold">Sections / criteria</th>
                  <th className="px-5 py-3 font-semibold">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {forms.map((form) => (
                  <tr key={form.id} className="hover:bg-slate-50/60">
                    <td className="px-5 py-4 font-medium text-slate-900">{form.code}</td>
                    <td className="px-5 py-4 text-slate-700">{form.title}</td>
                    <td className="px-5 py-4 text-slate-600">{TYPE_LABEL[form.evaluatorType] ?? form.evaluatorType}</td>
                    <td className="px-5 py-4 tabular-nums text-slate-600">{form.weight}%</td>
                    <td className="px-5 py-4 text-slate-600">
                      v{form.versionNo}
                      <span className="block text-xs text-slate-400">{formatDate(form.publishedAt)}</span>
                    </td>
                    <td className="px-5 py-4 tabular-nums text-slate-600">
                      {form.sections.length} / {form.sections.reduce((sum, s) => sum + s.criteria.length, 0)}
                    </td>
                    <td className="px-5 py-4">
                      <button type="button" onClick={() => setSelected(form)} className={ROW_BUTTON}>
                        Manage
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}