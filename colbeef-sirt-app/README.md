# Colbeef · Gestor de vísceras (SIRT + UI Apps Script)

- **Interfaz completa** del Apps Script (`client/gestor.html`): mismos módulos y flujos, conectada al backend por `POST /api/rpc` (shim `google.script.run`).
- **Datos operativos**: se **leen directamente desde PostgreSQL/SIRT**. El único upload manual es el `.xlsx` de **Salidas de Cava Adicionales**.
- **API REST**: expone los endpoints del gestor (`/api/dashboard`, `/api/decomisos`, `/api/despachos`, `/api/opl`, `/api/crudas`, `/api/planilla`, `/api/adicionales`, `/api/historico`, `/api/analytics`).

## Gestor (interfaz única)

Abra **http://localhost:3001/gestor.html** (o el enlace de red que muestra el servidor, p. ej. `http://192.168.20.205:3001/gestor.html`).

Incluye tablero, decomisos, despachos, OPL, crudas, planilla, informes, PDF, analytics y adicionales. Los enlaces antiguos a `/gestor-v2.html` redirigen automáticamente aquí.

## Desarrollo con recarga (Vite)

1. Terminal 1: `node server/index.js`
2. Terminal 2: `npm run dev:client`
3. Abrir **http://localhost:5173/gestor.html**

En **Decomisos** y **Despachos**, el botón **Procesar** consulta SIRT y arma las matrices equivalentes a `Estado_Cavas`, `Reporte_Decomisos` y `Despachos_Cavas`, aplicando la misma lógica que el Apps Script.

Variables requeridas:

- `POSTGRES_HOST`
- `POSTGRES_PORT`
- `POSTGRES_DB`
- `POSTGRES_USER`
- `POSTGRES_PASSWORD`
- `SERVER_PORT=3001`

---

## Cliente React

`index.html` muestra una entrada liviana al gestor. La SPA operativa completa está en `gestor.html`.

## Requisitos

- Node.js 18+
- Acceso de red a PostgreSQL/SIRT.

## Configuración

1. Copie `.env.example` a `.env` y complete credenciales (no suba `.env` a git).

2. Instalación:

```bash
npm install
```

## Desarrollo (red local / compartir enlace)

Un solo comando (API + Vite en `0.0.0.0`):

```bash
npm run dev
```

Abra en esta PC: `http://localhost:5173/gestor.html`  
En otros equipos de la misma red: `http://<IP-de-esta-PC>:5173/gestor.html`  
(El enlace aparece en consola del servidor y en el botón **Copiar enlace** del gestor.)

Opcional en `.env`: `LAN_SHARE_IP=192.168.x.x` para fijar la IP mostrada.

## Producción en red (un solo puerto, recomendado para compartir)

```bash
npm run start:lan
```

Abra `http://<IP-de-esta-PC>:3001/gestor.html` desde cualquier equipo en la LAN.

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
- `GET /api/health` — comprueba conexión a BD.
- `GET /api/dashboard` — KPIs desde SIRT.
- `GET /api/salidas` — productos en cava (`?date=YYYY-MM-DD` o `from`/`to`)
- `GET /api/en-cava` — alias de salidas (inventario en cava)
- `GET /api/decomisos`
- `GET /api/decomisos/detalle` — decomisos SAI (ventana automática de 7 días hasta la fecha consultada)
- `POST /api/decomisos/resumir`
- `GET /api/decomisos/pdf`
- `GET /api/despachos`
- `POST /api/despachos/procesar`
- `GET /api/opl/config`, `POST /api/opl/config`, `DELETE /api/opl/config/:idx`
- `GET /api/opl/progreso`, `POST /api/opl/calcular`
- `GET /api/crudas`
- `GET /api/planilla`
- `POST /api/adicionales`
- `GET /api/historico/pdf`, `GET /api/historico/opl`
- `GET /api/analytics`
- `POST /api/limpiar`

## Lógica de datos

La lectura de SIRT está en `server/gestor/sirtSync.js`; allí se convierten consultas SQL a las matrices que espera el motor del gestor. La lógica del Apps Script adaptada está en `server/gestor/engine.js` y `server/gestor/engineUtils.js`.

## Scripts de inspección

- `npm run probe` — lista tablas
- `npm run search-tables` — tablas por palabras clave
- `node scripts/describe-one.mjs esquema.tabla` — columnas
