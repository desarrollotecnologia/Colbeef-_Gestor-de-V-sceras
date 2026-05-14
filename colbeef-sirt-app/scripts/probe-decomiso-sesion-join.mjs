import dotenv from "dotenv";
import { dirname, join } from "path";
import { fileURLToPath } from "url";
import { query } from "../server/db.js";

const __d = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: join(__d, "..", ".env") });

const sample = await query(`
  SELECT d.id, d.codigo_maquina, d.id_registro_sesion, d.fecha_registro
  FROM sai.decomiso d
  WHERE d.fecha_registro BETWEEN '2026-05-12'::date AND '2026-05-14'::date
  ORDER BY d.fecha_registro DESC
  LIMIT 8
`);
console.log("sample decomiso:", sample.rows);

const joinPpp = await query(`
  SELECT
    d.id AS decomiso_id,
    d.codigo_maquina,
    d.id_registro_sesion,
    ppp.id AS proceso_parte_producto_id,
    ppp.id_producto::text AS id_producto
  FROM sai.decomiso d
  LEFT JOIN trazabilidad_proceso.proceso_parte_producto ppp
    ON ppp.id_registro_sesion = d.id_registro_sesion
  WHERE d.fecha_registro BETWEEN '2026-05-12'::date AND '2026-05-14'::date
  ORDER BY d.fecha_registro DESC
  LIMIT 15
`);
console.log("decomiso LEFT JOIN proceso_parte_producto:", joinPpp.rows);

const joinParte = await query(`
  SELECT
    d.id AS decomiso_id,
    d.id_registro_sesion,
    pp.id AS parte_id,
    pp.id_producto::text AS id_producto,
    left(pp.identificacion::text, 40) AS identificacion
  FROM sai.decomiso d
  LEFT JOIN trazabilidad_proceso.parte_producto pp
    ON pp.id_registro_sesion = d.id_registro_sesion
   AND pp.fecha_registro::date = d.fecha_registro
  WHERE d.fecha_registro BETWEEN '2026-05-12'::date AND '2026-05-14'::date
  ORDER BY d.fecha_registro DESC
  LIMIT 15
`);
console.log("decomiso LEFT JOIN parte_producto (same fecha):", joinParte.rows);

process.exit(0);
