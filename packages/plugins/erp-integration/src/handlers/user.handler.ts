import { Injectable, Logger } from '@nestjs/common';
import type { RequestContext } from '@vendure/core';
import { UserEnrichmentService } from '@mivend/plugin-access-control';

import { inboundApplied, inboundNoop } from './inbound-stream-handler';
import type { InboundOutcome, InboundStreamHandler } from './inbound-stream-handler';

const loggerCtx = 'IntegrationUserHandler';

// Never creates Administrator; the link by e-mail is made by the contact-info stream (the e-mail is not on this event).
// isActive/isDeleted only sync a linked Administrator, never ErpUser; department and position are no longer sent.
@Injectable()
export class UserStreamHandler implements InboundStreamHandler {
    constructor(private readonly userEnrichmentService: UserEnrichmentService) {}

    async apply(
        ctx: RequestContext,
        entityId: string,
        payload: Record<string, unknown>,
    ): Promise<InboundOutcome> {
        const fullName =
            'fullName' in payload ? ((payload.fullName as string | null) ?? null) : undefined;
        // Absent isActive means false, not true — see types.ts's InboundStream comment (proto3
        // bool zero-value omission), same fold-in-isDeleted rule every sibling handler uses.
        const isActive = payload.isActive === true && payload.isDeleted !== true;

        const admin = await this.userEnrichmentService.linkAndEnrich(ctx, {
            erpId: entityId,
            fullName,
            isActive,
        });
        if (!admin) {
            return inboundNoop(`user ${entityId}: no linked Administrator (skipped)`);
        }
        Logger.verbose(`Enriched administrator erpId=${entityId}`, loggerCtx);
        return inboundApplied();
    }
}
