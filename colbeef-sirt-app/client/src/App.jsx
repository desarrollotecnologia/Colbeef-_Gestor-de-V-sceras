import { useEffect, useState } from 'react';
import './App.css';

const TOKEN_KEY = 'colbeef_auth_token';

export default function App() {
  const [usuario, setUsuario] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const pre = params.get('usuario');
    if (pre) setUsuario(pre);

    const existing = sessionStorage.getItem(TOKEN_KEY) || localStorage.getItem(TOKEN_KEY);
    if (!existing) return;
    fetch('/api/auth/me', { headers: { Authorization: `Bearer ${existing}` } })
      .then((r) => r.json())
      .then((data) => {
        if (!data.success) return;
        localStorage.setItem('colbeef_usuario', data.usuario);
        window.location.replace(`/gestor.html?usuario=${encodeURIComponent(data.usuario)}`);
      })
      .catch(() => {});
  }, []);

  async function entrar(e) {
    e.preventDefault();
    const u = usuario.trim();
    if (!u || !password) return;
    setError('');
    setLoading(true);
    try {
      const r = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ usuario: u, password }),
      });
      const data = await r.json();
      if (!r.ok || !data.success) {
        setError(data.message || 'No se pudo iniciar sesión');
        setLoading(false);
        return;
      }
      sessionStorage.setItem(TOKEN_KEY, data.token);
      localStorage.setItem(TOKEN_KEY, data.token);
      localStorage.setItem('colbeef_usuario', data.usuario);
      localStorage.setItem('colbeef_rol', data.rol || 'operador');
      window.location.href = `/gestor.html?usuario=${encodeURIComponent(data.usuario)}`;
    } catch {
      setError('Error de red o servidor');
      setLoading(false);
    }
  }

  return (
    <div className="app-wrap">
      <header className="header">
        <div className="logo-area">
          <div className="logo-icon" aria-hidden>
            <img src="/colbeef-icon.png" alt="" width="56" height="56" />
          </div>
          <div className="logo-text">
            <h1>Gestor de Vísceras</h1>
            <p>Colbeef · Inicio de sesión</p>
          </div>
        </div>
      </header>

      <div className="progreso-card portal-card">
        <form onSubmit={entrar}>
          <label htmlFor="usuarioInput" className="portal-label">
            Usuario
          </label>
          <input
            id="usuarioInput"
            className="portal-input"
            type="text"
            placeholder="Ej: jperez"
            value={usuario}
            onChange={(e) => setUsuario(e.target.value)}
            required
            autoComplete="username"
          />
          <label htmlFor="passwordInput" className="portal-label">
            Contraseña
          </label>
          <input
            id="passwordInput"
            className="portal-input"
            type="password"
            placeholder="••••••••"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            autoComplete="current-password"
          />
          <button className="btn btn-primary portal-submit" type="submit" disabled={loading}>
            {loading ? 'Entrando…' : 'Entrar al gestor →'}
          </button>
          {error ? <p style={{ color: '#dc2626', fontSize: '0.85rem' }}>{error}</p> : null}
        </form>
      </div>
    </div>
  );
}
