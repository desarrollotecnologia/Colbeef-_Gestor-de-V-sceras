export default function App() {
  return (
    <div className="app-wrap">
      <header className="header">
        <div className="logo-area">
          <div className="logo-icon" aria-hidden>
            🥩
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
          El gestor completo (decomisos, despachos, planilla, analytics) está en una sola pantalla optimizada
          para operación diaria.
        </p>
        <a className="btn btn-primary" href="/gestor-v2.html" style={{ marginTop: '0.5rem' }}>
          Abrir Gestor v2 (recomendado)
        </a>
        <a className="btn btn-secondary" href="/gestor.html" style={{ marginTop: '0.5rem', marginLeft: '0.5rem' }}>
          Versión clásica
        </a>
        <p style={{ fontSize: '0.8rem', color: 'var(--gris)', marginTop: '1rem' }}>
          En v2: pestañas por operación (stock, decomisos, despachos) y botón único{' '}
          <strong>Actualizar día</strong> para guardar la sesión. Decomisos: últimos 7 días hasta la fecha elegida.
        </p>
      </div>
    </div>
  );
}
