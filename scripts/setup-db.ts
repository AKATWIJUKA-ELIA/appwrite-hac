// Creates (or tops up) the Quotebook TablesDB schema from src/lib/db/schema.ts.
//
//   npm run db:setup
//
// Idempotent: anything that already exists is left alone, anything missing is
// created. It never drops or alters an existing column, so a changed column
// definition has to be migrated by hand.

import {
  AppwriteException,
  Client,
  OrderBy,
  Permission,
  Role,
  TablesDB,
  TablesDBIndexType,
} from "node-appwrite";
import { DATABASE_ID, TABLES, type ColumnSpec, type TableSpec } from "../src/lib/db/schema";

const endpoint = process.env.NEXT_PUBLIC_APPWRITE_ENDPOINT;
const project = process.env.NEXT_PUBLIC_APPWRITE_PROJECT_ID;
const key = process.env.APPWRITE_API_KEY;
if (!endpoint || !project || !key) {
  console.error(
    "Missing NEXT_PUBLIC_APPWRITE_ENDPOINT, NEXT_PUBLIC_APPWRITE_PROJECT_ID or APPWRITE_API_KEY in .env.local",
  );
  process.exit(1);
}

const db = new TablesDB(new Client().setEndpoint(endpoint).setProject(project).setKey(key));

const isNotFound = (err: unknown) => err instanceof AppwriteException && err.code === 404;

async function ensureDatabase() {
  try {
    await db.get({ databaseId: DATABASE_ID });
    console.log(`database  ${DATABASE_ID}  exists`);
  } catch (err) {
    if (!isNotFound(err)) throw err;
    await db.create({ databaseId: DATABASE_ID, name: "Quotebook" });
    console.log(`database  ${DATABASE_ID}  created`);
  }
}

async function ensureTable(table: TableSpec) {
  const permissions = table.readableByAnyUser ? [Permission.read(Role.users())] : [];
  try {
    await db.getTable({ databaseId: DATABASE_ID, tableId: table.id });
  } catch (err) {
    if (!isNotFound(err)) throw err;
    await db.createTable({
      databaseId: DATABASE_ID,
      tableId: table.id,
      name: table.name,
      rowSecurity: table.rowSecurity,
      permissions,
    });
    console.log(`table     ${table.id}  created`);
  }
}

function createColumn(tableId: string, col: ColumnSpec) {
  const base = { databaseId: DATABASE_ID, tableId, key: col.key, required: col.required ?? false };
  // Appwrite rejects a default on a required column, so only pass it otherwise.
  const def = <T>(value: T | undefined) => (base.required ? undefined : value);
  switch (col.type) {
    case "varchar":
      return db.createVarcharColumn({ ...base, size: col.size, xdefault: def(col.default) });
    case "text":
      return db.createTextColumn(base);
    case "integer":
      return db.createIntegerColumn({ ...base, min: col.min, xdefault: def(col.default) });
    case "bigint":
      return db.createBigIntColumn({ ...base, min: col.min });
    case "float":
      return db.createFloatColumn(base);
    case "boolean":
      return db.createBooleanColumn({ ...base, xdefault: def(col.default) });
    case "datetime":
      return db.createDatetimeColumn(base);
    case "enum":
      return db.createEnumColumn({
        ...base,
        elements: [...col.elements],
        xdefault: def(col.default),
      });
  }
}

// Columns are created asynchronously; an index on a column that is still
// "processing" is rejected, so wait until every column is available.
async function waitForColumns(tableId: string) {
  for (let attempt = 0; attempt < 60; attempt++) {
    const { columns } = await db.listColumns({ databaseId: DATABASE_ID, tableId });
    const states = columns.map((c) => (c as { key: string; status: string }));
    const broken = states.filter((c) => c.status === "failed" || c.status === "stuck");
    if (broken.length) {
      throw new Error(`${tableId}: columns failed: ${broken.map((c) => c.key).join(", ")}`);
    }
    if (states.every((c) => c.status === "available")) return;
    await new Promise((r) => setTimeout(r, 1000));
  }
  throw new Error(`${tableId}: columns still processing after 60s`);
}

async function ensureColumns(table: TableSpec) {
  const { columns } = await db.listColumns({ databaseId: DATABASE_ID, tableId: table.id });
  const existing = new Set(columns.map((c) => (c as { key: string }).key));
  for (const col of table.columns) {
    if (existing.has(col.key)) continue;
    await createColumn(table.id, col);
    console.log(`column    ${table.id}.${col.key}  created (${col.type})`);
  }
  await waitForColumns(table.id);
}

const indexType = {
  key: TablesDBIndexType.Key,
  unique: TablesDBIndexType.Unique,
  fulltext: TablesDBIndexType.Fulltext,
} as const;

async function ensureIndexes(table: TableSpec) {
  const { indexes } = await db.listIndexes({ databaseId: DATABASE_ID, tableId: table.id });
  const existing = new Set(indexes.map((i) => i.key));
  for (const index of table.indexes) {
    if (existing.has(index.key)) continue;
    await db.createIndex({
      databaseId: DATABASE_ID,
      tableId: table.id,
      key: index.key,
      type: indexType[index.type],
      columns: index.columns,
      orders: index.orders?.map((o) => (o === "asc" ? OrderBy.Asc : OrderBy.Desc)),
    });
    console.log(`index     ${table.id}.${index.key}  created (${index.type})`);
  }
}

async function main() {
  await ensureDatabase();
  for (const table of Object.values(TABLES) as TableSpec[]) {
    await ensureTable(table);
    await ensureColumns(table);
    await ensureIndexes(table);
  }
  console.log("schema up to date");
}

main().catch((err) => {
  console.error(err instanceof AppwriteException ? `${err.code} ${err.type}: ${err.message}` : err);
  process.exit(1);
});
