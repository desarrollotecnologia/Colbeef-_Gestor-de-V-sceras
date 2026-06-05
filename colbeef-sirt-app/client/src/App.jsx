export default function App() {
  return (
    <div className="app-wrap">
      <header className="header">
        <div className="logo-area">
          <div className="logo-icon" aria-hidden>
            <img src="/colbeef-icon.png" alt="" width="56" height="56" />
          </div>
          <div className="logo-text">
            <h1>Gestor de Vísceras</h1>
            <p>Colbeef · Sistema de Control</p>
          </div>
        </div>
        <div className="badge-db">BD: SIRT</div>
      </header>

      <div className="progreso-card">
        <div className="progreso-header">
          <span>Aplicación principal</span>
          <span>Operativa</span>
        </div>
        <p style={{ color: 'var(--gris)', marginTop: 0, lineHeight: 1.5 }}>
          Decomisos, despachos, planilla, analytics, informes y PDF en una sola pantalla.
        </p>
        <a className="btn btn-primary" href="/gestor.html" style={{ marginTop: '0.5rem' }}>
          Abrir Gestor
        </a>
      </div>
    </div>
  );
}
