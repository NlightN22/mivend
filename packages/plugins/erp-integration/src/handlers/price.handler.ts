import { Injectable, Logger } from '@nestjs/common';
import { RequestContext, TransactionalConnection } from '@vendure/core';
import { CustomerPricingService } from '@mivend/plugin-customer-pricing';
import { PriceEntryService } from '@mivend/plugin-price-entry';

import type { InboundStreamHandler } from './inbound-stream-handler';
import { MissingDependencyError } from '../types';

const loggerCtx = 'IntegrationPriceHandler';

// Applies Integration Service's `price` stream (PriceChanged: productId/priceTypeId/value).
// priceTypeId is 1C's own GUID for the price type — resolved to a local PriceType via
// PriceType.externalId (see PriceTypeStreamHandler/issue #63's now-closed mapping gap).
@Injectable()
export class PriceStreamHandler implements InboundStreamHandler {
    constructor(
        private readonly connection: TransactionalConnection,
        private readonly customerPricingService: CustomerPricingService,
        private readonly priceEntryService: PriceEntryService,
    ) {}

    async apply(
        ctx: RequestContext,
        entityId: string,
        payload: Record<string, unknown>,
    ): Promise<void> {
        const productId = String(payload.productId ?? '');
        const priceTypeId = String(payload.priceTypeId ?? '');
        const value = Number.parseFloat(String(payload.value ?? ''));
        // Absent isActive means false, not true — see types.ts's InboundStream comment (proto3 bool
        // zero-value omission).
        const isActive = payload.isActive === true;
        const isDeleted = payload.isDeleted === true;

        if (!productId || !priceTypeId || Number.isNaN(value)) {
            Logger.warn(
                `price ${entityId}: missing productId/priceTypeId/value, skipping`,
                loggerCtx,
            );
            return;
        }
        if (!isActive || isDeleted) {
            Logger.verbose(`price ${entityId}: inactive/deleted, skipping`, loggerCtx);
            return;
        }

        // Out-of-order stream delivery: the price-type event for this GUID may not have been
        // processed yet. Not a bug — skip and let a later retry/version pick it up.
        const priceType = await this.customerPricingService.findPriceTypeByExternalId(
            ctx,
            priceTypeId,
        );
        if (!priceType) {
            // Issue #96: ordinary eventual-consistency race (price-type stream not consumed yet),
            // not a malformed payload — retry via MissingDependencyError instead of dropping.
            throw new MissingDependencyError(
                `price ${entityId}: no PriceType found for priceTypeId=${priceTypeId}`,
            );
        }

        const variant = await this.connection.rawConnection
            .createQueryBuilder()
            .select('pv.id', 'id')
            .from('product_variant', 'pv')
            .innerJoin('product', 'p', 'p.id = pv."productId"')
            .where('p."customFieldsExternalid" = :productId', { productId })
            .getRawOne<{ id: string }>();

        if (!variant) {
            throw new MissingDependencyError(
                `price ${entityId}: variant not found for productId=${productId}`,
            );
        }

        const priceInCents = Math.round(value * 100);
        await this.priceEntryService.upsert(ctx, variant.id, priceType.code, priceInCents);
        Logger.verbose(
            `Upserted price productId=${productId} priceType=${priceType.code} value=${value}`,
            loggerCtx,
        );
    }
}
