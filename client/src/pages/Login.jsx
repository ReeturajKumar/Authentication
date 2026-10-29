import { useState } from 'react';
import { api } from '../services/api.js';
import Shell from '../components/Shell.jsx';
import PasswordInput from '../components/PasswordInput.jsx';

export default function Login({ notice, onLogin }) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      const data = await api.login(username, password);
      setPassword('');
      onLogin(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Shell>
      <form className="panel narrow" onSubmit={submit}>
        <h1>Operator sign-in</h1>
        <p className="muted">Authorized personnel only. Activity is audited.</p>
        {notice && <div className="alert info" role="status">{notice}</div>}
        {error && <div className="alert error" role="alert">{error}</div>}
        <label>
          Email
          <input type="email" value={username} onChange={(e) => setUsername(e.target.value)}
            autoComplete="username" autoFocus required maxLength={254} />
        </label>
        <label>
          Password
          <PasswordInput value={password} onChange={(e) => setPassword(e.target.value)}
            autoComplete="current-password" required maxLength={256} />
        </label>
        <button className="btn primary" disabled={busy}>{busy ? 'Signing in…' : 'Sign in'}</button>
      </form>
    </Shell>
  );
}
