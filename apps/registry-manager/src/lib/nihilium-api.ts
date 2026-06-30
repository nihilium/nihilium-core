/**
 * Nihilium portal API client
 *
 * Thin fetch wrapper for the public registry endpoints.
 * All functions are best-effort: network errors are caught and returned
 * as `null` so callers can decide whether to warn or fail hard.
 */

export interface ClaimStatus {
  claimed: boolean;
  address: string;
}

/**
 * Fetch the claim status for a single processor address.
 * Returns null when the API is unreachable or returns an unexpected response.
 */
export async function fetchProcessorClaimStatus(
  apiBaseUrl: string,
  address: string
): Promise<ClaimStatus | null> {
  try {
    const url = `${apiBaseUrl.replace(/\/$/, "")}/api/processors/${address}/claim-status`;
    const res = await fetch(url);
    if (!res.ok) return null;
    const body = await res.json() as Record<string, unknown>;
    if (typeof body.claimed !== "boolean") return null;
    return { claimed: body.claimed as boolean, address };
  } catch {
    return null;
  }
}
