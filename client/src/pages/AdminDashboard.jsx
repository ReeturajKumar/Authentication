import { useEffect, useState } from 'react';
import { api } from '../services/api.js';
import Shell from '../components/Shell.jsx';

const fmt = (d) => new Date(d).toLocaleString();

export default function AdminDashboard({ user, onLogout, onAuthError }) {
  const [employees, setEmployees] = useState(null);
  const [error, setError] = useState('');
  const [confirming, setConfirming] = useState(null); // employee pending confirmation
  const [busy, setBusy] = useState(false);
  const [issued, setIssued] = useState(null); // { username, temporaryPassword } — shown once, memory only
  const [copied, setCopied] = useState(false);

  const load = () => api.employees()
    .then((d) => setEmployees(d.employees))
    .catch((err) => { setError(err.message); onAuthError(err); });

  useEffect(() => { load(); }, []);

  const doReset = async () => {
    setBusy(true);
    setError('');
    try {
      const res = await api.resetPassword(confirming.id, confirming.username);
      setIssued({ username: res.employee.username, temporaryPassword: res.temporaryPassword });
      setCopied(false);
      setConfirming(null);
      load();
    } catch (err) {
      setError(`Reset failed: ${err.message}`);
      setConfirming(null);
      onAuthError(err);
    } finally {
      setBusy(false);
    }
  };

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(issued.temporaryPassword);
      setCopied(true);
    } catch {
      setError('Copy failed. Select the password and copy it manually.');
    }
  };

  return (
    <Shell user={user} onLogout={onLogout}>
      <section className="panel">
        <div className="panel-head">
          <div>
            <h1>Employee accounts</h1>
            <p className="muted">Signed in as <strong>{user.username}</strong> ({user.role})</p>
          </div>
          <button className="btn ghost" onClick={load}>Refresh</button>
        </div>

        {error && <div className="alert error" role="alert">{error}</div>}

        {issued && (
          <div className="temp-box" role="status">
            <h2>Temporary password for {issued.username}</h2>
            <div className="temp-row">
              <code className="temp">{issued.temporaryPassword}</code>
              <button className="btn primary" onClick={copy}>{copied ? 'Copied' : 'Copy'}</button>
            </div>
            <p className="alert warn">
              This password is shown <strong>once</strong> and cannot be retrieved again. Hand it to the employee in person
              or via another secure channel. Do not email or write it in shared logs. The employee must change it at first sign-in.
            </p>
            <button className="btn ghost" onClick={() => setIssued(null)}>I have stored it securely — dismiss</button>
          </div>
        )}

        {!employees && !error && <p className="muted">Loading employees…</p>}
        {employees && (
          <div className="table-wrap">
            <table>
              <thead>
                <tr><th>Email</th><th>Status</th><th>Password</th><th>Last changed</th><th /></tr>
              </thead>
              <tbody>
                {employees.length === 0 && <tr><td colSpan={5} className="muted">No employees. Run the seed script.</td></tr>}
                {employees.map((e) => (
                  <tr key={e.id}>
                    <td data-label="Email">{e.username}</td>
                    <td data-label="Status"><span className={`pill ${e.status}`}>{e.status}</span></td>
                    <td data-label="Password">
                      {e.mustChangePassword ? <span className="pill pending">change pending</span> : <span className="pill active">set</span>}
                    </td>
                    <td data-label="Last changed">{fmt(e.passwordChangedAt)}</td>
                    <td className="actions">
                      <button className="btn danger" onClick={() => setConfirming(e)} disabled={busy}>Reset password</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {confirming && (
        <div className="modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="confirm-title">
          <div className="modal">
            <h2 id="confirm-title">Reset password?</h2>
            <p>
              You are about to reset the password for <strong>{confirming.username}</strong>.
            </p>
            <ul className="small muted">
              <li>All of their active sessions will be signed out immediately.</li>
              <li>A one-time temporary password will be generated and shown to you once.</li>
              <li>They must set a new password before accessing anything else.</li>
            </ul>
            <div className="modal-actions">
              <button className="btn ghost" onClick={() => setConfirming(null)} disabled={busy}>Cancel</button>
              <button className="btn danger" onClick={doReset} disabled={busy} autoFocus>
                {busy ? 'Resetting…' : `Reset ${confirming.username}`}
              </button>
            </div>
          </div>
        </div>
      )}
    </Shell>
  );
}
