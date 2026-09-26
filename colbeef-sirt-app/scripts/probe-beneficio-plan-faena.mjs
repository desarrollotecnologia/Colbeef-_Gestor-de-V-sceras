#!/usr/bin/env node
/**
 * Compara formas de contar "animales beneficiados" desde plan_faena.
 * Uso: node scripts/probe-beneficio-plan-faena.mjs [YYYY-MM-DD] [YYYY-MM-DD]
 */
import pg from 'pg';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: join(__dirname, '..', '.env') });

const { Client } = pg;
const from = process.argv[2] || new Date().toISOString().slice(0, 10);
const to = process.argv[3] || from;

const useSsl = String(process.env.POSTGRES_SSL || 'false').toLowerCase() === 'true';
const client = new Client({
  host: process.env.POSTGRES_HOST,
  port: Number(process.env.POSTGRES_PORT || 5432),
  database: process.env.POSTGRES_DB,
  user: process.env.POSTGRES_USER,
  password: process.env.POSTGRES_PASSWORD,
  connectionTimeoutMillis: 10000,
  ssl: useSsl ? { rejectUnauthorized: false } : undefined,
});

async function main() {
  await client.connect();
  console.log('Rango', from, '→', to);

  const colsPf = await client.query(`
    SELECT column_name, data_type
    FROM information_schema.columns
    WHERE table_schema = 'trazabilidad_proceso' AND table_name = 'plan_faena'
    ORDER BY ordinal_position
  `);
  console.log('\n--- plan_faena columns ---');
  for (const r of colsPf.rows) console.log(r.column_name, r.data_type);

  const colsPfp = await client.query(`
    SELECT column_name, data_type
    FROM information_schema.columns
    WHERE table_schema = 'trazabilidad_proceso' AND table_name = 'plan_faena_producto'
    ORDER BY ordinal_position
  `);
  console.log('\n--- plan_faena_producto columns ---');
  for (const r of colsPfp.rows) console.log(r.column_name, r.data_type);

  const counts = await client.query(
    `
    SELECT
      (SELECT COUNT(*)::int FROM trazabilidad_proceso.plan_faena pf
        WHERE DATE(timezone('America/Bogota', pf.fecha_plan)) >= $1::date
          AND DATE(timezone('America/Bogota', pf.fecha_plan)) <= $2::date) AS planes,
      (SELECT COUNT(*)::int
        FROM trazabilidad_proceso.plan_faena pf
        JOIN trazabilidad_proceso.plan_faena_producto pfp ON pfp.id_plan_faena = pf.id
        WHERE DATE(timezone('America/Bogota', pf.fecha_plan)) >= $1::date
          AND DATE(timezone('America/Bogota', pf.fecha_plan)) <= $2::date) AS join_filas_viejo,
      (SELECT COUNT(DISTINCT NULLIF(TRIM(pfp.id_producto::text), ''))::int
        FROM trazabilidad_proceso.plan_faena pf
        JOIN trazabilidad_proceso.plan_faena_producto pfp ON pfp.id_plan_faena = pf.id
        WHERE DATE(timezone('America/Bogota', pf.fecha_plan)) >= $1::date
          AND DATE(timezone('America/Bogota', pf.fecha_plan)) <= $2::date) AS animales_nuevo,
      (SELECT COUNT(*)::int FROM trazabilidad_proceso.plan_faena pf
        WHERE DATE(timezone('America/Bogota', pf.fecha_plan)) >= $1::date
          AND DATE(timezone('America/Bogota', pf.fecha_plan)) <= $2::date
          AND NOT EXISTS (
            SELECT 1 FROM trazabilidad_proceso.plan_faena_producto pfp
            WHERE pfp.id_plan_faena = pf.id
          )) AS planes_sin_producto
    `,
    [from, to]
  );
  console.log('\n--- conteos (Bogotá) ---');
  console.log(counts.rows[0]);
  const c = counts.rows[0];
  const delta = Number(c.join_filas_viejo) - Number(c.animales_nuevo);
  console.log(
    delta === 0
      ? 'Viejo COUNT(*) == distintos (sin duplicados ese día)'
      : `Viejo inflaba +${delta} (filas ${c.join_filas_viejo} vs únicos ${c.animales_nuevo})`
  );

  // distribución: productos por plan
  const dist = await client.query(
    `
    SELECT n_prod, COUNT(*)::int AS planes
    FROM (
      SELECT pf.id, COUNT(pfp.id)::int AS n_prod
      FROM trazabilidad_proceso.plan_faena pf
      LEFT JOIN trazabilidad_proceso.plan_faena_producto pfp ON pfp.id_plan_faena = pf.id
      WHERE pf.fecha_plan::date >= $1::date AND pf.fecha_plan::date <= $2::date
      GROUP BY pf.id
    ) t
    GROUP BY n_prod
    ORDER BY n_prod
    `,
    [from, to]
  );
  console.log('\n--- productos por plan ---');
  for (const r of dist.rows) console.log(r);

  // sample rows
  const sample = await client.query(
    `
    SELECT pf.id, pf.fecha_plan, COUNT(pfp.id)::int AS n_prod
    FROM trazabilidad_proceso.plan_faena pf
    LEFT JOIN trazabilidad_proceso.plan_faena_producto pfp ON pfp.id_plan_faena = pf.id
    WHERE pf.fecha_plan::date >= $1::date AND pf.fecha_plan::date <= $2::date
    GROUP BY pf.id, pf.fecha_plan
    ORDER BY n_prod DESC, pf.id
    LIMIT 8
    `,
    [from, to]
  );
  console.log('\n--- sample planes (top n_prod) ---');
  for (const r of sample.rows) console.log(r);

  // últimos 7 días: actual vs planes
  const serie = await client.query(
    `
    SELECT d::date AS fecha,
      (SELECT COUNT(*)::int FROM trazabilidad_proceso.plan_faena pf
        WHERE pf.fecha_plan::date = d) AS planes,
      (SELECT COUNT(*)::int
        FROM trazabilidad_proceso.plan_faena pf
        JOIN trazabilidad_proceso.plan_faena_producto pfp ON pfp.id_plan_faena = pf.id
        WHERE pf.fecha_plan::date = d) AS join_filas
    FROM generate_series($1::date - 10, $1::date, '1 day') AS d
    ORDER BY d
    `,
    [from]
  );
  console.log('\n--- serie (planes vs join_filas = lo que muestra el informe) ---');
  for (const r of serie.rows) {
    const delta = Number(r.join_filas) - Number(r.planes);
    console.log(
      String(r.fecha).slice(0, 10),
      'planes=',
      r.planes,
      'join=',
      r.join_filas,
      delta === 0 ? 'OK' : `Δ${delta > 0 ? '+' : ''}${delta}`
    );
  }

  await client.end();
}

main().catch((e) => {
  console.error('PROBE_ERROR', e.message);
  process.exit(1);
});
