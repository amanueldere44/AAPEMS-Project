import { confirmAction } from '../utils/confirmAction.js';
import { useCallback, useEffect, useState } from 'react';
import { apiRequest } from '../services/api.js';

const ROLES = [
  'admin',
  'student',
  'teacher',
  'department_head',
  'dean',
  'committee',
  'management',
  'academic_vp',
  'archives',
  'concerned_office',
];

const STATUSES = ['active', 'inactive', 'suspended'];

const EMPTY_FORM = {
  name: '',
  email: '',
  role: 'student',
  password: '',
  phone: '',
  gender: '',
  date_of_birth: '',
  address: '',
  id_number: '',
  profile_photo: '',
};

function formatDate(value) {
  if (!value) return '—';

  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? String(value).slice(0, 10)
    : date.toLocaleDateString();
}

function titleCase(value = '') {
  return value
    .replaceAll('_', ' ')
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function StatusBadge({ status }) {
  const styles = {
    active: 'bg-emerald-50 text-emerald-700 ring-emerald-600/20',
    inactive: 'bg-slate-100 text-slate-600 ring-slate-500/20',
    suspended: 'bg-rose-50 text-rose-700 ring-rose-600/20',
  };

  return (
    <span
      className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ring-inset ${
        styles[status] || styles.inactive
      }`}
    >
      {titleCase(status)}
    </span>
  );
}

function Field({ label, children }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-sm font-medium text-slate-700">
        {label}
      </span>
      {children}
    </label>
  );
}

const inputClass =
  'w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-800 outline-none transition placeholder:text-slate-400 focus:border-blue-500 focus:ring-2 focus:ring-blue-100';

export default function UsersPage({ user }) {
  const isAdmin = user?.role === 'admin';

  const [users, setUsers] = useState([]);
  const [pagination, setPagination] = useState({
    page: 1,
    limit: 10,
    total: 0,
    totalPages: 0,
  });

  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [page, setPage] = useState(1);

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingUser, setEditingUser] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [actionUserId, setActionUserId] = useState(null);

  const loadUsers = useCallback(async () => {
    setLoading(true);
    setError('');

    try {
      const params = new URLSearchParams({
        page: String(page),
        limit: '10',
      });

      if (search) params.set('search', search);
      if (roleFilter) params.set('role', roleFilter);
      if (statusFilter) params.set('status', statusFilter);

      const result = await apiRequest(`/users?${params.toString()}`);

      setUsers(result?.data?.users ?? []);
      setPagination(
        result?.data?.pagination ?? {
          page,
          limit: 10,
          total: 0,
          totalPages: 0,
        },
      );
    } catch (err) {
      setError(err.message || 'Unable to load users.');
    } finally {
      setLoading(false);
    }
  }, [page, search, roleFilter, statusFilter]);

  useEffect(() => {
    if (isAdmin) loadUsers();
  }, [isAdmin, loadUsers]);

  function applySearch(event) {
    event.preventDefault();
    setPage(1);
    setSearch(searchInput.trim());
  }

  function openCreateDialog() {
    setEditingUser(null);
    setForm(EMPTY_FORM);
    setError('');
    setNotice('');
    setDialogOpen(true);
  }

  function openEditDialog(account) {
    setEditingUser(account);
    setForm({
      ...EMPTY_FORM,
      name: account.name || '',
      email: account.email || '',
      role: account.role || 'student',
      phone: account.phone || '',
      gender: account.gender || '',
      date_of_birth: account.dateOfBirth
        ? String(account.dateOfBirth).slice(0, 10)
        : '',
      address: account.address || '',
      id_number: account.idNumber || '',
      profile_photo: account.profilePhoto || '',
    });
    setError('');
    setNotice('');
    setDialogOpen(true);
  }

  function updateField(event) {
    const { name, value } = event.target;
    setForm((current) => ({ ...current, [name]: value }));
  }

  async function submitForm(event) {
    event.preventDefault();
    setSaving(true);
    setError('');
    setNotice('');

    const payload = {
      name: form.name.trim(),
      email: form.email.trim(),
      role: form.role,
      phone: form.phone.trim() || null,
      gender: form.gender || null,
      date_of_birth: form.date_of_birth || null,
      address: form.address.trim() || null,
      id_number: form.id_number.trim() || null,
      profile_photo: form.profile_photo.trim() || null,
    };

    try {
      if (editingUser) {
        await apiRequest(`/users/${editingUser.id}`, {
          method: 'PATCH',
          body: JSON.stringify(payload),
        });
        setNotice('User account updated successfully.');
      } else {
        await apiRequest('/users', {
          method: 'POST',
          body: JSON.stringify({
            ...payload,
            password: form.password,
          }),
        });
        setNotice('User account created successfully.');
      }

      setDialogOpen(false);
      await loadUsers();
    } catch (err) {
      setError(err.message || 'Unable to save the account.');
    } finally {
      setSaving(false);
    }
  }

  async function changeStatus(account) {
    const nextStatus =
      account.status === 'active' ? 'inactive' : 'active';

    const confirmed = await confirmAction(
      `${nextStatus === 'active' ? 'Activate' : 'Deactivate'} ${account.name}'s account?`,
    );

    if (!confirmed) return;

    setActionUserId(account.id);
    setError('');
    setNotice('');

    try {
      await apiRequest(`/users/${account.id}/status`, {
        method: 'PATCH',
        body: JSON.stringify({ status: nextStatus }),
      });

      setNotice(`Account status changed to ${nextStatus}.`);
      await loadUsers();
    } catch (err) {
      setError(err.message || 'Unable to change account status.');
    } finally {
      setActionUserId(null);
    }
  }

  if (!isAdmin) {
    return (
      <section className="rounded-2xl border border-rose-100 bg-white p-8">
        <h1 className="text-xl font-semibold text-slate-900">
          Access restricted
        </h1>
        <p className="mt-2 text-sm text-slate-600">
          Only administrators can manage user accounts and roles.
        </p>
      </section>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
        <div>
          <p className="text-sm font-medium text-slate-500">
            Organization / Access control
          </p>
          <h1 className="mt-1 text-2xl font-bold tracking-tight text-slate-900">
            Users &amp; roles
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            Manage university accounts, access roles, and account status.
          </p>
        </div>

        <button
          type="button"
          onClick={openCreateDialog}
          className="inline-flex items-center justify-center gap-2 rounded-lg bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-slate-700"
        >
          <span aria-hidden="true">＋</span> Add user
        </button>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div className="rounded-xl border border-slate-200 bg-white p-5">
          <p className="text-sm text-slate-500">Matching accounts</p>
          <p className="mt-2 text-2xl font-bold text-slate-900">
            {pagination.total}
          </p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-5">
          <p className="text-sm text-slate-500">Active on this page</p>
          <p className="mt-2 text-2xl font-bold text-emerald-700">
            {users.filter((account) => account.status === 'active').length}
          </p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-5">
          <p className="text-sm text-slate-500">Roles represented</p>
          <p className="mt-2 text-2xl font-bold text-slate-900">
            {new Set(users.map((account) => account.role)).size}
          </p>
        </div>
      </div>

      {notice && (
        <div
          role="status"
          className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800"
        >
          {notice}
        </div>
      )}

      {error && !dialogOpen && (
        <div
          role="alert"
          className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700"
        >
          <span>{error}</span>
          <button
            type="button"
            onClick={loadUsers}
            className="font-semibold underline"
          >
            Try again
          </button>
        </div>
      )}

      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <form
          onSubmit={applySearch}
          className="grid grid-cols-1 gap-3 border-b border-slate-100 p-4 md:grid-cols-[minmax(220px,1fr)_190px_170px_auto_auto]"
        >
          <input
            value={searchInput}
            onChange={(event) => setSearchInput(event.target.value)}
            placeholder="Search name, email, or ID..."
            aria-label="Search users"
            className={inputClass}
          />

          <select
            value={roleFilter}
            onChange={(event) => {
              setRoleFilter(event.target.value);
              setPage(1);
            }}
            aria-label="Filter by role"
            className={inputClass}
          >
            <option value="">All roles</option>
            {ROLES.map((role) => (
              <option key={role} value={role}>
                {titleCase(role)}
              </option>
            ))}
          </select>

          <select
            value={statusFilter}
            onChange={(event) => {
              setStatusFilter(event.target.value);
              setPage(1);
            }}
            aria-label="Filter by status"
            className={inputClass}
          >
            <option value="">All statuses</option>
            {STATUSES.map((status) => (
              <option key={status} value={status}>
                {titleCase(status)}
              </option>
            ))}
          </select>

          <button
            type="submit"
            className="rounded-lg bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white hover:bg-slate-700"
          >
            Search
          </button>

          <button
            type="button"
            onClick={() => {
              setSearchInput('');
              setSearch('');
              setRoleFilter('');
              setStatusFilter('');
              setPage(1);
            }}
            className="rounded-lg border border-slate-200 px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50"
          >
            Reset
          </button>
        </form>

        <div className="overflow-x-auto">
          <table className="min-w-[850px] w-full text-left text-sm">
            <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-5 py-4 font-semibold">User</th>
                <th className="px-5 py-4 font-semibold">Role</th>
                <th className="px-5 py-4 font-semibold">Status</th>
                <th className="px-5 py-4 font-semibold">Created</th>
                <th className="px-5 py-4 text-right font-semibold">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                <tr>
                  <td colSpan={5} className="px-5 py-12 text-center text-slate-500">
                    Loading user accounts…
                  </td>
                </tr>
              ) : users.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-5 py-12 text-center">
                    <p className="font-medium text-slate-800">
                      No user accounts found
                    </p>
                    <p className="mt-1 text-slate-500">
                      Try changing your search or filters.
                    </p>
                  </td>
                </tr>
              ) : (
                users.map((account) => (
                  <tr key={account.id} className="transition hover:bg-slate-50/80">
                    <td className="px-5 py-4">
                      <div className="flex items-center gap-3">
                        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-slate-100 font-semibold text-slate-700">
                          {(account.name || '?').charAt(0).toUpperCase()}
                        </div>
                        <div className="min-w-0">
                          <p className="font-semibold text-slate-900">
                            {account.name}
                          </p>
                          <p className="mt-0.5 text-slate-500">
                            {account.email}
                          </p>
                          <p className="mt-0.5 text-xs text-slate-400">
                            ID: {account.id}
                          </p>
                        </div>
                      </div>
                    </td>
                    <td className="px-5 py-4 text-slate-700">
                      {titleCase(account.role)}
                    </td>
                    <td className="px-5 py-4">
                      <StatusBadge status={account.status} />
                    </td>
                    <td className="px-5 py-4 text-slate-500">
                      {formatDate(account.createdAt)}
                    </td>
                    <td className="px-5 py-4">
                      <div className="flex justify-end gap-2">
                        <button
                          type="button"
                          onClick={() => openEditDialog(account)}
                          className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-white"
                        >
                          Edit
                        </button>
                        <button
                          type="button"
                          disabled={
                            actionUserId === account.id ||
                            (String(account.id) === String(user.id) &&
                              account.status === 'active')
                          }
                          onClick={() => changeStatus(account)}
                          className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-white disabled:cursor-not-allowed disabled:opacity-40"
                          title={
                            String(account.id) === String(user.id)
                              ? 'You cannot deactivate your own account'
                              : ''
                          }
                        >
                          {actionUserId === account.id
                            ? 'Saving…'
                            : account.status === 'active'
                              ? 'Deactivate'
                              : 'Activate'}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        <div className="flex flex-col justify-between gap-3 border-t border-slate-100 px-5 py-4 sm:flex-row sm:items-center">
          <p className="text-sm text-slate-500">
            {pagination.total === 0
              ? 'No results'
              : `Showing ${(page - 1) * pagination.limit + 1}–${Math.min(
                  page * pagination.limit,
                  pagination.total,
                )} of ${pagination.total} accounts`}
          </p>
          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={page <= 1 || loading}
              onClick={() => setPage((current) => Math.max(1, current - 1))}
              className="rounded-lg border border-slate-200 px-3 py-2 text-sm font-medium disabled:opacity-40"
            >
              Previous
            </button>
            <span className="px-2 text-sm text-slate-600">
              Page {page} of {Math.max(1, pagination.totalPages)}
            </span>
            <button
              type="button"
              disabled={loading || page >= pagination.totalPages}
              onClick={() => setPage((current) => current + 1)}
              className="rounded-lg border border-slate-200 px-3 py-2 text-sm font-medium disabled:opacity-40"
            >
              Next
            </button>
          </div>
        </div>
      </section>

      {dialogOpen && (
        <div
          className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-950/50 p-4 sm:items-center"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget && !saving) {
              setDialogOpen(false);
            }
          }}
        >
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="user-dialog-title"
            className="my-6 w-full max-w-2xl rounded-2xl bg-white shadow-2xl"
          >
            <div className="flex items-start justify-between border-b border-slate-100 px-6 py-5">
              <div>
                <h2 id="user-dialog-title" className="text-lg font-bold text-slate-900">
                  {editingUser ? 'Edit user account' : 'Create user account'}
                </h2>
                <p className="mt-1 text-sm text-slate-500">
                  {editingUser
                    ? 'Update the account details and assigned role.'
                    : 'Create an account with an initial password.'}
                </p>
              </div>
              <button
                type="button"
                disabled={saving}
                onClick={() => setDialogOpen(false)}
                aria-label="Close dialog"
                className="rounded-lg px-2 py-1 text-xl text-slate-400 hover:bg-slate-100"
              >
                ×
              </button>
            </div>

            <form onSubmit={submitForm} className="space-y-5 p-6">
              {error && (
                <div role="alert" className="rounded-lg bg-rose-50 px-4 py-3 text-sm text-rose-700">
                  {error}
                </div>
              )}

              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Full name">
                  <input
                    required
                    minLength={2}
                    maxLength={255}
                    name="name"
                    value={form.name}
                    onChange={updateField}
                    className={inputClass}
                    autoComplete="name"
                  />
                </Field>

                <Field label="Email address">
                  <input
                    required
                    type="email"
                    maxLength={255}
                    name="email"
                    value={form.email}
                    onChange={updateField}
                    className={inputClass}
                    autoComplete="email"
                  />
                </Field>

                <Field label="System role">
                  <select
                    required
                    name="role"
                    value={form.role}
                    onChange={updateField}
                    className={inputClass}
                  >
                    {ROLES.map((role) => (
                      <option key={role} value={role}>
                        {titleCase(role)}
                      </option>
                    ))}
                  </select>
                </Field>

                {!editingUser && (
                  <Field label="Initial password (minimum 12 characters)">
                    <input
                      required
                      type="password"
                      minLength={12}
                      maxLength={128}
                      name="password"
                      value={form.password}
                      onChange={updateField}
                      className={inputClass}
                      autoComplete="new-password"
                    />
                  </Field>
                )}

                <Field label="Phone number">
                  <input
                    maxLength={20}
                    name="phone"
                    value={form.phone}
                    onChange={updateField}
                    className={inputClass}
                    autoComplete="tel"
                  />
                </Field>

                <Field label="Gender">
                  <select
                    name="gender"
                    value={form.gender}
                    onChange={updateField}
                    className={inputClass}
                  >
                    <option value="">Not specified</option>
                    <option value="male">Male</option>
                    <option value="female">Female</option>
                  </select>
                </Field>

                <Field label="Date of birth">
                  <input
                    type="date"
                    name="date_of_birth"
                    value={form.date_of_birth}
                    onChange={updateField}
                    className={inputClass}
                  />
                </Field>

                <Field label="University ID number">
                  <input
                    maxLength={40}
                    name="id_number"
                    value={form.id_number}
                    onChange={updateField}
                    className={inputClass}
                  />
                </Field>

                <div className="sm:col-span-2">
                  <Field label="Address">
                    <input
                      maxLength={255}
                      name="address"
                      value={form.address}
                      onChange={updateField}
                      className={inputClass}
                      autoComplete="street-address"
                    />
                  </Field>
                </div>
              </div>

              <div className="flex flex-col-reverse justify-end gap-3 border-t border-slate-100 pt-5 sm:flex-row">
                <button
                  type="button"
                  disabled={saving}
                  onClick={() => setDialogOpen(false)}
                  className="rounded-lg border border-slate-200 px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="rounded-lg bg-slate-900 px-5 py-2.5 text-sm font-semibold text-white hover:bg-slate-700 disabled:opacity-50"
                >
                  {saving
                    ? 'Saving…'
                    : editingUser
                      ? 'Save changes'
                      : 'Create account'}
                </button>
              </div>
            </form>
          </section>
        </div>
      )}
    </div>
  );
}