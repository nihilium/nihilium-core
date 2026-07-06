/**
 * In-memory store for deduplicating JWT request_ids within their validity window.
 * Tokens are valid for 24 h (per spec), so entries expire after that.
 * A restart clears the store — acceptable because expired tokens fail the exp check anyway.
 */
export class RequestIdStore {
  private readonly seen = new Map<string, number>(); // requestId → expiresAt (ms)

  /**
   * Returns true if this requestId has been seen before (replay attack).
   * Otherwise records it and returns false.
   * @param requestId  The JWT request_id claim.
   * @param expiresAt  The JWT exp claim (Unix seconds).
   */
  record(requestId: string, expiresAt: number): boolean {
    this.evict();
    if (this.seen.has(requestId)) return true;
    this.seen.set(requestId, expiresAt * 1000);
    return false;
  }

  private evict(): void {
    const now = Date.now();
    for (const [id, exp] of this.seen) {
      if (exp < now) this.seen.delete(id);
    }
  }
}
