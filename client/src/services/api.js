// The session lives in an HttpOnly cookie the browser manages. The CSRF token is kept in memory
// only (re-fetched from /me on reload). Nothing sensitive goes to localStorage.
let csrfToken = null;

async function request(method, path, body) {
  const headers = {};
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (method !== 'GET' && csrfToken) headers['X-CSRF-Token'] = csrfToken;

  let res;
  try {
    res = await fetch(`/api${path}`, {
      method,
      headers,
      credentials: 'same-origin',
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    throw Object.assign(new Error('Cannot reach the server. Is the backend running?'), { status: 0 });
  }

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw Object.assign(new Error(data.error || `Request failed (${res.status})`), { status: res.status, code: data.code });
  }
  return data;
}

function remember(data) {
  csrfToken = data.csrfToken ?? null;
  return data;
}

export const api = {
  me: () => request('GET', '/auth/me').then(remember),
  login: (username, password) => request('POST', '/auth/login', { username, password }).then(remember),
  logout: () => request('POST', '/auth/logout', {}).finally(() => { csrfToken = null; }),
  changePassword: (newPassword, confirmPassword) =>
    request('POST', '/auth/change-password', { newPassword, confirmPassword }).finally(() => { csrfToken = null; }),
  employees: () => request('GET', '/admin/employees'),
  resetPassword: (id, confirmUsername) => request('POST', `/admin/employees/${id}/reset-password`, { confirmUsername }),
  overview: () => request('GET', '/scada/overview'),
};
