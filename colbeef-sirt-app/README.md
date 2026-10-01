# Colbeef · Gestor de vísceras (SIRT + UI Apps Script)

- **Interfaz completa** del Apps Script (`client/gestor.html`): mismos módulos y flujos, conectada al backend por `POST /api/rpc` (shim `google.script.run`).
- **Datos operativos**: se **leen directamente desde PostgreSQL/SIRT**. El único upload manual es el `.xlsx` de **Salidas de Cava Adicionales**.
- **API REST**: expone los endpoints del gestor (`/api/dashboard`, `/api/decomisos`, `/api/despachos`, `/api/opl`, `/api/crudas`, `/api/crudas/excel`, `/api/planilla`, `/api/adicionales`, `/api/historico`, `/api/auth`, `/api/usability`). Lista completa en [Endpoints](#endpoints).
- **Persistencia propia**: MySQL `colbeef_gestor` en el 205, con respaldo en JSON (`server/data/`).

## Gestor (interfaz única)

Abra **http://localhost:3001/gestor.html** (o el enlace de red que muestra el servidor, p. ej. `http://192.168.20.205:3001/gestor.html`).

Incluye tablero, decomisos, despachos, OPL, crudas, planilla, informes, PDF y adicionales. Los enlaces antiguos a `/gestor-v2.html` redirigen automáticamente aquí.

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

### MySQL propio (servidor 205)

SIRT sigue en PostgreSQL (solo lectura). En el **mismo PC 205** instale MySQL y configure en `.env`:

```env
GESTOR_MYSQL_ENABLED=true
GESTOR_MYSQL_HOST=127.0.0.1
GESTOR_MYSQL_PORT=3306
GESTOR_MYSQL_DB=colbeef_gestor
GESTOR_MYSQL_USER=gestor
GESTOR_MYSQL_PASSWORD="su_clave"
```

Al arrancar el gestor (`npm start` / servicio Windows) crea la base `colbeef_gestor` y las tablas si faltan. Para probar:

```bash
npm run mysql:init
```

**Una sola vez en el 205 (como root de MySQL):**

```sql
CREATE DATABASE IF NOT EXISTS colbeef_gestor
  CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE USER IF NOT EXISTS 'gestor'@'localhost' IDENTIFIED BY 'su_clave';
GRANT ALL PRIVILEGES ON colbeef_gestor.* TO 'gestor'@'localhost';
FLUSH PRIVILEGES;
```

Si el usuario `gestor` también tiene permiso `CREATE`, el Node puede crear la BD solo.  
Tablas: `usuarios`, `auditoria`, `usability_events`, `sesion_lock`, `gestor_state`, `schema_meta`.  
Si MySQL no está disponible, el programa sigue con JSON local.

### Acceso (solo nombre)

`/portal.html` pide el **nombre del operador** (sin contraseña) y abre el gestor.  
Ese nombre se usa en usabilidad, auditoría y PDF.

Panel usabilidad: **5 clics** en el logo + contraseña `USABILITY_ADMIN_PASSWORD` del `.env`.  
También: `http://IP:3001/usabilidad.html`

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

### Actualizar cambios en el servidor 205

Doble clic (o clic derecho → Ejecutar como administrador):

- `colbeef-sirt-app\actualizar-y-reiniciar.bat`
- o desde la raíz del repo: `actualizar-y-reiniciar.bat`

Hace: `git pull` → `npm install` → `npm run build` → reinicia el servicio **Colbeef SIRT API**.

### Arranque atado a MySQL

El gestor **no arranca sin su MySQL**: es preferible que no esté a que se trabaje
una jornada sobre el JSON local sin que nadie lo note. Al arrancar espera a la
base hasta `GESTOR_MYSQL_ESPERA_SEGUNDOS` (90 por defecto), porque Windows marca
`MySQL80` como iniciado antes de que acepte conexiones. Si MySQL se cae con la
operación en marcha el gestor sigue sobre el JSON y reconecta solo, subiendo a
la base lo trabajado mientras estuvo caída.

Salida de emergencia para operar sin base de datos: `GESTOR_MYSQL_OBLIGATORIO=false`.

Si MySQL tarda más de lo que aguantan los reintentos del servicio, este se queda
abajo. Para cubrirlo, una vez por máquina (clic derecho → Ejecutar como
administrador):

- `instalar-tarea-arranque.bat` — registra la tarea **Colbeef Gestor Visceras -
  Arranque**, que al encender espera a que MySQL acepte consultas y entonces deja
  el gestor arriba. Corre como SYSTEM: sin ventanas ni permisos que aceptar.
- `iniciar-gestor.bat` — lo mismo, a mano.

Registro de esos arranques: `server\data\arranque-gestor.log`.

También conviene que el servicio dependa de MySQL80, para que Windows respete el
orden:

```bat
sc config colbeefsirtapi.exe depend= MySQL80
```

## Producción

```bash
npm run build
set NODE_ENV=production
node server/index.js
```

Sirve API y archivos estáticos desde `client/dist` en el mismo puerto (`SERVER_PORT`, por defecto 3001).

## Endpoints

- `POST /api/rpc`: cuerpo JSON `{ "method": "...", "args": [...] }`. Lo usa `gestor.html` vía el shim `google.script.run`; solo acepta métodos de la lista blanca de `server/gestor/rpc.js`.
- `GET /api/health`: comprueba la conexión a SIRT. `GET /api/info`: versión, build y enlace de red.
- `POST /api/auth/login`, `POST /api/auth/logout`, `GET /api/auth/me`, `POST /api/auth/users` (admin). Solo aplican con `GESTOR_AUTH_REQUIRED=true`.
- `GET /api/dashboard`: KPIs desde SIRT.
- `GET /api/salidas`: productos en cava (`?date=YYYY-MM-DD` o `from`/`to`). `GET /api/en-cava` y `GET /api/stock`: inventario en cava.
- `GET /api/decomisos`, `GET /api/decomisos/detalle` (decomisos SAI, ventana de 7 días hasta la fecha consultada), `POST /api/decomisos/resumir`, `GET /api/decomisos/pdf`
- `GET /api/despachos`, `POST /api/despachos/procesar`, `GET /api/despachos/detalle/:puesto`, `GET /api/despachos-propietario`
- `GET /api/opl/config`, `POST /api/opl/config`, `DELETE /api/opl/config/:idx`
- `GET /api/opl/progreso`, `POST /api/opl/calcular`
- `GET /api/crudas`: crudas asignadas al turno del día.
- `GET /api/crudas/excel`: Excel con una hoja por OPL. Con `?modo=general` devuelve una sola hoja ordenada por OPL y puesto. Ambos llevan filtros y encabezados en verde; el total va en la cabecera `X-Crudas-Total`.
- `GET /api/planilla`, `GET|POST /api/planilla/particulares`
- `GET /api/planilla/excel-particulares`: una hoja por OPL, solo pendientes. Con `&general=1` (todos los OPL marcados) agrega de primera la hoja General. Cada fila trae fecha y hora de asignación; las asignadas desde las 15:30 van en azul claro.
- `POST /api/adicionales`: carga del `.xlsx` de salidas adicionales.
- `GET /api/historico/pdf`, `GET /api/historial/pdf/:id`
- `GET /api/categorias`, `GET /api/export/resumen.xlsx`, `GET /api/export/resumen.pdf`
- `POST /api/usability/event`, `POST /api/usability/login`, `GET /api/usability/stats`, `GET /api/usability/export`, `GET /api/usability/export.xlsx`, `GET /api/usability/enlace`
- `POST /api/limpiar`

## Lógica de datos

La lectura de SIRT está en `server/gestor/sirtSync.js`; allí se convierten consultas SQL a las matrices que espera el motor del gestor. La lógica del Apps Script adaptada está en `server/gestor/engine.js` y `server/gestor/engineUtils.js`.

### Progreso OPL (modelo SIRT)

El gestor calcula el avance por operador logístico con **juegos completos** (4 subproductos por animal), no por pieza suelta ni solo Vísceras Rojas.

| Concepto | Fuente |
|----------|--------|
| Día operativo | Empieza a las 4:00 (`GESTOR_DIA_OPERATIVO_CORTE_HORA`); lo anterior cuenta para el día previo. |
| Pendientes | Animales con alguna pieza en cava y ninguna salida hoy. Incluye juegos partidos: si falta una pieza en cava, el animal sigue pendiente. |
| Despachados | Juegos completos (4 tipos) con salida real en SIRT dentro del día operativo. |
| Incompletos | Animales con alguna pieza salida hoy, pero no las 4. |
| Adicionales | Asignaciones hechas a las 15:30 o después (`fecha_registro` + `hora_registro` de `ppel`; `GESTOR_SALIDA_ADICIONAL_HORA/MINUTO`). |
| Meta del día | Máximo entre la meta congelada y `pendientes + despachados + incompletos`. Se guarda por fecha y turno (`oplBaselinesPorDia`, últimos 14 días), así que no baja al despachar ni al consultar otra fecha. |
| Avance | `(meta − pendientes) / meta`. Se queda en 99 % mientras haya algo en cava. |
| Crudas | VB con observación `CRUDAS` asignada al turno del día. La tarjeta, el módulo y los dos Excel usan el mismo criterio. |
| Propietario → OPL | Excepciones en `constants.js`; si no hay excepción, `TRANSCARNES`. |

El modal OPL consulta la misma fecha que el tablero.

**Flujo en planta:** **Sincronizar SIRT** → **Procesar Despachos** → **Recalcular OPL** (modal OPL o tablero).

Los porcentajes **no coinciden con el Excel/App Script histórico** (ese modelo usaba solo VR y `despachados = total − pendientes`). Para validar en planta, compare contra lo que muestra SIRT en despachos y salidas de cava, no contra planillas viejas.

Excepciones OPL incluyen, entre otras: `VARGAS BLANCO REINALDO` → CAVA CAMILO, `VARGAS NIÑO YERSON REYNALDO` → CAVA YERSON.

## Scripts de inspección

- `npm run probe` — lista tablas
- `npm run search-tables` — tablas por palabras clave
- `node scripts/describe-one.mjs esquema.tabla` — columnas
- `node scripts/verificar-fechas-opl.mjs <fechas…>` — meta, pendientes y avance por OPL de varias fechas
- `node scripts/probe-juego.mjs <animal>` — programación y movimientos de cava de cada pieza
- `node scripts/probe-crudas-diferencia.mjs <fecha>` — diferencias entre crudas del módulo y de la tarjeta
- `node scripts/test-crudas-excel.mjs` — arma los dos Excel de crudas con datos del 205

## Documentación

- [README general](../README.md)
- [Diagramas](../docs/README.md): arquitectura, endpoints, pantallas, [flujo operativo](../docs/diagrams/04-flujo-operativo.md) y [cálculo de progreso](../docs/diagrams/05-calculo-progreso.md).
