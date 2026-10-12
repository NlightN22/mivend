import { Injectable } from '@nestjs/common';
import {
    GlobalSettingsService,
    ID,
    Payment,
    RequestContext,
    TransactionalConnection,
} from '@vendure/core';
import { PLACEMENT_KEY } from 'shared';

import { DEFAULT_DEFERRED_ORDER_MAX_AGE_DAYS } from './constants';

// Orders whose debt is not in the ERP credit balance yet: it appears only with the sales document
// (realization, SHIPPING and later). REJECTED is excluded (#204) so it stops blocking the limit.
export const UNCONFIRMED_ERP_STATUSES = [
    'PENDING',
    'SENT_TO_ERP',
    'RESERVED',
    'CONFIRMED',
    'UNDER_APPROVAL',
    'APPROVED',
    'PICKING',
];

@Injectable()
export class OpenDeferredExposureService {
    constructor(
        private readonly connection: TransactionalConnection,
        private readonly globalSettingsService: GlobalSettingsService,
    ) {}

    // Interim cap until ERP-driven TTL cancellation exists: an older open order stops counting.
    private async maxAgeDays(ctx: RequestContext): Promise<number> {
        const settings = await this.globalSettingsService.getSettings(ctx);
        const days = settings.customFields?.deferredOrderMaxAgeDays;
        return days && days > 0 ? days : DEFAULT_DEFERRED_ORDER_MAX_AGE_DAYS;
    }

    // Per order, once: order total minus Settled payments, for orders with a live payment that does not
    // opt out (card awaiting payment). Excludes `excludeOrderId`, cancelled and too-old orders.
    async sumUnconfirmedRubles(
        ctx: RequestContext,
        counterpartyId: ID,
        excludeOrderId: ID,
    ): Promise<number> {
        const maxAgeDays = await this.maxAgeDays(ctx);
        const rows: Array<{ total: string | null }> = await this.connection
            .getRepository(ctx, Payment)
            .query(
                `SELECT COALESCE(SUM(GREATEST(
                        o."subTotalWithTax" + o."shippingWithTax" - COALESCE((
                            SELECT SUM(paid.amount) FROM payment paid
                            WHERE paid."orderId" = o.id AND paid.state = 'Settled'
                        ), 0), 0)), 0) AS total
                 FROM "order" o
                 INNER JOIN customer cu ON cu.id = o."customerId"
                 WHERE cu."customFieldsCounterpartyid"::text = $1
                   AND EXISTS (
                       SELECT 1 FROM payment p
                       WHERE p."orderId" = o.id AND p.state IN ('Created', 'Authorized', 'Settled')
                         AND COALESCE(p.metadata::jsonb -> $2::text ->> 'countsAgainstLimit', 'true') <> 'false'
                   )
                   AND o.id <> $3
                   AND o."customFieldsErpstatus" = ANY($4)
                   AND o.state <> 'Cancelled'
                   AND o."orderPlacedAt" > now() - make_interval(days => $5::int)`,
                [
                    String(counterpartyId),
                    PLACEMENT_KEY,
                    excludeOrderId,
                    UNCONFIRMED_ERP_STATUSES,
                    maxAgeDays,
                ],
            );
        return Number(rows[0]?.total ?? 0) / 100;
    }
}
