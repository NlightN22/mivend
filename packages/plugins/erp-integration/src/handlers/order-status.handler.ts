import { Injectable } from '@nestjs/common';
import type { RequestContext } from '@vendure/core';
import { OrderStatusReferenceService } from '@mivend/plugin-erp-order';

import { inboundApplied, inboundNoop } from './inbound-stream-handler';
import type { InboundOutcome, InboundStreamHandler } from './inbound-stream-handler';

// Applies `order-status` (sp#200), the ERP-owned status reference; absent plain proto3 scalars
// read as zero values, is_deleted is a real optional bool.
@Injectable()
export class OrderStatusStreamHandler implements InboundStreamHandler {
    constructor(private readonly references: OrderStatusReferenceService) {}

    async apply(
        ctx: RequestContext,
        entityId: string,
        payload: Record<string, unknown>,
    ): Promise<InboundOutcome> {
        const code = String(payload.code ?? '');
        const version = String(payload.version ?? '');
        if (!code || !version) {
            return inboundNoop(`order-status ${entityId}: missing code/version`);
        }
        const result = await this.references.apply(ctx, {
            code,
            version,
            isDeleted: payload.isDeleted === true,
            name: String(payload.name ?? code),
            rank: typeof payload.rank === 'number' ? payload.rank : 0,
            terminal: payload.terminal === true,
            customerVisible: payload.customerVisible === true,
            description: String(payload.description ?? ''),
            customerGroup: String(payload.customerGroup ?? ''),
            warehouseStarted: payload.warehouseStarted === true,
            shipped: payload.shipped === true,
            delivered: payload.delivered === true,
            cancelled: payload.cancelled === true,
        });
        if (result === 'stale') return inboundNoop(`order-status ${code}: version not newer`);
        if (result === 'protected') {
            return inboundNoop(`order-status ${code}: a mivend-owned status is never overwritten`);
        }
        if (result === 'unknown-deleted') {
            return inboundNoop(`order-status ${code}: deletion of an unknown status`);
        }
        return inboundApplied();
    }
}
