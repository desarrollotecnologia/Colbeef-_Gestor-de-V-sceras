# Diagramas del Gestor de Vísceras

Documentación en **Mermaid**: se edita el `.mmd` y la vista previa `.md` se ve renderizada en GitHub.

**Repositorio:** [desarrollotecnologia/Colbeef-_Gestor-de-V-sceras](https://github.com/desarrollotecnologia/Colbeef-_Gestor-de-V-sceras)

Última revisión: **30/09/2026** (build del motor `adicionales-asignacion-v32`).

---

## Índice

| # | Tema | Vista previa | Fuente |
|---|------|--------------|--------|
| 1 | Arquitectura general | [01-arquitectura.md](diagrams/01-arquitectura.md) | [.mmd](diagrams/01-arquitectura.mmd) |
| 2 | Backend → elemento de pantalla | [02-endpoints-a-ui.md](diagrams/02-endpoints-a-ui.md) | [.mmd](diagrams/02-endpoints-a-ui.mmd) |
| 3 | Mapa de pantallas | [03-mapa-pantallas.md](diagrams/03-mapa-pantallas.md) | [.mmd](diagrams/03-mapa-pantallas.mmd) |
| 4 | Flujo operativo (uso diario) | [04-flujo-operativo.md](diagrams/04-flujo-operativo.md) | [.mmd](diagrams/04-flujo-operativo.mmd) |
| 5 | Cálculo de progreso, adicionales, incompletos y crudas | [05-calculo-progreso.md](diagrams/05-calculo-progreso.md) | [.mmd](diagrams/05-calculo-progreso.mmd) |

---

## Cómo actualizar un diagrama

1. Edite el `.mmd`.
2. Copie el mismo contenido dentro del bloque ```` ```mermaid ```` del `.md` que tiene el mismo nombre.
3. Compruebe que se ve bien en GitHub o en [mermaid.live](https://mermaid.live).

Consejo de sintaxis: ponga entre comillas los textos de los nodos que llevan `/`, paréntesis o `:`
(por ejemplo `api["GET /api/crudas"]`); sin comillas Mermaid los toma como otra forma de nodo.

---

## Resumen del sistema (vs. código actual de `colbeef-sirt-app`)

- **Interfaz única:** `http://<IP>:3001/gestor.html` (en planta: `http://192.168.20.205:3001/gestor.html`).
- **Datos operativos:** se leen de **SIRT/PostgreSQL** en modo solo lectura (`server/gestor/sirtSync.js`). No hay sincronización desde AppSheet ni carga de Excel obligatoria.
- **Llamadas:** la interfaz usa `google.script.run` → `POST /api/rpc` (lista blanca en `server/gestor/rpc.js`); las descargas usan rutas REST `/api/...`.
- **Persistencia propia:** MySQL `colbeef_gestor` en el 205 (estado, usuarios, auditoría, usabilidad), con respaldo en `server/data/gestor-state.json`.
- **Archivos:** PDF con PDFKit, Excel con ExcelJS, informe laboral en PNG.
