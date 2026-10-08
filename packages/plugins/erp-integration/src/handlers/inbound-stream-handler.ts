import type { RequestContext } from '@vendure/core';

// Common shape every per-stream handler implements. The out-of-order/version-regression guard
// (issue #62 test-design risk: "out-of-order delivery within a stream") is enforced centrally by
// IntegrationInboxProcessorService before a handler is ever invoked, using the inbox table's own
// (stream, entityId, version) history as the ledger of what was already applied — a handler only
// ever sees calls it should actually apply, in increasing version order per entityId.
export interface InboundStreamHandler {
    apply(
        ctx: RequestContext,
        entityId: string,
        payload: Record<string, unknown>,
    ): Promise<InboundOutcome>;
}

// A deliberate no-op must say why (issue #200): the reason is stored on the inbox row and counted
// on the integration-health page.
export type InboundOutcome = { kind: 'applied' } | { kind: 'noop'; reason: string };

// apply() must return one of these on every path, so a bare `return` does not compile.
export const inboundApplied = (): InboundOutcome => ({ kind: 'applied' });
export const inboundNoop = (reason: string): InboundOutcome => ({ kind: 'noop', reason });
