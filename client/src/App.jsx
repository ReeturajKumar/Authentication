import { useEffect, useState } from 'react';
import { api } from './services/api.js';
import Login from './pages/Login.jsx';
import AdminDashboard from './pages/AdminDashboard.jsx';
import ChangePassword from './pages/ChangePassword.jsx';
import EmployeeDashboard from './pages/EmployeeDashboard.jsx';

// The server decides who the user is and what they may do; the UI only mirrors /me.
export default function App() {
  const [auth, setAuth] = useState(undefined); // undefined = loading, null = signed out
  const [notice, setNotice] = useState('');

  useEffect(() => {
    api.me().then(setAuth).catch(() => setAuth(null));
  }, []);

  const signOut = (message = '') => {
    setNotice(message);
    setAuth(null);
  };

  const logout = async () => {
    await api.logout().catch(() => {});
    signOut('You have been signed out.');
  };

  // Any 401 from a page means the session was revoked or expired.
  const onAuthError = (err) => {
    if (err.status === 401) signOut('Your session ended. Please sign in again.');
    else if (err.code === 'PASSWORD_CHANGE_REQUIRED') api.me().then(setAuth).catch(() => signOut());
  };

  if (auth === undefined) return <div className="center muted">Connecting to control server…</div>;
  if (!auth) return <Login notice={notice} onLogin={(data) => { setNotice(''); setAuth(data); }} />;
  if (auth.passwordChangeRequired) {
    return <ChangePassword user={auth.user} onDone={signOut} onLogout={logout} />;
  }
  return auth.user.role === 'Administrator'
    ? <AdminDashboard user={auth.user} onLogout={logout} onAuthError={onAuthError} />
    : <EmployeeDashboard user={auth.user} onLogout={logout} onAuthError={onAuthError} />;
}
