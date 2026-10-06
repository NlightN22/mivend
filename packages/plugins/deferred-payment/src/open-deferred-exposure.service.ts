import { Injectable } from '@nestjs/common';
import { ID, Payment, RequestContext, TransactionalConnection } from '@vendure/core';

import { DEFERRED_PAYMENT_METHOD_CODE } from './deferred-payment-handler';

// Deferred orders neither confirmed by ERP nor reflected in its credit balance yet.
const UNCONFIRMED_ERP_STATUSES = ['PENDING', 'SENT_TO_ERP', 'RESERVED'];

@Injectable()
export class OpenDeferredExposureService {
    constructor(private readonly connection: TransactionalConnection) {}

    // Rubles, excluding `excludeOrderId` (the order being paid right now).
    async sumUnconfirmedRubles(
        ctx: RequestContext,
        counterpartyId: ID,
        excludeOrderId: ID,
    ): Promise<number> {
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
                   AND o."customFieldsErpstatus" = ANY($4)`,
                [
                    String(counterpartyId),
                    DEFERRED_PAYMENT_METHOD_CODE,
                    excludeOrderId,
                    UNCONFIRMED_ERP_STATUSES,
                ],
            );
        return Number(rows[0]?.total ?? 0) / 100;
    }
}
