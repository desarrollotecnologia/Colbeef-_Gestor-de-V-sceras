# Mapa de pantallas

[← Volver al índice](../README.md) · Fuente: [03-mapa-pantallas.mmd](./03-mapa-pantallas.mmd)

Todas las pantallas viven en `gestor.html`; cada módulo tiene el botón **← Volver al Dashboard**.

```mermaid
flowchart LR
  portal["portal.html<br/>nombre del operador"] --> dash["Dashboard<br/>fecha de operación · auto-refresco"]
  logo["5 clics en el logo + contraseña"] --> usab["usabilidad.html<br/>estadísticas · export Excel"]

  dash --> tar["Tarjetas<br/>En cava · Decomisos · Crudas<br/>Adicionales · Incompletos<br/>Total a despachar · barra de progreso"]
  tar --> m_inc["Modal Incompletos"]
  dash --> m_opl["Modal OPL"]
  m_opl --> opl_prog["Pestaña Progreso<br/>Total · Despachados · Pendientes · %<br/>Recalcular ahora"]
  m_opl --> opl_cfg["Pestaña Configuración<br/>propietario → OPL"]

  dash --> deco["Decomisos"]
  deco --> deco_tab["Cruce decomisos × salidas<br/>vistas SIRT"]
  deco --> deco_pdf["Generar PDF → Historial"]

  dash --> desp["Despachos"]
  desp --> desp_tab["Tabla por puesto<br/>Cabeza · Patas · VB · VR"]
  desp_tab --> m_det["Modal detalle de puesto"]
  desp --> desp_asig["Juegos asignados del día<br/>normales vs adicionales (≥ 15:30)"]
  desp --> desp_diag["Detalle línea a línea SIRT · CSV"]

  dash --> inf["Informe laboral"]
  inf --> inf_tabs["Inventario frío · Ocupación cavas<br/>Carros percheros · novedades"]
  inf --> inf_png["Generar informe PNG"]

  dash --> hist["Historial PDF<br/>filtro Hoy · 7 días · rango"]

  dash --> crud["Crudas<br/>solo turno del día"]
  crud --> crud_tab["Tabla puesto · cantidad · OPL · códigos"]
  crud --> crud_xls["Excel por OPL · Excel general"]

  dash --> plan["Planilla de puntos"]
  plan --> plan_vista["Por puesto / por zona<br/>botones por OPL · resumen general"]
  plan --> m_plazas["Modal Configurar plazas"]
  plan --> m_part["Modal Particulares<br/>Excel multi-hoja de pendientes"]
  plan --> plan_pdf["Exportar PDF"]
```
