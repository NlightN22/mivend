import { Injectable } from '@nestjs/common';
import { RequestContext, TransactionalConnection } from '@vendure/core';
import { withAggregateLock } from 'shared';

import { SettlementBalance } from './entities/settlement-balance.entity';
import { SettlementDocumentEntry } from './entities/settlement-document-entry.entity';
import { SettlementOrderLink } from './entities/settlement-order-link.entity';
import { contractLockKey, counterpartyLockKey, orderLockKey } from './settlement-locks';

// Attaches rows stored before the counterparty/contract/order they reference existed; each attach
// takes the lock the write path takes for that reference, so a concurrent row is never missed.
@Injectable()
export class SettlementPendingService {
    constructor(private readonly connection: TransactionalConnection) {}

    attachCounterparty(ctx: RequestContext, erpId: string, localId: string): Promise<number> {
        return withAggregateLock(this.connection, ctx, counterpartyLockKey(erpId), async txCtx => {
            const entries = await this.update(
                txCtx,
                SettlementDocumentEntry,
                'settlement_document_entry',
                'counterpartyId',
                'counterpartyErpId',
                erpId,
                localId,
            );
            const balances = await this.update(
                txCtx,
                SettlementBalance,
                'settlement_balance',
                'counterpartyId',
                'counterpartyErpId',
                erpId,
                localId,
            );
            return entries + balances;
        });
    }

    attachContract(ctx: RequestContext, erpId: string, localId: string): Promise<number> {
        return withAggregateLock(this.connection, ctx, contractLockKey(erpId), async txCtx => {
            const entries = await this.update(
                txCtx,
                SettlementDocumentEntry,
                'settlement_document_entry',
                'contractId',
                'contractErpId',
                erpId,
                localId,
            );
            const balances = await this.update(
                txCtx,
                SettlementBalance,
                'settlement_balance',
                'contractId',
                'contractErpId',
                erpId,
                localId,
            );
            return entries + balances;
        });
    }

    attachOrder(ctx: RequestContext, orderErpId: string): Promise<number> {
        return withAggregateLock(this.connection, ctx, orderLockKey(orderErpId), async txCtx => {
            const [rows]: [unknown[], number] = await this.connection
                .getRepository(txCtx, SettlementOrderLink)
                .query(
                    `UPDATE settlement_order_link l SET "orderId" = o.id
                     FROM "order" o
                     WHERE l."orderId" IS NULL
                       AND o."customFieldsErporderid" = $1
                       AND (l."orderErpId" = o."customFieldsErporderid"
                            OR (l."orderUuid" IS NOT NULL AND l."orderUuid" = o."customFieldsUuid"::text))
                     RETURNING l.id`,
                    [orderErpId],
                );
            return rows.length;
        });
    }

    // Matches by the link's own ERP order id or order uuid, so a mivend order created after the
    // document arrived (and not yet carrying an erpOrderId) is found too.
    attachOrderForLink(ctx: RequestContext, linkOrderErpId: string): Promise<number> {
        return withAggregateLock(
            this.connection,
            ctx,
            orderLockKey(linkOrderErpId),
            async txCtx => {
                const [rows]: [unknown[], number] = await this.connection
                    .getRepository(txCtx, SettlementOrderLink)
                    .query(
                        `UPDATE settlement_order_link l SET "orderId" = o.id
                         FROM "order" o
                         WHERE l."orderId" IS NULL
                           AND l."orderErpId" = $1
                           AND (o."customFieldsErporderid" = l."orderErpId"
                                OR (l."orderUuid" IS NOT NULL
                                    AND l."orderUuid" = o."customFieldsUuid"::text))
                         RETURNING l.id`,
                        [linkOrderErpId],
                    );
                return rows.length;
            },
        );
    }

    private async update(
        ctx: RequestContext,
        entity: typeof SettlementDocumentEntry | typeof SettlementBalance,
        table: string,
        idColumn: string,
        erpColumn: string,
        erpId: string,
        localId: string,
    ): Promise<number> {
        const [rows]: [unknown[], number] = await this.connection.getRepository(ctx, entity).query(
            `UPDATE ${table} SET "${idColumn}" = $1
                 WHERE "${erpColumn}" = $2 AND "${idColumn}" IS NULL
                 RETURNING id`,
            [localId, erpId],
        );
        return rows.length;
    }
}
