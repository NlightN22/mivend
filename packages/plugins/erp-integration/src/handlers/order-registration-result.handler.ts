import { Injectable, Logger } from '@nestjs/common';
import { RequestContext, TransactionalConnection } from '@vendure/core';
import { ReservationWriteOffSyncService } from '@mivend/plugin-reservation';

import type { InboundStreamHandler } from './inbound-stream-handler';

const loggerCtx = 'IntegrationOrderRegistrationResultHandler';

// Applies Integration Service's company.orders.events.v1.order-registration-result stream
// (issue #75, the real reservation-release trigger issue #72's release-on-status attempts
// deferred to). Only decodes the payload shape and resolves reservedLines' 1C productId to a
// Vendure ProductVariant id (same join StockStreamHandler already uses) — the actual
// order-correlation, release, and discrepancy decision live in
// ReservationWriteOffSyncService, kept plugin-reservation's own concern.
@Injectable()
export class OrderRegistrationResultHandler implements InboundStreamHandler {
    constructor(
        private readonly connection: TransactionalConnection,
        private readonly reservationWriteOffSyncService: ReservationWriteOffSyncService,
    ) {}

    async apply(
        ctx: RequestContext,
        entityId: string,
        payload: Record<string, unknown>,
    ): Promise<void> {
        if (payload.isDeleted === true) {
            Logger.verbose(`order-registration-result ${entityId}: deleted, skipping`, loggerCtx);
            return;
        }

        const orderEntityId = payload.orderEntityId != null ? String(payload.orderEntityId) : null;
        const rejected = payload.businessRejectionReason != null;

        const rawLines = Array.isArray(payload.reservedLines) ? payload.reservedLines : [];
        const reservedLines: Array<{ productVariantId: string; reservedQuantity: number }> = [];
        // mivend.audit.72's HIGH finding: a productId that never resolves to a ProductVariant
        // (stale/missing externalId mapping) must be reported, not just dropped — otherwise it's
        // indistinguishable downstream from "1C hasn't confirmed this line yet" and silently
        // blocks release forever.
        const unresolvedProductIds: string[] = [];
        for (const rawLine of rawLines) {
            const line = rawLine as Record<string, unknown>;
            const productId = line.productId != null ? String(line.productId) : '';
            const reservedQuantity = Number(line.reservedQuantity ?? NaN);
            if (!productId || Number.isNaN(reservedQuantity)) {
                Logger.warn(
                    `order-registration-result ${entityId}: skipping line with missing productId/reservedQuantity`,
                    loggerCtx,
                );
                continue;
            }

            const variantId = await this.findVariantId(productId);
            if (!variantId) {
                Logger.warn(
                    `order-registration-result ${entityId}: variant not found for productId=${productId}`,
                    loggerCtx,
                );
                unresolvedProductIds.push(productId);
                continue;
            }
            reservedLines.push({
                productVariantId: variantId,
                reservedQuantity: Math.round(reservedQuantity),
            });
        }

        await this.reservationWriteOffSyncService.handleOrderRegistrationResult(ctx, {
            orderEntityId,
            rejected,
            reservedLines,
            unresolvedProductIds,
        });
    }

    private async findVariantId(productId: string): Promise<string | undefined> {
        const row = await this.connection.rawConnection
            .createQueryBuilder()
            .select('pv.id', 'id')
            .from('product_variant', 'pv')
            .innerJoin('product', 'p', 'p.id = pv."productId"')
            .where('p."customFieldsExternalid" = :productId', { productId })
            .getRawOne<{ id: string }>();
        return row?.id;
    }
}
