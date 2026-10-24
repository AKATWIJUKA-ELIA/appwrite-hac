// Creates (or updates) the Appwrite Function that drives Quotebook's cron tick,
// and deploys functions/cron-tick to it.
//
//   npm run fn:deploy
//
// Idempotent: the function, its schedule and its variables are created when
// missing and brought up to date when present. Each run uploads a new
// deployment of the (tiny) function code.

import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { AppwriteException, Client, Functions, Runtime } from "node-appwrite";
import { InputFile } from "node-appwrite/file";

const FUNCTION_ID = "cron-tick";
// Minutes between runs. An interval rather than a cron expression, which the
// free plan does not allow, and the free plan's shortest interval is 60
// minutes. That is plenty: follow-ups are due days apart. Appwrite picks the
// moment within each interval.
const INTERVAL_MINUTES = Number(process.env.TICK_INTERVAL_MINUTES ?? 60);
const SITE_URL = process.env.SITE_URL ?? "https://quotebook.appwrite.network";

const endpoint = process.env.NEXT_PUBLIC_APPWRITE_ENDPOINT;
const project = process.env.NEXT_PUBLIC_APPWRITE_PROJECT_ID;
const key = process.env.APPWRITE_API_KEY;
const cronSecret = process.env.CRON_SECRET;
if (!endpoint || !project || !key || !cronSecret) {
  console.error("Missing NEXT_PUBLIC_APPWRITE_ENDPOINT, NEXT_PUBLIC_APPWRITE_PROJECT_ID, APPWRITE_API_KEY or CRON_SECRET");
  process.exit(1);
}

const functions = new Functions(new Client().setEndpoint(endpoint).setProject(project).setKey(key));
const isNotFound = (err: unknown) => err instanceof AppwriteException && err.code === 404;

const settings = {
  functionId: FUNCTION_ID,
  name: "Quotebook cron tick",
  runtime: Runtime.Node22,
  // Nobody may call it directly; only the schedule runs it.
  execute: [],
  interval: INTERVAL_MINUTES,
  timeout: 30,
  enabled: true,
  logging: true,
  entrypoint: "src/main.js",
  commands: "",
};

async function ensureFunction() {
  try {
    await functions.get({ functionId: FUNCTION_ID });
    await functions.update(settings);
    console.log(`function  ${FUNCTION_ID}  updated (every ${INTERVAL_MINUTES} min)`);
  } catch (err) {
    if (!isNotFound(err)) throw err;
    await functions.create(settings);
    console.log(`function  ${FUNCTION_ID}  created (every ${INTERVAL_MINUTES} min)`);
  }
}

async function ensureVariable(variableKey: string, value: string) {
  const { variables } = await functions.listVariables({ functionId: FUNCTION_ID });
  const existing = variables.find((v) => v.key === variableKey);
  if (existing) {
    await functions.updateVariable({ functionId: FUNCTION_ID, variableId: existing.$id, key: variableKey, value, secret: true });
  } else {
    await functions.createVariable({ functionId: FUNCTION_ID, variableId: variableKey.toLowerCase().replace(/_/g, "-"), key: variableKey, value, secret: true });
  }
  console.log(`variable  ${variableKey}  set`);
}

async function deployCode() {
  const dir = mkdtempSync(join(tmpdir(), "qb-fn-"));
  const archive = join(dir, "code.tar.gz");
  try {
    execFileSync("tar", ["-czf", archive, "-C", join(process.cwd(), "functions/cron-tick"), "."]);
    const deployment = await functions.createDeployment({
      functionId: FUNCTION_ID,
      code: InputFile.fromPath(archive, "code.tar.gz"),
      activate: true,
      entrypoint: "src/main.js",
    });
    console.log(`deployment ${deployment.$id} uploaded (${deployment.status})`);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

async function main() {
  await ensureFunction();
  await ensureVariable("TICK_URL", `${SITE_URL}/api/cron/tick`);
  await ensureVariable("CRON_SECRET", cronSecret as string);
  await deployCode();
  console.log("done");
}

main().catch((err) => {
  console.error(err instanceof AppwriteException ? `${err.code} ${err.type}: ${err.message}` : err);
  process.exit(1);
});
