import { useEffect, useState } from 'react';
import './App.css';

export default function App() {
  const [usuario, setUsuario] = useState('');
  const [embedLink, setEmbedLink] = useState('Ingrese un usuario');

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const pre = params.get('usuario');
    if (pre) setUsuario(pre);
  }, []);

  useEffect(() => {
    const u = usuario.trim();
    setEmbedLink(
      u ? `${window.location.origin}/gestor.html?usuario=${encodeURIComponent(u)}` : 'Ingrese un usuario'
    );
  }, [usuario]);

  function entrar(e) {
    e.preventDefault();
    const u = usuario.trim();
    if (!u) return;
    localStorage.setItem('colbeef_usuario', u);
    fetch('/api/usability/event', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        usuario: u,
        action: 'portal_enter',
        module: 'portal',
        detail: 'Entrada desde portal (Vite)',
        sessionId: sessionStorage.getItem('colbeef_session_id') || 'vite',
        page: 'portal',
      }),
    }).catch(() => {});
    window.location.href = `/gestor.html?usuario=${encodeURIComponent(u)}`;
  }

  function copiarEnlace() {
    const u = usuario.trim();
    if (!u) return;
    const link = `${window.location.origin}/gestor.html?usuario=${encodeURIComponent(u)}`;
    navigator.clipboard.writeText(link);
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
            <p>Colbeef · Portal de acceso</p>
          </div>
        </div>
      </header>

      <div className="progreso-card portal-card">
        <form onSubmit={entrar}>
          <label htmlFor="usuarioInput" className="portal-label">
            Usuario / nombre
          </label>
          <input
            id="usuarioInput"
            className="portal-input"
            type="text"
            placeholder="Ej: jperez, operador1"
            value={usuario}
            onChange={(e) => setUsuario(e.target.value)}
            required
            autoComplete="username"
          />
          <button className="btn btn-primary portal-submit" type="submit">
            Entrar al gestor →
          </button>
        </form>

        <div className="portal-link-box">
          <h3>Enlace para otro programa</h3>
          <code>{embedLink}</code>
          <button type="button" className="btn btn-secondary portal-copy" onClick={copiarEnlace}>
            Copiar enlace
          </button>
          <p className="portal-hint">
            Use este URL en un botón externo; el parámetro <strong>usuario</strong> queda registrado en
            usabilidad.
          </p>
        </div>
      </div>
    </div>
  );
}
