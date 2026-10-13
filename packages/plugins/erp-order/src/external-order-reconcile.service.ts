import { Injectable, OnApplicationBootstrap } from '@nestjs/common';
import {
    Logger,
    Order,
    ProcessContext,
    RequestContext,
    RequestContextService,
    TransactionalConnection,
} from '@vendure/core';
import { CounterpartyService } from '@mivend/plugin-counterparty';

import { ExternalOrderService } from './external-order.service';

const loggerCtx = 'ExternalOrderReconcile';
const PAGE_SIZE = 200;
const MAX_PAGES = 50;

// Safety net for CounterpartyCreatedEvent (crash window, import/seed paths): attaches pending
// external orders whose counterparty now exists. Idempotent; each attach takes the write lock.
@Injectable()
export class ExternalOrderReconcileService implements OnApplicationBootstrap {
    constructor(
        private readonly connection: TransactionalConnection,
        private readonly counterpartyService: CounterpartyService,
        private readonly externalOrders: ExternalOrderService,
        private readonly processContext: ProcessContext,
        private readonly requestContextService: RequestContextService,
    ) {}

    onApplicationBootstrap(): void {
        if (!this.processContext.isWorker) return;
        this.requestContextService
            .create({ apiType: 'admin' })
            .then(ctx => this.reconcilePendingCounterparties(ctx))
            .catch(err => Logger.error(`Bootstrap reconcile failed: ${String(err)}`, loggerCtx));
    }

    async reconcilePendingCounterparties(
        ctx: RequestContext,
    ): Promise<{ counterparties: number; orders: number }> {
        let counterparties = 0;
        let orders = 0;
        let after = '';
        for (let page = 0; page < MAX_PAGES; page += 1) {
            const rows: Array<{ erpId: string }> = await this.connection
                .getRepository(ctx, Order)
                .query(
                    `SELECT DISTINCT "customFieldsPendingcounterpartyerpid" AS "erpId" FROM "order"
                     WHERE "customFieldsPendingcounterpartyerpid" > $1
                       AND "customFieldsCounterpartyid" IS NULL
                     ORDER BY 1 LIMIT ${PAGE_SIZE}`,
                    [after],
                );
            for (const { erpId } of rows) {
                const counterparty = await this.counterpartyService.findByErpId(ctx, erpId);
                if (!counterparty) continue;
                counterparties += 1;
                orders += await this.externalOrders.attachCounterparty(
                    ctx,
                    erpId,
                    String(counterparty.id),
                );
            }
            if (rows.length < PAGE_SIZE) break;
            after = rows[rows.length - 1].erpId;
        }
        Logger.info(
            `External order reconcile: attached ${orders} order(s) for ${counterparties} counterparty(ies)`,
            loggerCtx,
        );
        return { counterparties, orders };
    }
}
