import { Logger } from '@nestjs/common';
import type { RequestContext } from '@vendure/core';

import type { InboundStreamHandler } from './inbound-stream-handler';

const loggerCtx = 'IntegrationDeferredStreamHandler';

// Streams with no target Vendure entity/mapping decided yet: `offer` (issue #62's design point 5
// deferred a real Seller/Channel/StockLocation migration for it) and `stock-organization` (its
// quantity dimension is deferred to issue #72 — see integration-inbox-processor.service.ts's own
// comment on why it isn't a second organizationId source either). Rather than guess a mapping
// that would need reworking anyway, these streams are consumed into the inbox (durably recorded,
// never dropped — the no-silent-drops messaging invariant) and their handler is a deliberate,
// logged no-op: the row is marked 'processed' so it isn't endlessly retried for a mapping that
// doesn't exist yet, but nothing is silently lost — the raw payload stays in
// `integration_inbox_event` for whenever the real mapping design lands.
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
