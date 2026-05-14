import dotenv from "dotenv";
import { dirname, join } from "path";
import { fileURLToPath } from "url";
import { query } from "../server/db.js";

const __d = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: join(__d, "..", ".env") });

const cols = await query(`
  SELECT table_schema, table_name, column_name
  FROM information_schema.columns
  WHERE column_name ILIKE '%registro_sesion%'
    AND table_schema NOT IN ('pg_catalog','information_schema')
  ORDER BY table_schema, table_name
  LIMIT 50
`);
console.log("columns matching %registro_sesion%:", cols.rows);

const fk = await query(`
  SELECT
    tc.table_schema AS from_schema,
    tc.table_name AS from_table,
    kcu.column_name AS from_col,
    ccu.table_schema AS to_schema,
    ccu.table_name AS to_table,
    ccu.column_name AS to_col
  FROM information_schema.table_constraints AS tc
  JOIN information_schema.key_column_usage AS kcu
    ON tc.constraint_name = kcu.constraint_name
   AND tc.table_schema = kcu.table_schema
  JOIN information_schema.constraint_column_usage AS ccu
    ON ccu.constraint_name = tc.constraint_name
   AND ccu.table_schema = tc.table_schema
  WHERE tc.constraint_type = 'FOREIGN KEY'
    AND tc.table_schema = 'sai'
    AND tc.table_name = 'decomiso'
`);
console.log("FKs on sai.decomiso:", fk.rows);

process.exit(0);
