import "server-only";

import { ID } from "node-appwrite";
import { toMinor } from "@/lib/money";
import type { RequestRow } from "@/lib/db/rows";
import { DATABASE_ID, TABLES } from "@/lib/db/schema";
import {
  db,
  ownerPermissions,
  recordEvent,
  UserFacingError,
  withTransaction,
} from "@/lib/db/server";
import { discover } from "@/lib/pipeline/discovery";
import { markRequestFailed } from "@/lib/server/jobs";
import {
  EXTRACTION_MODEL,
  nullable,
  nullablePairs,
  openAiJson,
  pairsToRecord,
  strictObject,
} from "@/lib/server/openai";

type ExtractedItem = {
  description: string;
  quantity: number;
  unit?: string;
  specs?: Record<string, string>;
};

/**
 * Pipeline step 1: free text -> structured requirement spec.
 *
 * The OpenAI call happens first and touches nothing; the result is then
 * written in a single transaction, so a failure at any point leaves the
 * request exactly as it was and Retry can run the step again cleanly.
 * Throws on failure; runStep() records the reason on the request.
 */
export async function extractSpec(requestId: string): Promise<void> {
  const request = await db().getRow<RequestRow>({
    databaseId: DATABASE_ID,
    tableId: TABLES.requests.id,
    rowId: requestId,
  });

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("OPENAI_API_KEY is not set");

  const spec = await openAiJson({
    apiKey,
    model: EXTRACTION_MODEL,
    // Default effort took ~18 s on the Dell request; extraction and discovery
    // share one 30-second host request, so keep the thinking short.
    reasoningEffort: "low",
    system:
      "You extract IT-equipment procurement requirements. Return only what the text states. " +
      "Never invent a budget, quantity, or delivery window that is not present.",
    user: request.rawText,
    schemaName: "requirement_spec",
    schema: strictObject({
      title: {
        type: "string",
        description: "Short label, e.g. '50 x Dell Latitude 5550'",
      },
      budgetAmount: nullable("number", "Budget ceiling in major units, or null"),
      currency: nullable("string", "ISO 4217 code stated in the text, or null"),
      deliveryWindowDays: nullable("number"),
      items: {
        type: "array",
        items: strictObject({
          description: { type: "string" },
          quantity: { type: "number" },
          unit: nullable("string"),
          specs: nullablePairs("Spec pairs such as cpu, ram, storage"),
        }),
      },
    }),
  });

  const currency =
    typeof spec.currency === "string" && spec.currency.length === 3
      ? spec.currency.toUpperCase()
      : request.currency;

  const rawItems = Array.isArray(spec.items) ? spec.items : [];
  const items: ExtractedItem[] = rawItems.flatMap((item: unknown) => {
    if (typeof item !== "object" || item === null) return [];
    const record = item as Record<string, unknown>;
    const { description, quantity } = record;
    if (typeof description !== "string" || typeof quantity !== "number") return [];
    return [
      {
        description,
        // The column is an integer of at least 1; a model that returns 2.5
        // laptops or 0 has misread the text, so round and floor at 1.
        quantity: Math.max(1, Math.round(quantity)),
        unit: typeof record.unit === "string" ? record.unit : undefined,
        specs: pairsToRecord(record.specs),
      },
    ];
  });

  if (items.length === 0) {
    throw new UserFacingError(
      "Could not read any line items from that description. Try naming the item and quantity.",
    );
  }

  await saveSpec(request, {
    title: typeof spec.title === "string" && spec.title.trim() ? spec.title.trim() : request.title,
    budgetMinor:
      typeof spec.budgetAmount === "number" ? toMinor(spec.budgetAmount, currency) : null,
    currency,
    deliveryWindowDays:
      typeof spec.deliveryWindowDays === "number" ? Math.round(spec.deliveryWindowDays) : null,
    items,
  });

  // Discovery runs straight on in the same background job. Its failures are
  // its own: recorded as "Supplier search failed", not as an extraction error.
  try {
    await discover(request.$id);
  } catch (err) {
    await markRequestFailed("discover", { id: request.$id, ownerId: request.userId }, err);
  }
}

/**
 * Commit the extracted specification. One transaction, so the line items, the
 * header facts and the status move together or not at all.
 */
async function saveSpec(
  request: RequestRow,
  spec: {
    title: string;
    budgetMinor: number | null;
    currency: string;
    deliveryWindowDays: number | null;
    items: ExtractedItem[];
  },
): Promise<void> {
  const tables = db();
  const permissions = ownerPermissions(request.userId);

  await withTransaction(async (transactionId) => {
    for (const item of spec.items) {
      await tables.createRow({
        databaseId: DATABASE_ID,
        tableId: TABLES.lineItems.id,
        rowId: ID.unique(),
        data: {
          requestId: request.$id,
          description: item.description.slice(0, 500),
          quantity: item.quantity,
          unit: item.unit?.slice(0, 32) ?? null,
          specs: item.specs ? JSON.stringify(item.specs) : null,
        },
        permissions,
        transactionId,
      });
    }

    await tables.updateRow({
      databaseId: DATABASE_ID,
      tableId: TABLES.requests.id,
      rowId: request.$id,
      data: {
        title: spec.title.slice(0, 200),
        budgetMinor: spec.budgetMinor,
        currency: spec.currency,
        deliveryWindowDays: spec.deliveryWindowDays,
        status: "discovering",
        failureReason: null,
      },
      transactionId,
    });

    await recordEvent({
      requestId: request.$id,
      ownerId: request.userId,
      kind: "request.extracted",
      message: `Extracted ${spec.items.length} line item(s); discovering suppliers.`,
      transactionId,
    });
  });
}
