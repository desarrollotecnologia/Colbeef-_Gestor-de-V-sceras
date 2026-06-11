import { loadState, saveState } from './store.js';
import { fetchAnimalesBeneficiadosDia } from './sirtSync.js';

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

function fechaTextoAIso(fecha) {
  const s = String(fecha || '').trim();
  const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (iso) return iso[0];
  const dm = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (dm) {
    return `${dm[3]}-${String(dm[2]).padStart(2, '0')}-${String(dm[1]).padStart(2, '0')}`;
  }
  return null;
}

function resolverFechaInformeIso(opts, s, datos) {
  const fromOpt = fechaTextoAIso(opts?.from || opts?.date);
  if (fromOpt) return fromOpt;
  const fromDatos = fechaTextoAIso(datos?.fecha);
  if (fromDatos) return fromDatos;
  const fromSync = fechaTextoAIso(s.lastSyncRange?.from);
  if (fromSync) return fromSync;
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function isoAFechaTexto(iso) {
  const m = String(iso || '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return fmtDateOnly();
  return `${m[3]}/${m[2]}/${m[1]}`;
}

async function enriquecerBeneficioDesdeSirt(datos, fechaIso) {
  if (!fechaIso) return datos;
  try {
    datos.beneficioDia = await fetchAnimalesBeneficiadosDia({ from: fechaIso, to: fechaIso });
    datos.beneficioFuente = 'sirt';
  } catch {
    datos.beneficioFuente = datos.beneficioFuente || 'manual';
  }
  return datos;
}

function escHtml(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function normalizarOpcionesInforme(opts) {
  return {
    inclBeneficio: Boolean(opts.inclBeneficio ?? opts.beneficio ?? opts.cavas ?? opts.inclCavas),
    inclInv: Boolean(opts.inclInv ?? opts.inv),
    inclCavas: Boolean(opts.inclCavas ?? opts.cavas),
    inclPerch: Boolean(opts.inclPerch ?? opts.percheros ?? opts.perch),
    inclDist: Boolean(opts.inclDist ?? opts.distribucion ?? opts.dist),
  };
}

export async function getInformeDatos(opts = {}) {
  const s = await loadState();
  const base = s.informe
    ? { ...s.informe }
    : {
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
  const fechaIso = resolverFechaInformeIso(opts, s, base);
  base.fecha = isoAFechaTexto(fechaIso);
  await enriquecerBeneficioDesdeSirt(base, fechaIso);
  return { success: true, ...base, fechaConsulta: fechaIso };
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
  const raw = typeof payload === 'string' ? JSON.parse(payload || '{}') : payload || {};
  const opts = normalizarOpcionesInforme(raw);
  const origin = String(raw.origin || '').trim() || '';

  let d;
  if (raw.datos && typeof raw.datos === 'object') {
    d = { success: true, ...raw.datos };
  } else {
    d = await getInformeDatos(raw);
  }
  if (!d.success) return d;

  const fechaIso = resolverFechaInformeIso(raw, await loadState(), d);
  d.fecha = isoAFechaTexto(fechaIso);
  await enriquecerBeneficioDesdeSirt(d, fechaIso);

  const fecha = String(d.fecha || fmtDateOnly());
  const total = Number(d.completos || 0) + Number(d.incompletos || 0);

  const beneficioSection = opts.inclBeneficio
    ? `
    <div class="section">
      <div class="section-title">Beneficio del Día</div>
      <div class="beneficio-box">
        <div class="beneficio-label">ANIMALES BENEFICIADOS</div>
        <div class="beneficio-num">${Number(d.beneficioDia || 0)}</div>
        <div style="font-size:10px;color:#666;margin-top:6px;">Fuente: SIRT · plan de faena (fecha_plan)</div>
      </div>
    </div>`
    : '';

  let invSection = '';
  if (opts.inclInv) {
    const novRows =
      (d.novedades || [])
        .map((n) => `<tr><td>${escHtml(n.cod)}</td><td>${escHtml(n.desc)}</td></tr>`)
        .join('') ||
      '<tr><td colspan="2" style="text-align:center;color:#888;">Sin novedades registradas</td></tr>';
    invSection = `
    <div class="section">
      <div class="section-title">Inventario Producto Frío en Cava</div>
      <div class="kpi-row three">
        <div class="kpi green"><div class="kpi-lbl">Juegos Completos</div><div class="kpi-val">${Number(d.completos || 0)}</div></div>
        <div class="kpi red"><div class="kpi-lbl">Juegos Incompletos</div><div class="kpi-val">${Number(d.incompletos || 0)}</div></div>
        <div class="kpi blue"><div class="kpi-lbl">Total Juegos</div><div class="kpi-val">${total}</div></div>
      </div>
      <div class="sub-title">Novedades por Código</div>
      <table>
        <thead><tr><th>CÓDIGO</th><th>DETALLE</th></tr></thead>
        <tbody>${novRows}</tbody>
      </table>
    </div>`;
  }

  let cavasSection = '';
  if (opts.inclCavas) {
    let totalCarros = 0;
    let totalCap = 0;
    let totalInv = 0;
    const cavasRows = (d.cavas || [])
      .map((c) => {
        const carros = Number(c.carros || 0);
        const capPor = Number(c.capPorCarro || 0);
        const cap = carros * capPor;
        const inv = Number(c.inventario || 0);
        const pct = cap > 0 ? Math.round((inv / cap) * 100) : 0;
        totalCarros += carros;
        totalCap += cap;
        totalInv += inv;
        return `<tr>
          <td class="left">${escHtml(c.grupo)}</td>
          <td>x ${carros}</td>
          <td>${cap}</td>
          <td>${inv}</td>
          <td>${pct}%</td>
        </tr>`;
      })
      .join('');
    const totalPct = totalCap > 0 ? Math.round((totalInv / totalCap) * 100) : 0;
    cavasSection = `
    <div class="section">
      <div class="section-title">Ocupación Cavas Vísceras</div>
      <table>
        <thead><tr><th>CAVA</th><th>CARROS</th><th>CAPACIDAD TOTAL</th><th>INVENTARIO TOTAL</th><th>PARTICIPACIÓN TOTAL</th></tr></thead>
        <tbody>
          ${cavasRows}
          <tr class="total-row">
            <td class="left">TOTAL GENERAL</td>
            <td>—</td>
            <td>${totalCap}</td>
            <td>${totalInv.toFixed(2)}</td>
            <td>${totalPct}%</td>
          </tr>
        </tbody>
      </table>
    </div>`;
  }

  let percherosSection = '';
  if (opts.inclPerch) {
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
    const stockTotal = Number(d.stockTotal || 0);
    const danados = Number(d.danados || 0);
    const disponibles = stockTotal - danados - totalEnUso;
    const bajo = disponibles < 30;

    const MINIMOS = { blancas: 8, rojas: 8, patasManos: 2, cabezas: 5, crudas: 1 };
    let distSection = '';
    if (opts.inclDist) {
      const chk = (val, min) => (Number(val || 0) < min ? ' class="bajo-min"' : '');
      const percRows = (d.percheros || [])
        .map(
          (p) => `
        <tr>
          <td class="left">${escHtml(p.cava)}</td>
          <td${chk(p.blancas, MINIMOS.blancas)}>${Number(p.blancas || 0) || '—'}</td>
          <td${chk(p.rojas, MINIMOS.rojas)}>${Number(p.rojas || 0) || '—'}</td>
          <td${chk(p.patasManos, MINIMOS.patasManos)}>${Number(p.patasManos || 0) || '—'}</td>
          <td${chk(p.cabezas, MINIMOS.cabezas)}>${Number(p.cabezas || 0) || '—'}</td>
          <td${chk(p.crudas, MINIMOS.crudas)}>${Number(p.crudas || 0) || '—'}</td>
        </tr>`
        )
        .join('');
      distSection = `
      <div class="sub-title" style="margin-top:14px;">Distribución por Cavas</div>
      <table>
        <thead><tr><th>CAVAS</th><th>V-BLANCAS</th><th>V-ROJAS</th><th>PATAS/MANOS</th><th>CABEZAS</th><th>CRUDAS</th></tr></thead>
        <tbody>
          <tr class="min-row">
            <td class="left">MÍNIMO PARA INICIAR</td>
            <td>${MINIMOS.blancas}</td><td>${MINIMOS.rojas}</td><td>${MINIMOS.patasManos}</td><td>${MINIMOS.cabezas}</td><td>${MINIMOS.crudas}</td>
          </tr>
          ${percRows}
        </tbody>
      </table>`;
    }

    percherosSection = `
    <div class="section">
      <div class="section-title">Disponibilidad de Carros Percheros</div>
      <div class="kpi-row four">
        <div class="kpi blue"><div class="kpi-lbl">Stock Total</div><div class="kpi-val">${stockTotal}</div></div>
        <div class="kpi red"><div class="kpi-lbl">Dañados</div><div class="kpi-val">${danados}</div></div>
        <div class="kpi orange"><div class="kpi-lbl">En Uso</div><div class="kpi-val">${totalEnUso}</div></div>
        <div class="kpi ${bajo ? 'red' : 'green'}">
          <div class="kpi-lbl">Disponibles ${bajo ? '⚠️' : '✅ OK'}</div>
          <div class="kpi-val">${disponibles}</div>
        </div>
      </div>
      ${distSection}
    </div>`;
  }

  const sinSecciones =
    !beneficioSection && !invSection && !cavasSection && !percherosSection;
  const avisoSinSecciones = sinSecciones
    ? `<div class="section" style="text-align:center;color:#888;padding:32px;">
        No hay secciones seleccionadas. Marque al menos una opción en «Incluir en el informe».
      </div>`
    : '';

  const fechaSlug = fecha.replace(/\//g, '-');
  const scriptSrc = origin ? `${origin}/vendor/html2canvas.min.js` : '/vendor/html2canvas.min.js';
  const logoSrc = origin ? `${origin}/colbeef-icon.png` : '/colbeef-icon.png';

  const html = `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <base href="${origin ? `${origin}/` : '/'}">
  <title>Informe Colbeef – ${escHtml(fecha)}</title>
  <script src="${scriptSrc}"></script>
  <style>
    *{box-sizing:border-box;margin:0;padding:0;}
    body{font-family:Arial,Helvetica,sans-serif;background:#eceff1;padding:16px;color:#1a1a1a;}
    #report{max-width:980px;margin:0 auto;background:#fff;border-radius:4px;overflow:hidden;box-shadow:0 2px 16px rgba(0,0,0,.12);}
    .top-band{background:#1a5c2e;color:#fff;text-align:center;padding:14px 20px 10px;}
    .top-band img{height:52px;margin-bottom:6px;}
    .top-band h1{font-size:15px;font-weight:800;letter-spacing:1px;text-transform:uppercase;}
    .top-band .sub{font-size:11px;opacity:.9;margin-top:4px;letter-spacing:.3px;}
    .meta-bar{background:#f4f6f5;border-bottom:2px solid #1a5c2e;padding:8px 20px;display:flex;justify-content:space-between;align-items:center;font-size:11px;color:#444;}
    .section{padding:14px 20px;border-bottom:1px solid #e5e7eb;}
    .section:last-of-type{border-bottom:none;}
    .section-title{font-size:12px;font-weight:800;color:#1a5c2e;text-transform:uppercase;letter-spacing:.6px;margin-bottom:10px;text-align:center;}
    .sub-title{font-size:11px;font-weight:700;color:#374151;margin:10px 0 6px;text-transform:uppercase;}
    .beneficio-box{text-align:center;padding:12px;background:#f8faf8;border:1px solid #d1e7d7;border-radius:6px;}
    .beneficio-label{font-size:11px;font-weight:700;color:#555;letter-spacing:.5px;}
    .beneficio-num{font-size:42px;font-weight:900;color:#1a5c2e;line-height:1.1;margin-top:4px;}
    .kpi-row{display:flex;gap:8px;flex-wrap:wrap;justify-content:center;margin-bottom:8px;}
    .kpi{border-radius:6px;padding:10px 14px;min-width:110px;text-align:center;color:#fff;flex:1;}
    .kpi.green{background:#27ae60;}.kpi.red{background:#e74c3c;}.kpi.blue{background:#3498db;}.kpi.orange{background:#f39c12;}
    .kpi-lbl{font-size:9px;opacity:.92;text-transform:uppercase;letter-spacing:.4px;margin-bottom:2px;}
    .kpi-val{font-size:28px;font-weight:800;line-height:1;}
    table{width:100%;border-collapse:collapse;font-size:11px;margin-top:4px;}
    th,td{border:1px solid #ccc;padding:5px 8px;text-align:center;}
    th{background:#eef2ef;font-weight:700;font-size:10px;text-transform:uppercase;}
    td.left{text-align:left;}
    tr:nth-child(even) td{background:#fafafa;}
    tr.total-row td{background:#1a5c2e;color:#fff;font-weight:700;}
    tr.min-row td{background:#f0fdf4;font-weight:600;}
    td.bajo-min{color:#dc2626;font-weight:700;}
    .footer{padding:12px 20px;text-align:center;font-size:10px;color:#666;border-top:2px solid #1a5c2e;}
    .footer strong{color:#1a5c2e;}
    .export-btn{display:block;margin:14px auto;padding:10px 24px;background:#1a5c2e;color:#fff;border:none;border-radius:6px;font-size:13px;cursor:pointer;font-weight:700;}
    .export-btn:hover{background:#14451f;}
  </style>
</head>
<body>
  <div id="report">
    <div class="top-band">
      <img src="${logoSrc}" alt="Colbeef" onerror="this.style.display='none'">
      <h1>Gestión del Área de Vísceras</h1>
      <div class="sub">Informe generado el: ${escHtml(fecha)}</div>
    </div>
    <div class="meta-bar">
      <span>📅 ${escHtml(fecha)}</span>
      <span><strong>SERGIO ANAYA</strong> · Gestor de Vísceras · Colbeef S.A.S</span>
    </div>
    ${beneficioSection}
    ${invSection}
    ${cavasSection}
    ${percherosSection}
    ${avisoSinSecciones}
    <div class="footer">
      <strong>SERGIO ANAYA</strong> — GESTOR DE VÍSCERAS<br>
      Documento generado automáticamente · Gestor de Vísceras Colbeef · ${escHtml(fecha)}
    </div>
  </div>
  <button class="export-btn" onclick="exportarPNG()">📥 Exportar como PNG</button>
  <script>
    function exportarPNG() {
      if (typeof html2canvas === 'undefined') {
        alert('html2canvas no disponible. Recargue desde el gestor en el mismo servidor.');
        return;
      }
      var btn = document.querySelector('.export-btn');
      btn.style.display = 'none';
      html2canvas(document.getElementById('report'), { scale: 2, useCORS: true, backgroundColor: '#fff', logging: false })
        .then(function(canvas) {
          var a = document.createElement('a');
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
