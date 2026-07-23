/**
 * Datos y renderizado del Informe Laboral.
 *
 * La información editable se conserva en el estado local, mientras beneficio e
 * inventario pueden enriquecerse desde SIRT. La salida es HTML autocontenido
 * que el navegador puede convertir a PNG mediante html2canvas.
 */
import { loadState, saveState } from './store.js';
import { fetchAnimalesBeneficiadosDia } from './sirtSync.js';
import {
  CAVAS_DEFAULT,
  calcularTotalesCavas,
  participacionFila,
  fusionarInventarioSirtEnCavas,
} from './informeCavasUtils.js';

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

/**
 * Obtiene el formulario guardado, completa beneficio e inventario y calcula
 * totales con las mismas fórmulas usadas en la exportación.
 */
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

  const inventarioVacio = !(base.cavas || []).some((c) => Number(c.inventario || 0) > 0);
  if (inventarioVacio && s.estadoFromRow12?.length) {
    const fusion = fusionarInventarioSirtEnCavas(base.cavas, s.estadoFromRow12, {
      beneficioDia: base.beneficioDia,
    });
    if (fusion.desdeSirt) base.cavas = fusion.cavas;
  }

  const cavasTotales = calcularTotalesCavas(base.cavas || []);
  return { success: true, ...base, fechaConsulta: fechaIso, cavasTotales };
}

/** Valida la estructura fija de cinco cavas y cinco grupos de percheros. */
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

/** Endpoint/RPC de cálculo sin persistencia para previsualización en la UI. */
export async function calcularTotalesInformeCavas(payload) {
  const data = typeof payload === 'string' ? JSON.parse(payload || '[]') : payload;
  const cavas = Array.isArray(data) ? data : data?.cavas;
  if (!Array.isArray(cavas) || cavas.length !== 5) {
    return { success: false, message: 'cavas debe tener exactamente 5 elementos.' };
  }
  return { success: true, ...calcularTotalesCavas(cavas) };
}

/** Elimina únicamente el borrador del informe; no modifica información SIRT. */
export async function limpiarInformeDatos() {
  const s = await loadState();
  s.informe = null;
  await saveState(s);
  return { success: true };
}

