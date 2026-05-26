import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.jsx';
import { api } from './api.js';
import { AuthScreen } from './auth/AuthScreen.jsx';
import { RolePortal } from './auth/RolePortal.jsx';
import { PublicLanding } from './auth/PublicLanding.jsx';
import './styles.css';

const rootElement = document.getElementById('root');
if (rootElement) {
  rootElement.innerHTML = '<div style="padding:24px;font-family:Poppins,sans-serif;color:#334155">Memuat PDMADA...</div>';
}

window.addEventListener('error', (event) => {
  if (!rootElement) return;
  rootElement.innerHTML = `
    <div style="padding:24px;font-family:Poppins,sans-serif">
      <h3 style="margin:0 0 8px;color:#b91c1c">PDMADA gagal dimuat</h3>
      <div style="color:#334155">${event?.error?.message || event?.message || 'Unknown error'}</div>
    </div>
  `;
});

window.addEventListener('unhandledrejection', (event) => {
  if (!rootElement) return;
  const message = event?.reason?.message || String(event?.reason || 'Unhandled promise rejection');
  rootElement.innerHTML = `
    <div style="padding:24px;font-family:Poppins,sans-serif">
      <h3 style="margin:0 0 8px;color:#b91c1c">PDMADA gagal dimuat</h3>
      <div style="color:#334155">${message}</div>
    </div>
  `;
});

class AppErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, message: '' };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, message: error?.message || 'Terjadi error pada aplikasi.' };
  }

  componentDidCatch(error) {
    // eslint-disable-next-line no-console
    console.error('PDMADA runtime error:', error);
  }

  render() {
    if (this.state.hasError) {
      return (
        <main style={{ padding: 24, fontFamily: 'Poppins, sans-serif' }}>
          <h2 style={{ marginBottom: 8 }}>Aplikasi PDMADA mengalami error</h2>
          <p style={{ color: '#b91c1c', marginBottom: 12 }}>{this.state.message}</p>
          <button
            type="button"
            onClick={() => {
              localStorage.removeItem('pdmada_session');
              window.location.reload();
            }}
          >
            Reset Sesi & Muat Ulang
          </button>
        </main>
      );
    }
    return this.props.children;
  }
}

function Root() {
  const [session, setSession] = React.useState(() => {
    try {
      const raw = localStorage.getItem('pdmada_session');
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  });
  const [errorMessage, setErrorMessage] = React.useState('');
  const [showLogin, setShowLogin] = React.useState(false);

  async function handleLogin(credentials) {
    setErrorMessage('');
    try {
      const user = await api.auth.login(credentials);
      setSession(user);
      localStorage.setItem('pdmada_session', JSON.stringify(user));
      setShowLogin(false);
    } catch (err) {
      setErrorMessage(err.message || 'Login gagal');
    }
  }

  function handleLogout() {
    setSession(null);
    localStorage.removeItem('pdmada_session');
    setShowLogin(false);
  }

  if (!session) {
    if (showLogin) return <AuthScreen onLogin={handleLogin} errorMessage={errorMessage} onBack={() => setShowLogin(false)} />;
    return <PublicLanding onOpenLogin={() => setShowLogin(true)} />;
  }
  if (session.role === 'admin') return <App session={session} onLogout={handleLogout} />;
  return <RolePortal api={api} session={session} onLogout={handleLogout} />;
}

createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <AppErrorBoundary>
      <Root />
    </AppErrorBoundary>
  </React.StrictMode>
);
