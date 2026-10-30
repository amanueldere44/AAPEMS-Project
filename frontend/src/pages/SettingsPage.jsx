import { useCallback, useEffect, useState } from 'react';
import { Eye, EyeOff, ImagePlus, KeyRound, Save } from 'lucide-react';
import { apiRequest, getAssetUrl } from '../services/api.js';
import {
  ErrorBanner,
  LoadingBlock,
  SuccessBanner,
  titleCase,
} from './StateBlocks.jsx';

const INPUT =
  'h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm outline-none focus:border-navy-800 disabled:bg-slate-50 disabled:text-slate-500';

function ReadOnlyField({ label, value }) {
  return (
    <div>
      <p className="mb-1.5 text-xs font-semibold text-slate-600">{label}</p>
      <p className="flex h-10 items-center rounded-lg border border-slate-100 bg-slate-50 px-3 text-sm text-slate-700">
        {value || '—'}
      </p>
    </div>
  );
}

function ProfileCard() {
  const [profile, setProfile] = useState(null);
  const [phone, setPhone] = useState('');
  const [address, setAddress] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [photoSaving, setPhotoSaving] = useState(false);
  const [photoError, setPhotoError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const response = await apiRequest('/auth/me');
      const user = response?.data?.user;
      setProfile(user);
      setPhone(user?.phone ?? '');
      setAddress(user?.address ?? '');
    } catch (err) {
      setError(err.message || 'Unable to load your profile.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function save(event) {
    event.preventDefault();
    setSaving(true);
    setError('');
    setNotice('');
    try {
      const response = await apiRequest('/auth/profile', {
        method: 'PATCH',
        body: JSON.stringify({
          phone: phone.trim() || null,
          address: address.trim() || null,
        }),
      });
      const user = response?.data?.user;
      setProfile(user);
      setPhone(user?.phone ?? '');
      setAddress(user?.address ?? '');
      setNotice('Profile updated.');
    } catch (err) {
      setError(err.message || 'Unable to update your profile.');
    } finally {
      setSaving(false);
    }
  }

  async function uploadPhoto(event) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    setPhotoError('');
    if (!file.type.startsWith('image/')) {
      setPhotoError('Please choose an image file.');
      return;
    }
    if (file.size > 3 * 1024 * 1024) {
      setPhotoError('The profile picture must be 3 MB or smaller.');
      return;
    }
    const formData = new FormData();
    formData.append('photo', file);
    setPhotoSaving(true);
    try {
      const response = await apiRequest('/auth/profile-photo', {
        method: 'POST',
        body: formData,
      });
      const updatedUser = response?.data?.user;
      setProfile(updatedUser);
      window.dispatchEvent(new CustomEvent('asems:user-updated', { detail: updatedUser }));
    } catch (err) {
      setPhotoError(err.message || 'Unable to upload your profile picture.');
    } finally {
      setPhotoSaving(false);
    }
  }

  return (
    <section className="panel-card overflow-hidden">
      {loading ? (
        <LoadingBlock label="Loading your profile…" />
      ) : (
        <form onSubmit={save} className="space-y-4 p-5">
          <ErrorBanner message={error} onRetry={load} />
          <SuccessBanner message={notice} />
          {photoError && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{photoError}</p>}

          <div className="flex flex-wrap items-center gap-4 rounded-xl bg-slate-50 p-4">
            <div className="flex h-20 w-20 items-center justify-center overflow-hidden rounded-full bg-navy-900 text-xl font-semibold text-white">
              {profile?.profilePhoto ? (
                <img
                  src={getAssetUrl(profile.profilePhoto)}
                  alt="Your profile"
                  className="h-full w-full object-cover"
                />
              ) : (
                (profile?.name || 'U').split(/\\s+/).map((part) => part[0]).slice(0, 2).join('').toUpperCase()
              )}
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-slate-800">Profile picture</p>
              <p className="mt-1 text-xs text-slate-500">Upload or replace your picture. JPG, PNG, GIF or WebP; maximum 3 MB.</p>
              <label className="mt-3 inline-flex cursor-pointer items-center gap-2 rounded-lg bg-navy-900 px-3 py-2 text-xs font-semibold text-white hover:bg-navy-800">
                <ImagePlus size={15} /> {photoSaving ? 'Uploading…' : profile?.profilePhoto ? 'Change picture' : 'Upload picture'}
                <input type="file" accept="image/jpeg,image/png,image/gif,image/webp" onChange={uploadPhoto} disabled={photoSaving} className="sr-only" />
              </label>
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <ReadOnlyField label="Full name" value={profile?.name} />
            <ReadOnlyField label="Email address" value={profile?.email} />
            <ReadOnlyField label="System role" value={titleCase(profile?.role)} />
            <ReadOnlyField label="University ID number" value={profile?.idNumber} />

            <label className="block">
              <span className="mb-1.5 block text-xs font-semibold text-slate-600">Phone</span>
              <input
                type="tel"
                value={phone}
                maxLength={30}
                onChange={(event) => setPhone(event.target.value)}
                autoComplete="tel"
                className={INPUT}
              />
            </label>

            <label className="block">
              <span className="mb-1.5 block text-xs font-semibold text-slate-600">Address</span>
              <input
                type="text"
                value={address}
                maxLength={255}
                onChange={(event) => setAddress(event.target.value)}
                autoComplete="street-address"
                className={INPUT}
              />
            </label>
          </div>

          <div className="flex justify-end">
            <button type="submit" disabled={saving} className="primary-button disabled:opacity-60">
              <Save size={15} /> {saving ? 'Saving…' : 'Save profile'}
            </button>
          </div>
        </form>
      )}
    </section>
  );
}

