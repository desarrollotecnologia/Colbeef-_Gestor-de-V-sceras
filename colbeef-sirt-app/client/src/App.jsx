import { useEffect, useState } from 'react';
import './App.css';

/** Portal Vite: solo nombre del operador (sin contraseña). */
export default function App() {
  const [usuario, setUsuario] = useState('');

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const pre = params.get('usuario');
    const stored = localStorage.getItem('colbeef_usuario');
    if (pre) setUsuario(pre);
    else if (stored && stored !== 'anonimo') setUsuario(stored);
  }, []);

  function entrar(e) {
    e.preventDefault();
    const u = usuario.trim();
    if (!u) return;
    localStorage.setItem('colbeef_usuario', u);
    window.location.href = `/gestor.html?usuario=${encodeURIComponent(u)}`;
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
            <p>Colbeef · Indique su nombre</p>
          </div>
        </div>
      </header>

      <div className="progreso-card portal-card">
        <form onSubmit={entrar}>
          <label htmlFor="usuarioInput" className="portal-label">
            Nombre del operador
          </label>
          <input
            id="usuarioInput"
            className="portal-input"
            type="text"
            placeholder="Ej: Sergio Anaya"
            value={usuario}
            onChange={(e) => setUsuario(e.target.value)}
            required
            autoComplete="username"
          />
          <button className="btn btn-primary portal-submit" type="submit">
            Entrar al gestor →
          </button>
        </form>
      </div>
    </div>
  );
}
