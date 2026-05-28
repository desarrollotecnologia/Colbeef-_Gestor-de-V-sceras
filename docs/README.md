# Diagramas del Gestor de Vísceras

Documentación en **Mermaid** (editable en `.mmd` y vista previa en `.md` en GitHub).

**Repositorio:** [desarrollotecnologia/Colbeef-_Gestor-de-V-sceras](https://github.com/desarrollotecnologia/Colbeef-_Gestor-de-V-sceras)

---

## Índice (vista previa con diagrama renderizado)

| # | Tema | Ver en GitHub |
|---|------|----------------|
| 1 | Arquitectura general | [01-arquitectura.md](diagrams/01-arquitectura.md) |
| 2 | Endpoint backend → UI | [02-endpoints-a-ui.md](diagrams/02-endpoints-a-ui.md) |
| 3 | Mapa de pantallas | [03-mapa-pantallas.md](diagrams/03-mapa-pantallas.md) |

**Este índice:** [docs/README.md](README.md)

---

## Archivos fuente (editar aquí)

- [01-arquitectura.mmd](diagrams/01-arquitectura.mmd)
- [02-endpoints-a-ui.mmd](diagrams/02-endpoints-a-ui.mmd)
- [03-mapa-pantallas.mmd](diagrams/03-mapa-pantallas.mmd)

---

## Enlaces directos (rama `main`)

- https://github.com/desarrollotecnologia/Colbeef-_Gestor-de-V-sceras/blob/main/docs/README.md
- https://github.com/desarrollotecnologia/Colbeef-_Gestor-de-V-sceras/blob/main/docs/diagrams/01-arquitectura.md
- https://github.com/desarrollotecnologia/Colbeef-_Gestor-de-V-sceras/blob/main/docs/diagrams/02-endpoints-a-ui.md
- https://github.com/desarrollotecnologia/Colbeef-_Gestor-de-V-sceras/blob/main/docs/diagrams/03-mapa-pantallas.md

> Si algún enlace devuelve 404, la carpeta `docs/` aún no está en GitHub: haz commit y push de `docs/`.

---

## Notas vs. código actual (`colbeef-sirt-app`)

- **Interfaz única:** `http://<IP>:3001/gestor.html` (enlace recomendado en LAN).
- **Sync AppSheet:** en el diagrama aparece como `POST /sync/*` (diseño objetivo). Hoy la carga desde SIRT va por `sirtSync.js` y RPC (`sincronizarSesionDesdeSirtPorFecha`, etc.).
- **Planilla:** en UI se usa RPC `consolidarDatos`; la API expone `GET /api/planilla` (consolida y devuelve datos).
- **Persistencia:** PostgreSQL vía `pg`; estado de sesión del gestor en `gestor-state.json` (no Prisma en este repo).
