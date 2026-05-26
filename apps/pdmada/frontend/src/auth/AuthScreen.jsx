import React, { useState } from 'react';

export function AuthScreen({ onLogin, errorMessage, onBack }) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);

  async function submit(e) {
    e.preventDefault();
    if (!username.trim() || !password) return;
    setLoading(true);
    try {
      await onLogin({ username: username.trim(), password });
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="auth-shell">
      <section className="auth-card">
        <div className="auth-head">
          <h1>Login PDMADA</h1>
          <p>Masuk sebagai Admin, Guru, Wali Kelas, atau Siswa.</p>
          {onBack && (
            <button className="auth-back" type="button" onClick={onBack}>
              Kembali
            </button>
          )}
        </div>
        <form className="auth-form" onSubmit={submit}>
          <label>Username</label>
          <input value={username} onChange={(e) => setUsername(e.target.value)} placeholder="Masukkan username" />
          <label>Password</label>
          <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Masukkan password" />
          {errorMessage && <div className="auth-error">{errorMessage}</div>}
          <button className="btn-gradient" type="submit" disabled={loading}>
            {loading ? 'Memproses...' : 'Login'}
          </button>
        </form>
        <div className="auth-note">
          Admin default: <strong>admin</strong> / <strong>admin</strong>
        </div>
      </section>
    </main>
  );
}
