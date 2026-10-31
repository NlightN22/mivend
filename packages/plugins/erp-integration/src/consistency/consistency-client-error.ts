export type ConsistencyFailureKind =
    | 'unreachable'
    | 'unauthorized'
    | 'forbidden'
    | 'no-check-yet'
    | 'rate-limited'
    | 'bad-request'
    | 'server-error'
    | 'malformed';

export class ConsistencyClientError extends Error {
    constructor(
        readonly kind: ConsistencyFailureKind,
        message: string,
        readonly retryAfterSeconds?: number,
    ) {
        super(message);
        this.name = 'ConsistencyClientError';
    }
}
