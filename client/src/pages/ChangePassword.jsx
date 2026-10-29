import { useState } from 'react';
import { api } from '../services/api.js';
import Shell from '../components/Shell.jsx';
import PasswordInput from '../components/PasswordInput.jsx';

// Mirrors the server policy for instant feedback; the server is still the authority.
const rules = (pw, username) => [
  ['At least 12 characters', pw.length >= 12],
  ['3 of: lowercase, uppercase, digit, symbol', [/[a-z]/, /[A-Z]/, /\d/, /[^A-Za-z0-9]/].filter((r) => r.test(pw)).length >= 3],
  ['Does not contain your email', !!pw && !pw.toLowerCase().includes(username.toLowerCase())],
];

export default function ChangePassword({ user, onDone, onLogout }) {
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const checks = rules(newPassword, user.username);
  const mismatch = confirmPassword && newPassword !== confirmPassword;

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      const res = await api.changePassword(newPassword, confirmPassword);
      onDone(res.message);
    } catch (err) {
      if (err.status === 401) return onDone('Your temporary session expired. Sign in with your temporary password again.');
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Shell user={user} onLogout={onLogout}>
      <form className="panel narrow" onSubmit={submit}>
        <h1>Password change required</h1>
        <div className="alert warn">
          You signed in with a temporary password. Access to plant functions is locked until you set a new password.
        </div>
        {error && <div className="alert error" role="alert">{error}</div>}
        <label>
          New password
          <PasswordInput value={newPassword} onChange={(e) => setNewPassword(e.target.value)}
            autoComplete="new-password" autoFocus required maxLength={72} />
        </label>
        <ul className="checks">
          {checks.map(([label, ok]) => <li key={label} className={ok ? 'ok' : ''}>{ok ? '✓' : '○'} {label}</li>)}
        </ul>
        <label>
          Confirm new password
          <PasswordInput value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)}
            autoComplete="new-password" required maxLength={72} aria-invalid={!!mismatch} />
        </label>
        {mismatch && <p className="field-error">Passwords do not match</p>}
        <button className="btn primary" disabled={busy || mismatch}>{busy ? 'Saving…' : 'Set new password'}</button>
        <p className="muted small">After saving you will be signed out and must sign in with the new password.</p>
      </form>
    </Shell>
  );
}
