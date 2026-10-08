import { Injectable } from '@nestjs/common';
import { RequestContext } from '@vendure/core';

import { ManufacturerService } from '../manufacturer.service';
import { inboundApplied, inboundNoop } from './inbound-stream-handler';
import type { InboundOutcome, InboundStreamHandler } from './inbound-stream-handler';

// Applies the `manufacturer` stream: the authoritative name source for Manufacturer (issue #164).
// Deleted/inactive rows keep their name so products that still reference them stay labelled.
@Injectable()
export class ManufacturerStreamHandler implements InboundStreamHandler {
    constructor(private readonly manufacturerService: ManufacturerService) {}

    async apply(
        ctx: RequestContext,
        entityId: string,
        payload: Record<string, unknown>,
    ): Promise<InboundOutcome> {
        const name = typeof payload.name === 'string' ? payload.name.trim() : '';
        if (!name) {
            return inboundNoop(`manufacturer ${entityId}: empty name, skipping`);
        }
        await this.manufacturerService.upsert(ctx, entityId, name);
        return inboundApplied();
    }
}
