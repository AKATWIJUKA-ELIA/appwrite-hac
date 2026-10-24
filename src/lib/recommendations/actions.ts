"use server";

import { revalidatePath } from "next/cache";
import { actionError, requireOwnedRequest } from "@/lib/db/server";
import { computeRecommendation } from "@/lib/pipeline/recommend";

/**
 * Rank the priced quotes and record a recommendation. Ownership is checked
 * before anything runs, because computing one spends a model call.
 */
export async function recommend(requestId: string): Promise<{ error?: string }> {
  try {
    const { request } = await requireOwnedRequest(requestId);
    await computeRecommendation(request);
    revalidatePath(`/requests/${requestId}`);
  } catch (err) {
    return actionError(err);
  }
  return {};
}
