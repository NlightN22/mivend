import type { RequestContext } from '@vendure/core';

// Out-of-order/version-regression guard runs in IntegrationInboxProcessorService, not in handlers.
// Handlers only receive calls to apply, in increasing version order per entityId.
export interface InboundStreamHandler {
    apply(
        ctx: RequestContext,
        entityId: string,
        payload: Record<string, unknown>,
    ): Promise<InboundOutcome>;
}

// A deliberate no-op must say why (issue #200): the reason is stored on the inbox row and counted
// on the integration-health page.
// afterCommit runs once the inbox transaction committed (job enqueues that must see the rows).
export type InboundAfterCommit = (ctx: RequestContext) => Promise<void>;
export type InboundOutcome = ({ kind: 'applied' } | { kind: 'noop'; reason: string }) & {
    afterCommit?: InboundAfterCommit[];
};

// apply() must return one of these on every path, so a bare `return` does not compile.
export const inboundApplied = (afterCommit?: InboundAfterCommit[]): InboundOutcome =>
    afterCommit ? { kind: 'applied', afterCommit } : { kind: 'applied' };
export const inboundNoop = (reason: string): InboundOutcome => ({ kind: 'noop', reason });
