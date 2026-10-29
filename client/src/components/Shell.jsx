export default function Shell({ user, onLogout, children }) {
  return (
    <div className="shell">
      <header className="topbar">
        <div className="brand">
          <span className="brand-mark" aria-hidden="true" />
          <span>SCADA Access Control</span>
        </div>
        {user && (
          <div className="identity">
            <button className="btn ghost" onClick={onLogout}>Log out</button>
          </div>
        )}
      </header>
      <main className="content">{children}</main>
    </div>
  );
}
