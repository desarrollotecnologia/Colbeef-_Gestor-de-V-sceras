import dotenv from "dotenv";
import { dirname, join } from "path";
import { fileURLToPath } from "url";
import { query } from "../server/db.js";

const __d = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: join(__d, "..", ".env") });

const audit = await query(`
  SELECT
    COUNT(*)::bigint AS total,
    COUNT(NULLIF(TRIM(codigo_maquina), ''))::bigint AS with_codigo,
    COUNT(id_registro_sesion)::bigint AS with_sesion
  FROM a_sai.a_decomiso
`);
console.log("a_sai.a_decomiso overall:", audit.rows[0]);

const sample = await query(`
  SELECT id, codigo_maquina, id_registro_sesion, fecha_registro
  FROM a_sai.a_decomiso
  WHERE fecha_registro BETWEEN '2026-05-12'::date AND '2026-05-14'::date
  ORDER BY fecha_registro DESC
  LIMIT 5
`);
console.log("sample a_decomiso:", sample.rows);

process.exit(0);