/**
 * Construye el informe oficial con las secciones seleccionadas por el usuario.
 * Todo texto procedente de datos se escapa antes de insertarse en el HTML.
 */
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
    <div class="beneficio-block">
      <div class="beneficio-accent"></div>
      <div class="beneficio-lbl">ANIMALES BENEFICIADOS</div>
      <div class="beneficio-num">${Number(d.beneficioDia || 0)}</div>
    </div>`
    : '';

  let invSection = '';
  if (opts.inclInv) {
    const novRows =
      (d.novedades || [])
        .map((n) => `<tr><td class="left">${escHtml(n.cod)}</td><td class="left">${escHtml(n.desc)}</td></tr>`)
        .join('') ||
      '<tr><td colspan="2" class="empty-cell">Sin novedades registradas</td></tr>';
    invSection = `
    <h2 class="sec-title">INVENTARIO PRODUCTO FRÍO EN CAVA</h2>
    <div class="metric-row three">
      <div class="metric">
        <div class="metric-bar green"></div>
        <div class="metric-lbl">JUEGOS COMPLETOS</div>
        <div class="metric-val green">${Number(d.completos || 0)}</div>
      </div>
      <div class="metric">
        <div class="metric-bar red"></div>
        <div class="metric-lbl">JUEGOS INCOMPLETOS</div>
        <div class="metric-val red">${Number(d.incompletos || 0)}</div>
      </div>
      <div class="metric">
        <div class="metric-bar blue"></div>
        <div class="metric-lbl">TOTAL JUEGOS</div>
        <div class="metric-val blue">${total}</div>
      </div>
    </div>
    <h3 class="sub-sec">NOVEDADES POR CÓDIGO</h3>
    <table class="tbl">
      <thead><tr><th>CÓDIGO</th><th>DETALLE</th></tr></thead>
      <tbody>${novRows}</tbody>
    </table>`;
  }

  let cavasSection = '';
  if (opts.inclCavas) {
    const tot = calcularTotalesCavas(d.cavas || []);
    const cavasRows = (d.cavas || [])
      .map((c) => {
        const carros = Number(c.carros || 0);
        const capPor = Number(c.capPorCarro || 0);
        const cap = carros * capPor;
        const inv = Number(c.inventario || 0);
        const pct = participacionFila(c);
        return `<tr>
          <td class="left">${escHtml(c.grupo)}</td>
          <td>x ${carros}</td>
          <td>${cap}</td>
          <td>${inv}</td>
          <td class="col-pct">${pct}%</td>
        </tr>`;
      })
      .join('');
    cavasSection = `
    <h2 class="sec-title">OCUPACIÓN CAVAS VÍSCERAS</h2>
    <table class="tbl cavas">
      <thead><tr><th>CAVA</th><th>CARROS</th><th>CAPACIDAD TOTAL</th><th>INVENTARIO TOTAL</th><th>PARTICIPACIÓN</th></tr></thead>
      <tbody>
        ${cavasRows}
        <tr class="total-row">
          <td class="left" colspan="3">TOTAL GENERAL</td>
          <td>${tot.juegosEquivalentes.toFixed(2)}</td>
          <td class="col-pct">${tot.ocupacionPct}%</td>
        </tr>
      </tbody>
    </table>`;
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
      <h3 class="sub-sec">DISTRIBUCIÓN POR CAVAS</h3>
      <table class="tbl">
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
    <h2 class="sec-title">DISPONIBILIDAD DE CARROS PERCHEROS</h2>
    <div class="metric-row four">
      <div class="metric">
        <div class="metric-bar blue"></div>
        <div class="metric-lbl">STOCK TOTAL</div>
        <div class="metric-val blue">${stockTotal}</div>
      </div>
      <div class="metric">
        <div class="metric-bar red"></div>
        <div class="metric-lbl">DAÑADOS</div>
        <div class="metric-val red">${danados}</div>
      </div>
      <div class="metric">
        <div class="metric-bar orange"></div>
        <div class="metric-lbl">EN USO</div>
        <div class="metric-val orange">${totalEnUso}</div>
      </div>
      <div class="metric">
        <div class="metric-bar ${bajo ? 'red' : 'green'}"></div>
        <div class="metric-lbl">DISPONIBLES${bajo ? ' ⚠' : ''}</div>
        <div class="metric-val ${bajo ? 'red' : 'green'}">${disponibles}</div>
      </div>
    </div>
    ${distSection}`;
  }

  const sinSecciones =
    !beneficioSection && !invSection && !cavasSection && !percherosSection;

  const fechaSlug = fecha.replace(/\//g, '-');
  const scriptSrc = origin ? `${origin}/vendor/html2canvas.min.js` : '/vendor/html2canvas.min.js';

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
    body{font-family:Arial,Helvetica,sans-serif;background:#e8ecef;padding:20px 16px;color:#1a1a1a;}
    #report{max-width:920px;margin:0 auto;background:#fff;padding:28px 32px 24px;}
    .doc-title{font-size:20px;font-weight:800;color:#1e3a5f;text-align:center;text-transform:uppercase;letter-spacing:.5px;line-height:1.25;}
    .doc-sub{font-size:11px;color:#6b7280;text-align:center;margin-top:8px;text-transform:uppercase;letter-spacing:.4px;}
    .doc-rule{border:none;border-top:3px solid #2d8a4e;margin:14px 0 22px;}
    .beneficio-block{text-align:center;margin-bottom:28px;padding-bottom:8px;}
    .beneficio-accent{width:56px;height:4px;background:#7c3aed;margin:0 auto 12px;border-radius:2px;}
    .beneficio-lbl{font-size:11px;font-weight:600;color:#6b7280;letter-spacing:.6px;text-transform:uppercase;}
    .beneficio-lbl::before{content:'🐄 ';font-size:12px;}
    .beneficio-num{font-size:52px;font-weight:800;color:#7c3aed;line-height:1.05;margin-top:6px;}
    .sec-title{font-size:13px;font-weight:800;color:#2d8a4e;text-transform:uppercase;letter-spacing:.5px;text-align:center;margin:26px 0 14px;}
    .sub-sec{font-size:11px;font-weight:800;color:#2d8a4e;text-transform:uppercase;letter-spacing:.4px;margin:18px 0 8px;}
    .metric-row{display:flex;gap:0;justify-content:center;margin-bottom:6px;border:1px solid #e5e7eb;}
    .metric-row.three .metric{flex:1;max-width:33.33%;}
    .metric-row.four .metric{flex:1;max-width:25%;}
    .metric{padding:12px 10px 14px;text-align:center;border-right:1px solid #e5e7eb;background:#fff;}
    .metric:last-child{border-right:none;}
    .metric-bar{height:4px;width:100%;margin-bottom:10px;border-radius:1px;}
    .metric-bar.green{background:#27ae60;}.metric-bar.red{background:#e74c3c;}.metric-bar.blue{background:#3498db;}.metric-bar.orange{background:#f39c12;}
    .metric-lbl{font-size:9px;font-weight:700;color:#6b7280;text-transform:uppercase;letter-spacing:.35px;margin-bottom:4px;}
    .metric-val{font-size:36px;font-weight:800;line-height:1;}
    .metric-val.green{color:#27ae60;}.metric-val.red{color:#e74c3c;}.metric-val.blue{color:#3498db;}.metric-val.orange{color:#f39c12;}
    .tbl{width:100%;border-collapse:collapse;font-size:11px;margin-bottom:4px;}
    .tbl th,.tbl td{border:1px solid #d1d5db;padding:6px 8px;text-align:center;}
    .tbl th{background:#2d8a4e;color:#fff;font-weight:700;font-size:10px;text-transform:uppercase;letter-spacing:.3px;}
    .tbl td.left{text-align:left;}
    .tbl.cavas tbody td{background:#fff5f5;}
    .tbl.cavas tbody td.col-pct{background:#fef9c3;}
    .tbl .empty-cell{text-align:center;color:#9ca3af;font-style:italic;padding:10px;}
    .tbl tr.total-row td{background:#2d8a4e;color:#fff;font-weight:700;border-color:#2d8a4e;}
    .tbl tr.total-row td.col-pct{background:#2d8a4e;color:#fff;}
    .tbl tr.min-row td{background:#f0fdf4;font-weight:600;}
    .tbl td.bajo-min{color:#dc2626;font-weight:700;}
    .doc-footer{margin-top:28px;padding-top:12px;border-top:2px solid #2d8a4e;text-align:center;font-size:10px;color:#6b7280;line-height:1.5;}
    .doc-footer strong{color:#2d8a4e;}
    .aviso-vacio{text-align:center;color:#9ca3af;padding:32px 16px;font-size:12px;}
    .export-btn{display:block;margin:16px auto 0;padding:10px 24px;background:#2d8a4e;color:#fff;border:none;border-radius:4px;font-size:13px;cursor:pointer;font-weight:700;}
    .export-btn:hover{background:#236b3d;}
    @media print{
      body{background:#fff;padding:0;}
      #report{max-width:none;padding:16px;}
      .export-btn{display:none;}
    }
  </style>
</head>
<body>
  <div id="report">
    <h1 class="doc-title">Gestión del Área de Vísceras</h1>
    <p class="doc-sub">Informe generado el: ${escHtml(fecha)}</p>
    <hr class="doc-rule">
    ${beneficioSection}
    ${invSection}
    ${cavasSection}
    ${percherosSection}
    ${sinSecciones ? '<div class="aviso-vacio">No hay secciones seleccionadas. Marque al menos una opción en «Incluir en el informe».</div>' : ''}
    <div class="doc-footer">
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
