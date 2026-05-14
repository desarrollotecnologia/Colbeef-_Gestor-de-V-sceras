# Colbeef · Gestor de vísceras (SIRT + UI Apps Script)

- **Interfaz completa** del Apps Script (`client/gestor.html`): mismos módulos y flujos, conectada al backend por `POST /api/rpc` (shim `google.script.run`).
- **Datos operativos**: se **leen desde PostgreSQL (SIRT)**; no hace falta subir Excel. La “sesión” (resúmenes, OPL, histórico local, planilla consolidada) se guarda en `server/data/gestor-state.json`.
- **API REST** previa (`/api/dashboard`, exportes Excel/PDF de resumen) sigue disponible para el cliente React (`index.html`).

## Gestor tipo Apps Script (recomendado)

1. Terminal 1: `node server/index.js`
2. Terminal 2: `npm run dev:client`
3. Abrir **http://localhost:5173/gestor.html**

En **Decomisos** y **Despachos**, el botón **Procesar** sincroniza desde SIRT y aplica la misma lógica que el Apps Script (cruce, turnos, OPL, etc.). Las cajas de archivo son opcionales / legacy.

Variables útiles:

- `SIRT_SYNC_DAYS` — días hacia atrás para sincronizar tablas (por defecto 120).
- `SIRT_DECOMISO_EXTRA_DAYS_BEFORE` / `SIRT_DECOMISO_EXTRA_DAYS_AFTER` — al consultar **un solo día**, el reporte `sai.decomiso` puede ampliarse (por defecto 1 día antes) porque `fecha_registro` a menudo cae en el día hábil anterior al corte de estado; ponga `BEFORE=0` para exigir el mismo día calendario.

---

## Cliente React (resumen directo BD)

Aplicación ligera: **PostgreSQL SIRT** solo lectura en métricas agregadas.

## Requisitos

- Node.js 18+
- Red al servidor PostgreSQL (`POSTGRES_HOST`)

## Configuración

1. Copie `.env.example` a `.env` y complete credenciales (no suba `.env` a git).

2. Instalación:

```bash
npm install
```

## Desarrollo

Terminal 1 — API:

```bash
node server/index.js
```

Terminal 2 — interfaz (Vite, proxy `/api` → `localhost:3001`):

```bash
npm run dev:client
```

Abra `http://localhost:5173`.

O en un solo comando:

```bash
npm run dev
```

## Producción

```bash
npm run build
set NODE_ENV=production
node server/index.js
```

Sirve API y archivos estáticos desde `client/dist` en el mismo puerto (`SERVER_PORT`, por defecto 3001).

## Endpoints

- `POST /api/rpc` — cuerpo JSON `{ "method": "...", "args": [...] }`; usado por `gestor.html` vía el shim `google.script.run`
- `GET /api/health` — comprueba conexión
- `GET /api/dashboard?days=7` — KPIs
- `GET /api/despachos-propietario?days=7`
- `GET /api/categorias?days=7`
- `GET /api/export/resumen.xlsx?days=7` — Excel generado en servidor
- `GET /api/export/resumen.pdf?days=7` — PDF generado en servidor

Opcional: `from=YYYY-MM-DD&to=YYYY-MM-DD` en lugar de `days`.

## Lógica de datos

Definida en `server/services/metrics.js` sobre tablas/vistas detectadas en SIRT:

- `trazabilidad_proceso.parte_producto` + `tipo_parte_producto` (juegos y crudas)
- `trazabilidad_proceso.parte_producto_cava_riel` (salidas de cava)
- `sai.decomiso`
- `trazabilidad_proceso.vw_producto_vendido_colbeef` (despachos / kg por propietario y categoría)

El gestor y las métricas de despacho usan la **misma consulta agrupada** que la vista (tablas `desposte.*` + `vehiculo_asignado`), con el filtro de fecha **dentro** de la subconsulta para mejor plan de ejecución. Para ver o actualizar la definición oficial de la vista: `npm run view-def` (requiere `.env`).

**Cruce decomisos (paridad Apps Script):** se compara `parte_producto.id_producto` con `sai.decomiso` (`codigo_maquina` o `id`) usando clave normalizada (`trim` + minúsculas) y, si hace falta, el prefijo numérico `codigoBase` (mismo criterio que el conteo de juegos cuando el Excel traía código corto en decomiso).

Ajuste filtros de tipos de producto y ventanas de fechas según reglas del negocio.

## Scripts de inspección

- `npm run probe` — lista tablas
- `npm run search-tables` — tablas por palabras clave
- `node scripts/describe-one.mjs esquema.tabla` — columnas
