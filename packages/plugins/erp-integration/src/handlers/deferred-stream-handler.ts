import { Logger } from '@nestjs/common';
import type { RequestContext } from '@vendure/core';

import { inboundNoop } from './inbound-stream-handler';
import type { InboundOutcome, InboundStreamHandler } from './inbound-stream-handler';

const loggerCtx = 'IntegrationDeferredStreamHandler';

// Deferred streams have no mapping yet: no-op handler marks rows processed (no endless retry).
// Constructed manually per stream, not via Nest DI, so no @Injectable().
export class DeferredStreamHandler implements InboundStreamHandler {
    constructor(private readonly stream: string) {}

    async apply(_ctx: RequestContext, entityId: string): Promise<InboundOutcome> {
        const reason = `${this.stream} ${entityId}: no target mapping yet (deferred per issue #62 design point 5) — recorded, not applied`;
        Logger.verbose(reason, loggerCtx);
        return inboundNoop(reason);
    }
}
