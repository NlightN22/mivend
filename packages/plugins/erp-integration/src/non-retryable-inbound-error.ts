// A payload that can never succeed: the inbox row goes straight to failed with this reason.
export class NonRetryableInboundError extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'NonRetryableInboundError';
    }
}
