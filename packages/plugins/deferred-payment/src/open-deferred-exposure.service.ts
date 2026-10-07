import { Injectable } from '@nestjs/common';
import {
    GlobalSettingsService,
    ID,
    Payment,
    RequestContext,
    TransactionalConnection,
} from '@vendure/core';

import { DEFAULT_DEFERRED_ORDER_MAX_AGE_DAYS } from './constants';
import { DEFERRED_PAYMENT_METHOD_CODE } from './deferred-payment-handler';

// Deferred orders neither confirmed by ERP nor reflected in its credit balance yet.
const UNCONFIRMED_ERP_STATUSES = ['PENDING', 'SENT_TO_ERP', 'RESERVED'];

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

    // Rubles, excluding `excludeOrderId` (the order being paid right now) and cancelled or
    // too-old orders.
    async sumUnconfirmedRubles(
        ctx: RequestContext,
        counterpartyId: ID,
        excludeOrderId: ID,
    ): Promise<number> {
        const maxAgeDays = await this.maxAgeDays(ctx);
        const rows: Array<{ total: string | null }> = await this.connection
            .getRepository(ctx, Payment)
            .query(
                `SELECT COALESCE(SUM(p.amount), 0) AS total
                 FROM payment p
                 INNER JOIN "order" o ON o.id = p."orderId"
                 INNER JOIN customer cu ON cu.id = o."customerId"
                 WHERE cu."customFieldsCounterpartyid"::text = $1
                   AND p.method = $2
                   AND p.state IN ('Authorized', 'Settled')
                   AND o.id <> $3
                   AND o."customFieldsErpstatus" = ANY($4)
                   AND o.state <> 'Cancelled'
                   AND o."orderPlacedAt" > now() - make_interval(days => $5::int)`,
                [
                    String(counterpartyId),
                    DEFERRED_PAYMENT_METHOD_CODE,
                    excludeOrderId,
                    UNCONFIRMED_ERP_STATUSES,
                    maxAgeDays,
                ],
            );
        return Number(rows[0]?.total ?? 0) / 100;
    }
}
