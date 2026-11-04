/** A UI correlation hint only. A server-verified profile still authorizes access. */
export type PendingConfirmation = { userId: string; expiresAt: number };
export const confirmationWaitLifetime = 60 * 60 * 1000;
const userIdPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function beginConfirmation(userId: unknown, now = Date.now()): PendingConfirmation | null {
  return typeof userId === 'string' && userIdPattern.test(userId)
    ? { userId, expiresAt: now + confirmationWaitLifetime }
    : null;
}

export function confirmationIsActive(pending: PendingConfirmation | null, now = Date.now()): boolean {
  return !!pending && pending.expiresAt > now && pending.expiresAt <= now + confirmationWaitLifetime;
}

export function canContinueConfirmation(pending: PendingConfirmation | null, verifiedUserId: string | null | undefined, now = Date.now()): boolean {
  return confirmationIsActive(pending, now) && pending!.userId === verifiedUserId;
}
