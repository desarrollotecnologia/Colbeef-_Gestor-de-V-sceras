import { useCallback, useEffect, useState } from 'react';

async function fetchJson(path) {
  const r = await fetch(path);
  if (!r.ok) {
    const t = await r.text();
    throw new Error(t || r.statusText);
  }
  return r.json();
}

export default function App() {
  const [days, setDays] = useState(7);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');
  const [dash, setDash] = useState(null);
  const [propRows, setPropRows] = useState([]);
  const [catRows, setCatRows] = useState([]);
  const [exporting, setExporting] = useState('');

  const qs = `?days=${encodeURIComponent(days)}`;

  const load = useCallback(async () => {
    setLoading(true);
    setErr('');
    try {
      const [d, p, c] = await Promise.all([
        fetchJson(`/api/dashboard${qs}`),
        fetchJson(`/api/despachos-propietario${qs}&limit=60`),
        fetchJson(`/api/categorias${qs}`),
      ]);
      if (!d.success) throw new Error(d.message || 'Dashboard');
      setDash(d);
      setPropRows(p.rows || []);
      setCatRows(c.rows || []);
    } catch (e) {
      setErr(e.message || String(e));
      setDash(null);
      setPropRows([]);
      setCatRows([]);
    } finally {
      setLoading(false);
    }
  }, [days]);

  useEffect(() => {
    load();
  }, [load]);

  const download = async (kind) => {
    setExporting(kind);
    try {
      const path =
        kind === 'xlsx' ? `/api/export/resumen.xlsx${qs}` : `/api/export/resumen.pdf${qs}`;
      const r = await fetch(path);
      if (!r.ok) throw new Error(await r.text());
      const blob = await r.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = kind === 'xlsx' ? 'colbeef_resumen_sirt.xlsx' : 'colbeef_resumen_sirt.pdf';
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      setErr(e.message || String(e));
    } finally {
      setExporting('');
    }
  };

  const periodoLabel =
    dash?.desde && dash?.hasta
      ? `${dash.desde} — ${dash.hasta}`
      : dash
        ? `Últimos ${dash.dias} días`
        : '—';

  return (
    <div className="app-wrap">
      <header className="header">
        <div className="logo-area">
          <div className="logo-icon" aria-hidden>
            🥩
          </div>
          <div className="logo-text">
            <h1>Colbeef · Gestor de vísceras</h1>
            <p>Datos en vivo desde PostgreSQL (SIRT) · sin carga de archivos</p>
          </div>
        </div>
        <div className="badge-db">BD: sirt</div>
      </header>

      <div className="controls">
        <label htmlFor="days">
          Periodo (días):{' '}
          <input
            id="days"
            type="number"
            min={1}
            max={90}
            value={days}
            onChange={(e) => setDays(Number(e.target.value) || 7)}
          />
        </label>
        <button type="button" className="btn btn-secondary" onClick={load} disabled={loading}>
          Actualizar
        </button>
        <div className="btn-row">
          <button
            type="button"
            className="btn btn-secondary"
            disabled={!!exporting}
            onClick={() => download('xlsx')}
          >
            {exporting === 'xlsx' ? 'Excel…' : 'Descargar Excel'}
          </button>
          <button
            type="button"
            className="btn btn-primary"
            disabled={!!exporting}
            onClick={() => download('pdf')}
          >
            {exporting === 'pdf' ? 'PDF…' : 'Descargar PDF'}
          </button>
        </div>
      </div>

      {err ? <div className="alert alert-error">Error: {err}</div> : null}

      {!err && !loading ? (
        <div className="alert alert-info">
          Periodo: <strong>{periodoLabel}</strong> · Métricas alineadas a tablas{' '}
          <code>parte_producto</code>, <code>parte_producto_cava_riel</code>,{' '}
          <code>sai.decomiso</code> y vista <code>vw_producto_vendido_colbeef</code>.
        </div>
      ) : null}

      {loading || !dash ? (
        <p style={{ color: 'var(--gris)' }}>Cargando…</p>
      ) : (
        <>
          <div className="resumen-grid">
            <div className="tarjeta">
              <div className="tarjeta-label">Juegos (vísceras / cabeza / patas)</div>
              <div className="tarjeta-valor">{dash.totalSalidas}</div>
              <div className="tarjeta-sub">Códigos base distintos en el periodo</div>
            </div>
            <div className="tarjeta">
              <div className="tarjeta-label">Salidas de cava</div>
              <div className="tarjeta-valor">{dash.conSalidaCava}</div>
              <div className="tarjeta-sub">Registros con fecha_salida en cava</div>
            </div>
            <div className="tarjeta">
              <div className="tarjeta-label">Decomisos</div>
              <div className="tarjeta-valor danger">{dash.totalDecomisos}</div>
              <div className="tarjeta-sub">Filas en sai.decomiso</div>
            </div>
            <div className="tarjeta">
              <div className="tarjeta-label">Crudas (estim.)</div>
              <div className="tarjeta-valor">{dash.totalCrudas}</div>
              <div className="tarjeta-sub">VB + texto cruda en observaciones</div>
            </div>
            <div className="tarjeta">
              <div className="tarjeta-label">Kg despachados (vista)</div>
              <div className="tarjeta-valor">{dash.despachoKg}</div>
              <div className="tarjeta-sub">{dash.filasVw} filas · {dash.propietariosActivos} propietarios</div>
            </div>
          </div>

          <div className="progreso-card">
            <div className="progreso-header">
              <span>Progreso (salida cava vs juegos)</span>
              <span>{dash.progreso}%</span>
            </div>
            <div className="barra-ext">
              <div className="barra-int" style={{ width: `${dash.progreso}%` }} />
            </div>
            <div className="tarjeta-sub" style={{ marginTop: '0.5rem' }}>
              Pendientes estimados: {dash.totalJuegosDespachar}
            </div>
          </div>

          <h2 className="section-title">Detalle por propietario</h2>
          <div className="grid-2">
            <div className="panel">
              <table className="tabla">
                <thead>
                  <tr>
                    <th>Propietario</th>
                    <th className="num">Kg</th>
                    <th className="num">Filas</th>
                    <th className="num">Órdenes</th>
                  </tr>
                </thead>
                <tbody>
                  {propRows.length === 0 ? (
                    <tr>
                      <td colSpan={4} style={{ color: 'var(--gris)' }}>
                        Sin datos en el periodo
                      </td>
                    </tr>
                  ) : (
                    propRows.map((r) => (
                      <tr key={r.propietario}>
                        <td>{r.propietario}</td>
                        <td className="num">{Number(r.kg).toLocaleString('es-CO')}</td>
                        <td className="num">{r.filas}</td>
                        <td className="num">{r.ordenes}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
            <div className="panel">
              <div className="tarjeta-label" style={{ marginBottom: '0.5rem' }}>
                Categorías (vista Colbeef)
              </div>
              <table className="tabla">
                <thead>
                  <tr>
                    <th>Categoría</th>
                    <th className="num">Kg</th>
                  </tr>
                </thead>
                <tbody>
                  {catRows.length === 0 ? (
                    <tr>
                      <td colSpan={2} style={{ color: 'var(--gris)' }}>
                        Sin datos
                      </td>
                    </tr>
                  ) : (
                    catRows.map((r) => (
                      <tr key={r.categoria}>
                        <td>{r.categoria}</td>
                        <td className="num">{Number(r.kg).toLocaleString('es-CO')}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      <p className="footer-note">
        Esta versión consulta directamente la base SIRT (solo lectura). Las definiciones de “juego” y
        filtros de tipos de producto se pueden afinar con el negocio en{' '}
        <code>server/services/metrics.js</code>. Rotar credenciales si se compartieron por un canal
        inseguro; use <code>.env</code> local y no lo suba al repositorio.
      </p>
    </div>
  );
}
