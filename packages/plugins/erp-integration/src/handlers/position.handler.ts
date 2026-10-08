import { Injectable } from '@nestjs/common';
import type { RequestContext } from '@vendure/core';
import { PositionService } from '@mivend/plugin-access-control';

import { inboundNoop } from './inbound-stream-handler';
import type { InboundOutcome, InboundStreamHandler } from './inbound-stream-handler';

// Applies the `position` stream (PositionChanged, company.customers.events.v1.position-changed).
// Absent isActive means false (proto3 zero-value omission), same as DepartmentStreamHandler.
@Injectable()
export class PositionStreamHandler implements InboundStreamHandler {
    constructor(private readonly positionService: PositionService) {}

    async apply(
        ctx: RequestContext,
        entityId: string,
        payload: Record<string, unknown>,
    ): Promise<InboundOutcome | void> {
        const isActive = payload.isActive === true && payload.isDeleted !== true;
        const name = payload.name ? String(payload.name) : null;
        if (!name) {
            const updated = await this.positionService.setActiveStateIfExists(
                ctx,
                entityId,
                isActive,
            );
            return updated
                ? undefined
                : inboundNoop(`position ${entityId}: missing name and no existing row, skipping`);
        }
        const parentErpId = payload.parentId ? String(payload.parentId) : null;
        await this.positionService.upsert(ctx, { erpId: entityId, name, parentErpId, isActive });
    }
}
