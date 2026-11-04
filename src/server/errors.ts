export class ApiError extends Error {
  constructor(public readonly status: number, public readonly code: string, message: string,
    public readonly fieldErrors?: Record<string, string[]>, public readonly retryAfter?: number) { super(message); this.name = 'ApiError'; }
}
