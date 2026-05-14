import dotenv from "dotenv";
import { dirname, join } from "path";
import { fileURLToPath } from "url";
import { query } from "../server/db.js";

const __d = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: join(__d, "..", ".env") });

const overall = await query(`
  SELECT
    COUNT(*)::bigint AS total,
    COUNT(NULLIF(TRIM(codigo_maquina), ''))::bigint AS with_codigo,
    COUNT(id_registro_sesion)::bigint AS with_sesion
  FROM sai.decomiso
`);
console.log("sai.decomiso overall:", overall.rows[0]);

const recent = await query(`
  SELECT
    DATE_TRUNC('month', fecha_registro)::date AS mes,
    COUNT(*)::int AS n,
    COUNT(NULLIF(TRIM(codigo_maquina), ''))::int AS with_codigo,
    COUNT(id_registro_sesion)::int AS with_sesion
  FROM sai.decomiso
  WHERE fecha_registro >= '2025-01-01'::date
  GROUP BY 1
  ORDER BY 1 DESC
  LIMIT 18
`);
console.log("by month since 2025:", recent.rows);

const obs = await query(`
  SELECT d.id, left(d.observacion, 80) AS obs
  FROM sai.decomiso d
  WHERE d.fecha_registro BETWEEN '2026-05-12'::date AND '2026-05-14'::date
    AND d.observacion IS NOT NULL
    AND TRIM(d.observacion) <> ''
  LIMIT 10
`);
console.log("sample observacion non-empty:", obs.rows);

process.exit(0);
