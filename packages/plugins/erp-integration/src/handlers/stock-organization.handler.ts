import { Injectable } from '@nestjs/common';
import { RequestContext, TransactionalConnection } from '@vendure/core';
import { withAggregateLock } from 'shared';

import { inboundApplied, inboundNoop } from './inbound-stream-handler';
import type { InboundOutcome, InboundStreamHandler } from './inbound-stream-handler';
import { StockOrganization } from '../entities/stock-organization.entity';

// Applies `stock-organization`: a tombstone removes the row, stale versions are dropped by the inbox.
// Rows reference product/organization by ERP id only, so an unknown one is stored, never retried.
@Injectable()
export class StockOrganizationStreamHandler implements InboundStreamHandler {
    constructor(private readonly connection: TransactionalConnection) {}

    async apply(
        ctx: RequestContext,
        entityId: string,
        payload: Record<string, unknown>,
    ): Promise<InboundOutcome> {
        const productId = String(payload.productId ?? '');
        const organizationErpId = String(payload.organizationId ?? '');
        // Plain proto3 double: a legitimate zero is omitted, so absent means 0.
        const quantity = Number(payload.quantity ?? 0);
        const isDeleted = payload.isDeleted === true;
        // Optional proto3 bool: absent is "unset", only an explicit false deactivates.
        const isActive = payload.isActive !== false;

        if (isDeleted) {
            return withAggregateLock(
                this.connection,
                ctx,
                `stock-organization:${entityId}`,
                async txCtx => {
                    const { affected } = await this.connection
                        .getRepository(txCtx, StockOrganization)
                        .delete({ entityId });
                    return affected
                        ? inboundApplied()
                        : inboundNoop(`stock-organization ${entityId}: deleted, nothing stored`);
                },
            );
        }
        if (!productId || !organizationErpId || !Number.isFinite(quantity)) {
            return inboundNoop(
                `stock-organization ${entityId}: missing productId/organizationId, skipping`,
            );
        }

        return withAggregateLock(
            this.connection,
            ctx,
            `stock-organization:${entityId}`,
            async txCtx => {
                await this.connection
                    .getRepository(txCtx, StockOrganization)
                    .upsert({ entityId, productId, organizationErpId, quantity, isActive }, [
                        'productId',
                        'organizationErpId',
                    ]);
                return inboundApplied();
            },
        );
    }
}
