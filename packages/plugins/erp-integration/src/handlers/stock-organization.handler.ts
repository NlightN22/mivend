import { Injectable } from '@nestjs/common';
import { RequestContext, TransactionalConnection } from '@vendure/core';
import { OrderCheckStaleService } from '@mivend/plugin-reservation';
import { withAggregateLock } from 'shared';

import { inboundApplied, inboundNoop } from './inbound-stream-handler';
import type { InboundOutcome, InboundStreamHandler } from './inbound-stream-handler';
import { StockOrganization } from '../entities/stock-organization.entity';

// Applies `stock-organization`: a tombstone removes the row, stale versions are dropped by the inbox.
// Rows reference product/organization by ERP id only, so an unknown one is stored, never retried.
@Injectable()
export class StockOrganizationStreamHandler implements InboundStreamHandler {
    constructor(
        private readonly connection: TransactionalConnection,
        private readonly orderCheckStale: OrderCheckStaleService,
    ) {}

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

        // The stale request commits with the data change, so a retried message (row already gone) cannot
        // lose it; the orders are marked later in short transactions (no order lock held across the load).
        if (isDeleted) {
            const removed = await withAggregateLock(
                this.connection,
                ctx,
                `stock-organization:${entityId}`,
                async txCtx => {
                    const repo = this.connection.getRepository(txCtx, StockOrganization);
                    const rows = await repo.find({ where: { entityId } });
                    if (rows.length === 0) return false;
                    await repo.delete({ entityId });
                    await this.orderCheckStale.requestForProducts(txCtx, [
                        ...new Set(rows.map(row => row.productId)),
                    ]);
                    return true;
                },
            );
            if (removed) this.orderCheckStale.drainSoon();
            return removed
                ? inboundApplied()
                : inboundNoop(`stock-organization ${entityId}: deleted, nothing stored`);
        }
        if (!productId || !organizationErpId || !Number.isFinite(quantity)) {
            return inboundNoop(
                `stock-organization ${entityId}: missing productId/organizationId, skipping`,
            );
        }

        await withAggregateLock(
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
                await this.orderCheckStale.requestForProducts(txCtx, [productId]);
            },
        );
        return inboundApplied();
    }
}
