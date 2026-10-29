import { useEffect, useState } from 'react';
import { api } from '../services/api.js';
import Shell from '../components/Shell.jsx';

export default function EmployeeDashboard({ user, onLogout, onAuthError }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    api.overview().then(setData).catch((err) => { setError(err.message); onAuthError(err); });
  }, []);

  return (
    <Shell user={user} onLogout={onLogout}>
      <section className="panel">
        <h1>Plant overview</h1>
        <div className="alert info">Simulated read-only values. This demo is not connected to any PLC and sends no commands.</div>
        {error && <div className="alert error" role="alert">{error}</div>}
        {!data && !error && <p className="muted">Loading…</p>}
        {data && (
          <div className="tiles">
            {data.tags.map((t) => (
              <div key={t.name} className={`tile ${t.state}`}>
                <span className="tile-label">{t.name}</span>
                <span className="tile-value">{t.value}<small>{t.unit}</small></span>
                <span className="tile-state"><span className={`dot ${t.state === 'normal' ? 'ok' : 'warn'}`} />{t.state}</span>
              </div>
            ))}
          </div>
        )}
      </section>
    </Shell>
  );
}
