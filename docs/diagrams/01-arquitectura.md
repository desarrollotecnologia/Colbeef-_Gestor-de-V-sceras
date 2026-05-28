# Arquitectura general

[← Volver al índice](../README.md) · Fuente: [01-arquitectura.mmd](./01-arquitectura.mmd)

```mermaid
flowchart TB
  subgraph EXT[Fuente de datos externa (AppSheet / sistema operativo)]
    ext_salidas[Salidas de Cava<br/>POST /sync/salidas-cava]
    ext_productos[Productos en Cava<br/>POST /sync/productos-cava]
    ext_decomisos[Decomisos<br/>POST /sync/decomisos]
    ext_adic_upload[Adic. Upload]
  end

  subgraph BE[Backend — Node.js + Express]
    subgraph BE_LOGIC[Lógica de negocio — gestor/engine.js]
      logic1[codigoBase() · detectarTurno()]
      logic2[cruzarDecomisos()]
      logic3[calcularProgreso()]
      logic4[procesarDespachos()]
      logic5[detectarCrudas() · calcularPlanilla()]
    end

    subgraph BE_API[API Routes]
      api_dash[/api/dashboard]
      api_decom[/api/decomisos · /api/despachos]
      api_opl[/api/opl · /api/crudas]
      api_plan[/api/planilla · /api/adicionales]
      api_rpc[/api/rpc]
      api_sync[/sync/* objetivo]
    end

    subgraph BE_SVC[Servicios]
      svc_pupp[Puppeteer PDF]
      svc_sheet[SheetJS Excel]
      svc_sirt[sirtSync.js → PostgreSQL]
    end
  end

  subgraph DB[PostgreSQL + estado sesión]
    pg[(Vistas SIRT / tablas)]
    state[gestor-state.json]
  end

  FE[Frontend — gestor.html<br/>CSS vars · auto-refresh 60s]

  ext_salidas --> api_sync
  ext_productos --> api_sync
  ext_decomisos --> api_sync
  ext_adic_upload --> api_plan

  svc_sirt --> BE_LOGIC
  BE_API --> BE_LOGIC
  BE_LOGIC --> pg
  BE_LOGIC --> state
  BE_API --> FE
  BE_SVC --> BE_API
```
