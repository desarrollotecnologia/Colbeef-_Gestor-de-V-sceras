import dotenv from "dotenv";
import { dirname, join } from "path";
import { fileURLToPath } from "url";
import { query } from "../server/db.js";

const __d = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: join(__d, "..", ".env") });

const dec = await query(`
  SELECT column_name, data_type
  FROM information_schema.columns
  WHERE table_schema = 'sai' AND table_name = 'decomiso'
  ORDER BY ordinal_position
`);
console.log("sai.decomiso columns:", dec.rows);

const ppp = await query(`
  SELECT column_name, data_type
  FROM information_schema.columns
  WHERE table_schema = 'trazabilidad_proceso' AND table_name = 'proceso_parte_producto'
  ORDER BY ordinal_position
`);
console.log("proceso_parte_producto columns:", ppp.rows);

const stats = await query(`
  SELECT
    COUNT(*)::int AS total,
    COUNT(d.codigo_maquina)::int AS codigo_not_null,
    COUNT(d.id_registro_sesion)::int AS sesion_not_null
  FROM sai.decomiso d
  WHERE d.fecha_registro BETWEEN '2026-05-12'::date AND '2026-05-14'::date
`);
console.log("stats window:", stats.rows[0]);

process.exit(0);