function PasswordCard() {
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showCurrent, setShowCurrent] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  async function submit(event) {
    event.preventDefault();
    setError('');
    setNotice('');

    if (newPassword.length < 12) {
      setError('The new password must be at least 12 characters long.');
      return;
    }
    if (newPassword !== confirmPassword) {
      setError('The new password and its confirmation do not match.');
      return;
    }
    if (newPassword === currentPassword) {
      setError('The new password must be different from the current password.');
      return;
    }

    setSaving(true);
    try {
      await apiRequest('/auth/change-password', {
        method: 'POST',
        body: JSON.stringify({ currentPassword, newPassword }),
      });
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      setNotice('Password changed. Use the new password the next time you sign in.');
    } catch (err) {
      setError(err.message || 'Unable to change the password.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="panel-card overflow-hidden">
      <div className="flex items-center gap-3 border-b border-slate-100 px-5 py-4">
        <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-slate-100 text-slate-700">
          <KeyRound size={18} />
        </span>
        <div>
          <h2 className="text-base font-semibold text-slate-900">Change password</h2>
          <p className="text-xs text-slate-500">Use at least 12 characters.</p>
        </div>
      </div>

      <form onSubmit={submit} className="space-y-4 p-5">
        <ErrorBanner message={error} />
        <SuccessBanner message={notice} />

        <label className="relative block max-w-md">
          <span className="mb-1.5 block text-xs font-semibold text-slate-600">Current password</span>
          <input
            type={showCurrent ? 'text' : 'password'}
            value={currentPassword}
            onChange={(event) => setCurrentPassword(event.target.value)}
            autoComplete="current-password"
            required
            className={`${INPUT} pr-11`}
          />
          <button type="button" onClick={() => setShowCurrent((value) => !value)} aria-label={showCurrent ? 'Hide current password' : 'Show current password'} className="absolute right-3 mt-[-2rem] text-slate-500">
            {showCurrent ? <EyeOff size={17} /> : <Eye size={17} />}
          </button>
        </label>

        <div className="grid max-w-3xl gap-4 sm:grid-cols-2">
          <label className="relative block">
            <span className="mb-1.5 block text-xs font-semibold text-slate-600">
              New password (minimum 12 characters)
            </span>
            <input
              type={showNew ? 'text' : 'password'}
              value={newPassword}
              onChange={(event) => setNewPassword(event.target.value)}
              autoComplete="new-password"
              minLength={12}
              maxLength={128}
              required
              className={`${INPUT} pr-11`}
            />
            <button type="button" onClick={() => setShowNew((value) => !value)} aria-label={showNew ? 'Hide new password' : 'Show new password'} className="absolute right-3 mt-[-2rem] text-slate-500">
              {showNew ? <EyeOff size={17} /> : <Eye size={17} />}
            </button>
          </label>

          <label className="block relative">
            <span className="mb-1.5 block text-xs font-semibold text-slate-600">Confirm new password</span>
            <input
              type={showConfirm ? 'text' : 'password'}
              value={confirmPassword}
              onChange={(event) => setConfirmPassword(event.target.value)}
              autoComplete="new-password"
              minLength={12}
              maxLength={128}
              required
              className={`${INPUT} pr-11`}
            />
            <button type="button" onClick={() => setShowConfirm((value) => !value)} aria-label={showConfirm ? 'Hide confirmation password' : 'Show confirmation password'} className="absolute right-3 mt-[-2rem] text-slate-500">
              {showConfirm ? <EyeOff size={17} /> : <Eye size={17} />}
            </button>
          </label>
        </div>

        <div className="flex max-w-3xl justify-end">
          <button type="submit" disabled={saving} className="primary-button disabled:opacity-60">
            <KeyRound size={15} /> {saving ? 'Changing…' : 'Change password'}
          </button>
        </div>
      </form>
    </section>
  );
}

export default function SettingsPage() {
  return (
    <div className="space-y-6">
      <div>
        <p className="text-sm font-medium text-slate-500">Account</p>
        <h1 className="mt-1 text-2xl font-bold tracking-tight text-slate-900">Settings</h1>
        <p className="mt-1 max-w-2xl text-sm text-slate-500">
          Update your contact details and change your password.
        </p>
      </div>

      <ProfileCard />
      <PasswordCard />
    </div>
  );
}