/** Session hints may invalidate private UI; they never authorize access to data. */
export const IDENTITY_CHANGE_EVENT = 'thunderfang:identitychange';
export type IdentityChange = { previousUserId: string | null; nextUserId: string | null };

/** The first observation establishes the owner of a newly mounted tab. */
export function identityChange(previousUserId: string | null | undefined, nextUserId: string | null): IdentityChange | null {
  if (previousUserId === undefined || previousUserId === nextUserId) return null;
  return { previousUserId, nextUserId };
}

/** Anonymous checkout survives login; data associated with a prior account cannot. */
export function clearsCheckoutDraft(change: unknown): boolean {
  if (!change || typeof change !== 'object' || !('previousUserId' in change) || !('nextUserId' in change)) return false;
  const { previousUserId, nextUserId } = change;
  if (typeof previousUserId !== 'string' || !previousUserId) return false;
  if (nextUserId !== null && (typeof nextUserId !== 'string' || !nextUserId)) return false;
  return previousUserId !== nextUserId;
}
