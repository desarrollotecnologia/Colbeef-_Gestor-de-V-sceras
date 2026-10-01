# Arquitectura general

[← Volver al índice](../README.md) · Fuente: [01-arquitectura.mmd](./01-arquitectura.mmd)

```mermaid
flowchart TB
  subgraph NAV["Navegador (LAN)"]
    portal["portal.html<br/>nombre del operador"]
    gestor["gestor.html<br/>todos los módulos · fecha de operación"]
    usab["usabilidad.html<br/>panel administrativo"]
    shim["google-script-shim.js<br/>google.script.run → POST /api/rpc"]
  end

  subgraph BE["Servidor 205 · Node.js + Express (puerto 3001, servicio Windows)"]
    idx["server/index.js<br/>rutas REST · archivos estáticos · arranque"]
    rpc["gestor/rpc.js<br/>métodos permitidos por RPC"]
    subgraph MOTOR["Motor del gestor"]
      eng["gestor/engine.js<br/>tablero · OPL · adicionales · incompletos<br/>decomisos · despachos · crudas · planilla"]
      utils["engineUtils.js · constants.js<br/>día operativo 4:00 · corte 15:30 · turnos"]
      sync["gestor/sirtSync.js<br/>SQL parametrizado → matrices del motor"]
    end
    subgraph SALIDAS["Generación de archivos"]
      pdf["PDFKit<br/>PDF de decomisos → historial"]
      xlsx["ExcelJS<br/>Crudas (por OPL / general) · Particulares · usabilidad"]
      png["informe.js<br/>Informe laboral PNG"]
    end
    store["gestor/store.js<br/>estado de la jornada · metas congeladas por fecha"]
    auth["authStore.js · usabilityStore.js<br/>usuarios · auditoría · eventos"]
  end

  subgraph SIRT["SIRT · PostgreSQL (solo lectura)"]
    pg[("trazabilidad_proceso<br/>parte_producto · cava_riel · empresa_local<br/>sai.decomiso · vistas")]
  end

  subgraph MY["MySQL propio (mismo 205)"]
    mysql[("colbeef_gestor<br/>gestor_state · usuarios · auditoria<br/>usability_events · sesion_lock")]
  end
  json[("server/data/gestor-state.json<br/>respaldo local")]

  portal --> gestor
  gestor --> shim --> idx
  gestor -->|"descargas /api/..."| idx
  usab --> idx
  idx --> rpc --> eng
  idx --> eng
  eng --> utils
  eng --> sync --> pg
  eng --> SALIDAS
  eng --> store
  store --> mysql
  store --> json
  idx --> auth --> mysql
```

## Piezas

| Pieza | Qué hace |
|---|---|
| `gestor.html` | Interfaz única con todos los módulos. Llama al servidor con `google.script.run` (el shim lo convierte en `POST /api/rpc`) y descarga archivos por rutas `/api/...`. |
| `server/index.js` | Express en el puerto 3001: rutas REST, archivos estáticos y arranque (espera a MySQL). |
| `gestor/rpc.js` | Lista blanca de métodos que puede invocar la interfaz; los que cambian estado quedan en la auditoría. |
| `gestor/engine.js` | Reglas de negocio: tablero, progreso OPL, adicionales, incompletos, decomisos, despachos, crudas, planilla. |
| `gestor/sirtSync.js` | Consultas SQL a SIRT (solo lectura) y conversión a las matrices del motor. |
| `gestor/store.js` | Estado de la jornada y metas congeladas por fecha/turno. Guarda en MySQL y deja respaldo en JSON. |
| MySQL `colbeef_gestor` | Base propia del gestor en el 205: estado, usuarios, auditoría, usabilidad y bloqueo de sesión. |
| SIRT PostgreSQL | Fuente de datos operativos. El gestor nunca escribe en ella (`POSTGRES_READ_ONLY=true`). |
