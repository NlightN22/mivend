import type { RequestContext } from '@vendure/core';

import type { NonRetryableInboundError } from '../non-retryable-inbound-error';

// Out-of-order/version-regression guard runs in IntegrationInboxProcessorService, not in handlers.
// Handlers only receive calls to apply, in increasing version order per entityId.
export interface InboundStreamHandler {
    apply(
        ctx: RequestContext,
        entityId: string,
        payload: Record<string, unknown>,
    ): Promise<InboundOutcome>;
}

// A deliberate no-op must state its reason: it is stored on the inbox row and health metrics.
// afterCommit runs only after the inbox transaction commits, so enqueued jobs see the rows.
export type InboundAfterCommit = (ctx: RequestContext) => Promise<void>;
// contactFailure: a derived contact step failed and was rolled back alone; the row is recorded with that reason.
export type InboundOutcome = (
    | { kind: 'applied'; contactFailure?: string }
    | { kind: 'noop'; reason: string }
) & {
    afterCommit?: InboundAfterCommit[];
};

// apply() must return one of these on every path, so a bare `return` does not compile.
export const inboundApplied = (
    afterCommit?: InboundAfterCommit[],
    contactFailure?: string | null,
): InboundOutcome => ({
    kind: 'applied',
    ...(afterCommit ? { afterCommit } : {}),
    ...(contactFailure ? { contactFailure } : {}),
});
export const inboundNoop = (reason: string): InboundOutcome => ({ kind: 'noop', reason });

export interface BatchInboundItem {
    entityId: string;
    payload: Record<string, unknown>;
}

// A payload that can never apply: the batch settles the rest and the processor fails this row visibly.
export type BatchInboundResult =
    | InboundOutcome
    | { kind: 'invalid'; error: NonRetryableInboundError };

// Results are positional; items arrive sorted by (entityId, version) within the entity locks.
// A throw rolls back the whole batch and the processor falls back to apply() per row.
export interface BatchInboundStreamHandler extends InboundStreamHandler {
    applyBatch(ctx: RequestContext, items: BatchInboundItem[]): Promise<BatchInboundResult[]>;
}

export function isBatchHandler(
    handler: InboundStreamHandler,
): handler is BatchInboundStreamHandler {
    return typeof (handler as Partial<BatchInboundStreamHandler>).applyBatch === 'function';
}
