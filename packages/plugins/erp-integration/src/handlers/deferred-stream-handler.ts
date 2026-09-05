import { Logger } from '@nestjs/common';
import type { RequestContext } from '@vendure/core';

import type { InboundStreamHandler } from './inbound-stream-handler';

const loggerCtx = 'IntegrationDeferredStreamHandler';

// Organization/Warehouse/PriceType/Offer: no target Vendure entity/mapping is decided anywhere
// in this codebase or in issue #62 itself — the issue explicitly defers the real
// Seller/Channel/StockLocation migration these would map onto (design point 5, "Explicitly out
// of scope"). Rather than guess a mapping that would need reworking anyway, these streams are
// consumed into the inbox (durably recorded, never dropped — the no-silent-drops messaging invariant) and their
// handler is a deliberate, logged no-op: the row is marked 'processed' so it isn't endlessly
// retried for a mapping that doesn't exist yet, but nothing is silently lost — the raw payload
// stays in `integration_inbox_event` for whenever the real mapping design lands. See the
// implementation report's "Deliberate omissions" for the follow-up this needs.
//
// Not @Injectable() — it's constructed manually (one instance per deferred stream, parameterized
// by stream name) in IntegrationInboxProcessorService, not resolved via Nest DI.
export class DeferredStreamHandler implements InboundStreamHandler {
    constructor(private readonly stream: string) {}

    async apply(_ctx: RequestContext, entityId: string): Promise<void> {
        Logger.verbose(
            `${this.stream} ${entityId}: no target mapping yet (deferred per issue #62 design point 5) — recorded, not applied`,
            loggerCtx,
        );
    }
}
