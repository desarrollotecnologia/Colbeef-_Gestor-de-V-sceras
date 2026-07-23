# Flujo operativo del Gestor de Vísceras

[← Volver al índice](../README.md) · Fuente: [04-flujo-operativo.mmd](./04-flujo-operativo.mmd)

Diagrama de flujo de **cómo se usa el programa** en el día a día.

```mermaid
flowchart TD
  A([Inicio]) --> B[Portal: ingresa nombre del operador]
  B --> C[Gestor: selecciona fecha de operación]
  C --> D[Sincronizar / cargar datos desde SIRT]

  D --> E[Dashboard]
  E --> E1[En cava · Decomisos · Crudas]
  E --> E2[Progreso OPL]
  E --> E3[Total juegos a despachar]

  E --> F{¿Qué módulo necesita?}

  F -->|Decomisos| G[Cruce decomisos ↔ salidas]
  G --> G1[Ver ID · puesto · parte decomisada]
  G1 --> G2[Generar PDF de decomisos]

  F -->|Despachos| H[Procesar despachos del turno]
  H --> H1[Tabla por puesto y tipo de producto]
  H1 --> H2[Detalle por puesto / decomisos]

  F -->|OPL| I[Recalcular progreso OPL]
  I --> I1[Total · Despachados · Pendientes]
  I1 --> I2{¿fecha_salida en SIRT?}
  I2 -->|Sí| I3[Suben despachados]
  I2 -->|No| I4[Siguen pendientes]

  F -->|Crudas| J[VB con observación CRUDAS]
  J --> J1[Agrupar por puesto + OPL]

  F -->|Planilla| K[Consolidar puestos / zonas / OPL]
  K --> K1[Exportar planilla]

  F -->|Informe laboral| L[Beneficio · cavas · percheros]
  L --> L1[Generar informe PNG]

  F -->|Historial PDF| M[Abrir / descargar PDF guardados]

  G2 --> N[Historial PDF]
  L1 --> O([Fin / continuar operación])
  K1 --> O
  H2 --> O
  I3 --> O
  I4 --> O
  J1 --> O
  M --> O
  N --> O
```

## Cómo se mueve la información (técnico)

```mermaid
flowchart LR
  U[Usuario en navegador] --> FE[gestor.html]
  FE --> SHIM[google.script.run → POST /api/rpc]
  FE --> API[API REST /api/*]
  SHIM --> ENG[engine.js]
  API --> ENG
  ENG --> SYNC[sirtSync.js]
  SYNC --> PG[(PostgreSQL / SIRT)]
  ENG --> STATE[(gestor-state.json)]
  ENG --> PDF[PDF / PNG / XLSX]
```

## Flujo recomendado en planta

1. Entrar por el portal con el nombre del operador.
2. Elegir la fecha de operación.
3. Cargar / sincronizar SIRT.
4. Revisar el dashboard.
5. Abrir **Decomisos** y validar.
6. Abrir **Despachos** y procesar el turno.
7. Recalcular **OPL**.
8. Consultar **Crudas** / **Planilla** si aplica.
9. Generar **Informe laboral** y PDF.
10. Descargar desde **Historial PDF**.
