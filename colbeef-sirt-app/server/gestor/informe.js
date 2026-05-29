import { loadState, saveState } from './store.js';

const CAVAS_DEFAULT = [
  { grupo: 'V. Rojas & Blancas (V.Rojas)', carros: 40, capPorCarro: 20, inventario: 0 },
  { grupo: 'V. Rojas & Blancas (V.Blancas)', carros: 22, capPorCarro: 25, inventario: 0 },
  { grupo: 'V. Acondicionamiento', carros: 22, capPorCarro: 25, inventario: 0 },
  { grupo: 'Patas & Manos', carros: 80, capPorCarro: 9, inventario: 0 },
  { grupo: 'Cabezas', carros: 80, capPorCarro: 9, inventario: 0 },
];

const PERCHEROS_DEFAULT = [
  { cava: 'V. Rojas & Blancas', blancas: 0, rojas: 0, patasManos: 0, cabezas: 0, crudas: 0 },
  { cava: 'V. Acondicionamiento', blancas: 0, rojas: 0, patasManos: 0, cabezas: 0, crudas: 0 },
  { cava: 'Patas & Cabezas', blancas: 0, rojas: 0, patasManos: 0, cabezas: 0, crudas: 0 },
  { cava: 'Recepción', blancas: 0, rojas: 0, patasManos: 0, cabezas: 0, crudas: 0 },
  { cava: 'Retenidos', blancas: 0, rojas: 0, patasManos: 0, cabezas: 0, crudas: 0 },
];

function fmtDateOnly() {
  const d = new Date();
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
}

export async function getInformeDatos() {
  const s = await loadState();
  if (s.informe) return { success: true, ...s.informe };
  return {
    success: true,
    fecha: fmtDateOnly(),
    completos: 0,
    incompletos: 0,
    beneficioDia: 0,
    stockTotal: 100,
    danados: 2,
    novedades: [],
    cavas: JSON.parse(JSON.stringify(CAVAS_DEFAULT)),
    percheros: JSON.parse(JSON.stringify(PERCHEROS_DEFAULT)),
  };
}

export async function guardarInformeDatos(payload) {
  const data = typeof payload === 'string' ? JSON.parse(payload) : payload;
  if (!data) return { success: false, message: 'Payload vacío.' };
  if (!Array.isArray(data.cavas) || data.cavas.length !== 5)
    return { success: false, message: 'cavas debe tener exactamente 5 elementos.' };
  if (!Array.isArray(data.percheros) || data.percheros.length !== 5)
    return { success: false, message: 'percheros debe tener exactamente 5 elementos.' };
  const s = await loadState();
  s.informe = data;
  await saveState(s);
  return { success: true };
}

export async function limpiarInformeDatos() {
  const s = await loadState();
  s.informe = null;
  await saveState(s);
  return { success: true };
}

