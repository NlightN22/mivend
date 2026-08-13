import type { RequestContext } from '@vendure/core';

// Common shape every per-stream handler implements. The out-of-order/version-regression guard
// (issue #62 test-design risk: "out-of-order delivery within a stream") is enforced centrally by
// IntegrationInboxProcessorService before a handler is ever invoked, using the inbox table's own
// (stream, entityId, version) history as the ledger of what was already applied — a handler only
// ever sees calls it should actually apply, in increasing version order per entityId.
export interface InboundStreamHandler {
    apply(ctx: RequestContext, entityId: string, payload: Record<string, unknown>): Promise<void>;
}
