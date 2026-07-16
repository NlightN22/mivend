export const loggerCtx = 'AcquiringPlugin';

export class IdempotencyConflictError extends Error {
    constructor(
        public readonly reason: 'payload-mismatch' | 'in-progress',
        message: string,
    ) {
        super(message);
        this.name = 'IdempotencyConflictError';
    }
}
