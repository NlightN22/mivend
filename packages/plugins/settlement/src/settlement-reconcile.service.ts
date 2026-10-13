import { Injectable, OnApplicationBootstrap } from '@nestjs/common';
import {
    Logger,
    ProcessContext,
    RequestContext,
    RequestContextService,
    TransactionalConnection,
} from '@vendure/core';

import { SettlementDocumentEntry } from './entities/settlement-document-entry.entity';
import { SettlementOrderLink } from './entities/settlement-order-link.entity';
import { SettlementPendingService } from './settlement-pending.service';
import { SettlementReferenceResolver } from './settlement-reference-resolver';
import { loggerCtx } from './types';

const PAGE_SIZE = 200;
const MAX_PAGES = 50;

export interface SettlementReconcileResult {
    counterparties: number;
    contracts: number;
    orderLinks: number;
}

// Safety net for the CounterpartyCreated/ContractChanged/order-changed attach paths: attaches
// rows stored before their counterparty, contract or order existed. Idempotent, lock per key.
@Injectable()
export class SettlementReconcileService implements OnApplicationBootstrap {
    constructor(
        private readonly connection: TransactionalConnection,
        private readonly resolver: SettlementReferenceResolver,
        private readonly pending: SettlementPendingService,
        private readonly processContext: ProcessContext,
        private readonly requestContextService: RequestContextService,
    ) {}

    onApplicationBootstrap(): void {
        if (!this.processContext.isWorker) return;
        this.requestContextService
            .create({ apiType: 'admin' })
            .then(ctx => this.reconcile(ctx))
            .catch(err =>
                Logger.error(`Settlement bootstrap reconcile failed: ${String(err)}`, loggerCtx),
            );
    }

    async reconcile(ctx: RequestContext): Promise<SettlementReconcileResult> {
        const counterparties = await this.attachReferences(ctx, 'counterparty');
        const contracts = await this.attachReferences(ctx, 'contract');
        const orderLinks = await this.attachOrderLinks(ctx);
        Logger.info(
            `Settlement reconcile: attached ${counterparties} counterparty, ${contracts} contract, ${orderLinks} order link row(s)`,
            loggerCtx,
        );
        return { counterparties, contracts, orderLinks };
    }

    private async attachReferences(
        ctx: RequestContext,
        kind: 'counterparty' | 'contract',
    ): Promise<number> {
        const erpColumn = kind === 'counterparty' ? 'counterpartyErpId' : 'contractErpId';
        const idColumn = kind === 'counterparty' ? 'counterpartyId' : 'contractId';
        let attached = 0;
        let after = '';
        for (let page = 0; page < MAX_PAGES; page += 1) {
            const rows: Array<{ erpId: string }> = await this.connection
                .getRepository(ctx, SettlementDocumentEntry)
                .query(
                    `SELECT erp AS "erpId" FROM (
                     SELECT "${erpColumn}" AS erp FROM settlement_document_entry
                      WHERE "${idColumn}" IS NULL
                     UNION
                     SELECT "${erpColumn}" FROM settlement_balance WHERE "${idColumn}" IS NULL
                 ) u WHERE erp > $1 ORDER BY erp LIMIT ${PAGE_SIZE}`,
                    [after],
                );
            if (rows.length === 0) break;
            const ids = rows.map(r => r.erpId);
            const resolved = await this.resolver.resolve(ctx, {
                counterpartyErpIds: kind === 'counterparty' ? ids : [],
                contractErpIds: kind === 'contract' ? ids : [],
                orders: [],
            });
            const map = kind === 'counterparty' ? resolved.counterparties : resolved.contracts;
            for (const [erpId, localId] of map) {
                attached +=
                    kind === 'counterparty'
                        ? await this.pending.attachCounterparty(ctx, erpId, localId)
                        : await this.pending.attachContract(ctx, erpId, localId);
            }
            if (rows.length < PAGE_SIZE) break;
            after = ids[ids.length - 1];
        }
        return attached;
    }

    private async attachOrderLinks(ctx: RequestContext): Promise<number> {
        let attached = 0;
        let after = '';
        for (let page = 0; page < MAX_PAGES; page += 1) {
            const rows: Array<{ erpId: string }> = await this.connection
                .getRepository(ctx, SettlementOrderLink)
                .query(
                    `SELECT m."erpId" FROM (
                     SELECT l."orderErpId" AS "erpId" FROM settlement_order_link l
                       JOIN "order" o ON o."customFieldsErporderid" = l."orderErpId"
                      WHERE l."orderId" IS NULL
                     UNION
                     SELECT l."orderErpId" FROM settlement_order_link l
                       JOIN "order" o ON o."customFieldsUuid"::text = l."orderUuid"
                      WHERE l."orderId" IS NULL
                 ) m WHERE m."erpId" > $1 ORDER BY 1 LIMIT ${PAGE_SIZE}`,
                    [after],
                );
            for (const { erpId } of rows) {
                attached += await this.pending.attachOrderForLink(ctx, erpId);
            }
            if (rows.length < PAGE_SIZE) break;
            after = rows[rows.length - 1].erpId;
        }
        return attached;
    }
}
