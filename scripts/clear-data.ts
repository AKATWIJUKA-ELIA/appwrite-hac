// Empties every Quotebook table, keeping the schema and the user accounts.
// Useful for a clean slate before recording a demo.
//
//   npm run db:clear -- --yes
//
// Irreversible: every request, supplier, contact, RFQ, quote and event is
// deleted. Tables, columns and indexes stay, and so does Appwrite Auth.

import { AppwriteException, Client, TablesDB } from "node-appwrite";
import { DATABASE_ID, TABLES } from "../src/lib/db/schema";

const endpoint = process.env.NEXT_PUBLIC_APPWRITE_ENDPOINT;
const project = process.env.NEXT_PUBLIC_APPWRITE_PROJECT_ID;
const key = process.env.APPWRITE_API_KEY;
if (!endpoint || !project || !key) {
  console.error(
    "Missing NEXT_PUBLIC_APPWRITE_ENDPOINT, NEXT_PUBLIC_APPWRITE_PROJECT_ID or APPWRITE_API_KEY in .env.local",
  );
  process.exit(1);
}
if (!process.argv.includes("--yes")) {
  console.error("This deletes every row in every Quotebook table. Re-run with --yes to confirm.");
  process.exit(1);
}

const db = new TablesDB(new Client().setEndpoint(endpoint).setProject(project).setKey(key));

async function clearTable(tableId: string): Promise<number> {
  let deleted = 0;
  // Bulk deletes are capped per call, so repeat until a call removes nothing.
  for (;;) {
    const { total } = await db.deleteRows({ databaseId: DATABASE_ID, tableId });
    if (total === 0) return deleted;
    deleted += total;
  }
}

async function main() {
  for (const table of Object.values(TABLES)) {
    const deleted = await clearTable(table.id);
    console.log(`${table.id.padEnd(16)} ${deleted} row(s) deleted`);
  }
  console.log("all tables empty; schema and users kept");
}

main().catch((err) => {
  console.error(err instanceof AppwriteException ? `${err.code} ${err.type}: ${err.message}` : err);
  process.exit(1);
});
