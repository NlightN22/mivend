import { Injectable } from '@nestjs/common';
import { Order, RequestContext, TransactionalConnection } from '@vendure/core';
import { ContractService, CounterpartyService } from '@mivend/plugin-counterparty';

export interface ResolvedReferences {
    counterparties: Map<string, string>;
    contracts: Map<string, string>;
    orders: Map<string, number>;
}

export interface ReferenceKeys {
    counterpartyErpIds: Iterable<string>;
    contractErpIds: Iterable<string>;
    orders: Iterable<{ orderErpId: string; orderUuid: string | null }>;
}

// Resolves ERP ids to local ids; a missing one is simply absent from the map (pending).
@Injectable()
export class SettlementReferenceResolver {
    constructor(
        private readonly connection: TransactionalConnection,
        private readonly counterpartyService: CounterpartyService,
        private readonly contractService: ContractService,
    ) {}

    async resolve(ctx: RequestContext, keys: ReferenceKeys): Promise<ResolvedReferences> {
        const counterparties = new Map<string, string>();
        for (const erpId of new Set(keys.counterpartyErpIds)) {
            const found = await this.counterpartyService.findByErpId(ctx, erpId);
            if (found) counterparties.set(erpId, String(found.id));
        }
        const contracts = new Map<string, string>();
        for (const erpId of new Set(keys.contractErpIds)) {
            const found = await this.contractService.findByErpId(ctx, erpId);
            if (found) contracts.set(erpId, String(found.id));
        }
        return { counterparties, contracts, orders: await this.resolveOrders(ctx, keys.orders) };
    }

    private async resolveOrders(
        ctx: RequestContext,
        links: ReferenceKeys['orders'],
    ): Promise<Map<string, number>> {
        const erpIds = new Set<string>();
        const uuids = new Set<string>();
        for (const link of links) {
            erpIds.add(link.orderErpId);
            if (link.orderUuid) uuids.add(link.orderUuid);
        }
        const resolved = new Map<string, number>();
        if (erpIds.size === 0) return resolved;
        const rows: Array<{ id: number; erpOrderId: string | null; uuid: string | null }> =
            await this.connection.getRepository(ctx, Order).query(
                `SELECT id, "customFieldsErporderid" AS "erpOrderId", "customFieldsUuid"::text AS uuid
                 FROM "order"
                 WHERE "customFieldsErporderid" = ANY($1::text[])
                    OR "customFieldsUuid"::text = ANY($2::text[])`,
                [[...erpIds], [...uuids]],
            );
        for (const link of links) {
            const match =
                rows.find(r => r.erpOrderId === link.orderErpId) ??
                (link.orderUuid ? rows.find(r => r.uuid === link.orderUuid) : undefined);
            if (match) resolved.set(link.orderErpId, Number(match.id));
        }
        return resolved;
    }
}