export async function generarInformeHTML(payload) {
  const opts = typeof payload === 'string' ? JSON.parse(payload || '{}') : payload || {};
  const d = await getInformeDatos();
  if (!d.success) return d;

  const inclBeneficio = Boolean(opts.inclBeneficio);
  const inclInv = Boolean(opts.inclInv);
  const inclCavas = Boolean(opts.inclCavas);
  const inclPerch = Boolean(opts.inclPerch);
  const inclDist = Boolean(opts.inclDist);

  const total = Number(d.completos || 0) + Number(d.incompletos || 0);

  const beneficioSection = inclBeneficio
    ? `
    <div class="section">
      <h2>Beneficio del Día</h2>
      <div class="kpi-row">
        <div class="kpi-card" style="background:#9b59b6;">
          <div class="kpi-label">Animales Beneficiados</div>
          <div class="kpi-value">${d.beneficioDia}</div>
        </div>
      </div>
    </div>`
    : '';

  let invSection = '';
  if (inclInv) {
    const novRows =
      (d.novedades || [])
        .map((n) => `<tr><td>${n.cod || ''}</td><td>${n.desc || ''}</td></tr>`)
        .join('') || '<tr><td colspan="2" style="text-align:center;color:#999;">Sin novedades</td></tr>';
    invSection = `
    <div class="section">
      <h2>Inventario Producto Frío</h2>
      <div class="kpi-row">
        <div class="kpi-card" style="background:#27ae60;">
          <div class="kpi-label">Juegos Completos</div>
          <div class="kpi-value">${d.completos}</div>
        </div>
        <div class="kpi-card" style="background:#e74c3c;">
          <div class="kpi-label">Incompletos</div>
          <div class="kpi-value">${d.incompletos}</div>
        </div>
        <div class="kpi-card" style="background:#3498db;">
          <div class="kpi-label">Total</div>
          <div class="kpi-value">${total}</div>
        </div>
      </div>
      <h3>Novedades por Código</h3>
      <table>
        <thead><tr><th>Código</th><th>Descripción</th></tr></thead>
        <tbody>${novRows}</tbody>
      </table>
    </div>`;
  }

  let cavasSection = '';
  if (inclCavas) {
    let totalCarros = 0;
    let totalCap = 0;
    let totalInv = 0;
    const cavasRows = (d.cavas || [])
      .map((c) => {
        const cap = Number(c.carros || 0) * Number(c.capPorCarro || 0);
        const inv = Number(c.inventario || 0);
        const pct = cap > 0 ? Math.round((inv / cap) * 100) : 0;
        totalCarros += Number(c.carros || 0);
        totalCap += cap;
        totalInv += inv;
        return `<tr><td style="text-align:left;">${c.grupo}</td><td>${c.carros}</td><td>${cap}</td><td>${inv}</td><td>${pct}%</td></tr>`;
      })
      .join('');
    const totalPct = totalCap > 0 ? Math.round((totalInv / totalCap) * 100) : 0;
    cavasSection = `
    <div class="section">
      <h2>Ocupación Cavas</h2>
      <table>
        <thead><tr><th>Cava</th><th>Carros</th><th>Capacidad Total</th><th>Inventario Total</th><th>Participación%</th></tr></thead>
        <tbody>
          ${cavasRows}
          <tr style="background:#27ae60;color:white;font-weight:700;">
            <td style="text-align:left;">TOTAL</td><td>${totalCarros}</td><td>${totalCap}</td><td>${totalInv}</td><td>${totalPct}%</td>
          </tr>
        </tbody>
      </table>
    </div>`;
  }

  let percherosSection = '';
  if (inclPerch) {
    const totalEnUso = (d.percheros || []).reduce(
      (sum, p) =>
        sum +
        Number(p.blancas || 0) +
        Number(p.rojas || 0) +
        Number(p.patasManos || 0) +
        Number(p.cabezas || 0) +
        Number(p.crudas || 0),
      0
    );
    const disponibles = Number(d.stockTotal || 0) - Number(d.danados || 0) - totalEnUso;
    const bajoBadge =
      disponibles < 30
        ? `<span style="background:#e74c3c;color:white;padding:2px 8px;border-radius:4px;font-size:11px;margin-left:6px;">⚠️ BAJO STOCK</span>`
        : '';
    const dispBg = disponibles < 30 ? '#e74c3c' : '#27ae60';

    const MINIMOS = { blancas: 8, rojas: 8, patasManos: 2, cabezas: 5, crudas: 1 };
    let distSection = '';
    if (inclDist) {
      const chk = (val, min) => (Number(val || 0) < min ? ' style="color:#e74c3c;font-weight:700;"' : '');
      const percRows = (d.percheros || [])
        .map(
          (p) => `
        <tr>
          <td style="text-align:left;">${p.cava}</td>
          <td${chk(p.blancas, MINIMOS.blancas)}>${p.blancas || 0}</td>
          <td${chk(p.rojas, MINIMOS.rojas)}>${p.rojas || 0}</td>
          <td${chk(p.patasManos, MINIMOS.patasManos)}>${p.patasManos || 0}</td>
          <td${chk(p.cabezas, MINIMOS.cabezas)}>${p.cabezas || 0}</td>
          <td${chk(p.crudas, MINIMOS.crudas)}>${p.crudas || 0}</td>
        </tr>`
        )
        .join('');
      distSection = `
      <h3>Distribución por Cava</h3>
      <p style="font-size:11px;color:#888;margin-bottom:6px;">
        Mínimos — VBlancas: ${MINIMOS.blancas} · VRojas: ${MINIMOS.rojas} · PatasManos: ${MINIMOS.patasManos} · Cabezas: ${MINIMOS.cabezas} · Crudas: ${MINIMOS.crudas}
        &nbsp;<span style="color:#e74c3c;">Rojo = bajo mínimo</span>
      </p>
      <table>
        <thead><tr><th>Cava</th><th>Blancas</th><th>Rojas</th><th>Patas/Manos</th><th>Cabezas</th><th>Crudas</th></tr></thead>
        <tbody>${percRows}</tbody>
      </table>`;
    }

    percherosSection = `
    <div class="section">
      <h2>Disponibilidad Percheros</h2>
      <div class="kpi-row">
        <div class="kpi-card" style="background:#3498db;">
          <div class="kpi-label">Stock Total</div>
          <div class="kpi-value">${d.stockTotal}</div>
        </div>
        <div class="kpi-card" style="background:#e74c3c;">
          <div class="kpi-label">Dañados</div>
          <div class="kpi-value">${d.danados}</div>
        </div>
        <div class="kpi-card" style="background:#f39c12;">
          <div class="kpi-label">En Uso</div>
          <div class="kpi-value">${totalEnUso}</div>
        </div>
        <div class="kpi-card" style="background:${dispBg};">
          <div class="kpi-label">Disponibles${bajoBadge}</div>
          <div class="kpi-value">${disponibles}</div>
        </div>
      </div>
      ${distSection}
    </div>`;
  }

  const fechaSlug = d.fecha.replace(/\//g, '-');
  const html = `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>Informe Diario Colbeef – ${d.fecha}</title>
  <script src="/vendor/html2canvas.min.js"></script>
  <style>
    *{box-sizing:border-box;margin:0;padding:0;}
    body{font-family:Arial,sans-serif;background:#f0f2f5;padding:20px;color:#222;}
    #report{max-width:940px;margin:0 auto;background:#fff;border-radius:10px;overflow:hidden;box-shadow:0 3px 12px rgba(0,0,0,.13);}
    .header{background:#1a5c2e;color:#fff;padding:18px 24px;display:flex;align-items:center;justify-content:space-between;gap:16px;}
    .header .logo{font-size:24px;font-weight:800;letter-spacing:2px;}
    .header h1{font-size:16px;font-weight:600;margin-top:4px;opacity:.95;}
    .header .fecha-badge{font-size:12px;opacity:.8;margin-top:3px;}
    .header .firma{text-align:right;font-size:11px;line-height:1.6;opacity:.85;}
    .section{padding:16px 24px;border-bottom:1px solid #e8e8e8;}
    .section:last-of-type{border-bottom:none;}
    .section h2{font-size:14px;font-weight:700;color:#1a5c2e;margin-bottom:12px;text-transform:uppercase;letter-spacing:.5px;}
    .section h3{font-size:12px;font-weight:600;color:#555;margin:14px 0 6px;}
    .kpi-row{display:flex;gap:10px;flex-wrap:wrap;margin-bottom:12px;}
    .kpi-card{border-radius:8px;padding:12px 16px;min-width:120px;color:#fff;}
    .kpi-label{font-size:10px;opacity:.88;margin-bottom:3px;text-transform:uppercase;letter-spacing:.4px;}
    .kpi-value{font-size:30px;font-weight:800;line-height:1;}
    table{width:100%;border-collapse:collapse;font-size:12px;}
    th,td{border:1px solid #ddd;padding:6px 10px;text-align:center;}
    th{background:#f5f5f5;font-weight:600;font-size:11px;}
    tr:nth-child(even) td{background:#fafafa;}
    .footer{padding:12px 24px;text-align:center;font-size:10px;color:#aaa;border-top:1px solid #eee;}
    .export-btn{display:block;margin:14px auto;padding:9px 22px;background:#1a5c2e;color:#fff;border:none;border-radius:6px;font-size:13px;cursor:pointer;font-weight:600;}
    .export-btn:hover{background:#14451f;}
  </style>
</head>
<body>
  <div id="report">
    <div class="header">
      <div>
        <div class="logo">🐄 COLBEEF</div>
        <h1>Informe Diario de Vísceras</h1>
        <div class="fecha-badge">📅 ${d.fecha}</div>
      </div>
      <div class="firma">
        <strong>SERGIO ANAYA</strong><br>
        GESTOR DE VÍSCERAS<br>
        Colbeef S.A.S
      </div>
    </div>
    ${beneficioSection}
    ${invSection}
    ${cavasSection}
    ${percherosSection}
    <div class="footer">
      Documento generado automáticamente · Gestor de Vísceras Colbeef · ${d.fecha}
    </div>
  </div>
  <button class="export-btn" onclick="exportarPNG()">📥 Exportar como PNG</button>
  <script>
    function exportarPNG() {
      if (typeof html2canvas === 'undefined') { alert('html2canvas no disponible'); return; }
      const btn = document.querySelector('.export-btn');
      btn.style.display = 'none';
      html2canvas(document.getElementById('report'), { scale: 2, useCORS: true, backgroundColor: '#fff' })
        .then(function(canvas) {
          const a = document.createElement('a');
          a.download = 'informe-colbeef-${fechaSlug}.png';
          a.href = canvas.toDataURL('image/png');
          a.click();
        })
        .catch(function(e) { alert('Error al exportar: ' + e.message); })
        .finally(function() { btn.style.display = ''; });
    }
  </script>
</body>
</html>`;

  return { success: true, html };
}
