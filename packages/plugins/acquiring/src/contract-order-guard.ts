import type { Injector, OrderProcess, OrderState } from '@vendure/core';
import { Order, TransactionalConnection } from '@vendure/core';

import { ContractService, CounterpartyService } from '@mivend/plugin-counterparty';

import { resolveOrderContractFor } from './order-contract-resolution';
import type { ContractResolutionDeps } from './order-contract-resolution';

let connection: TransactionalConnection;
let deps: ContractResolutionDeps;

// Stamps the resolved contract; an order without a usable one is reported by the
// `order.contract-unresolved` check (docs/controls-inventory.md) and never stops checkout (#205, #241).
export const contractOrderGuard: OrderProcess<OrderState> = {
    init(injector: Injector) {
        connection = injector.get(TransactionalConnection);
        deps = {
            counterparties: injector.get(CounterpartyService),
            contracts: injector.get(ContractService),
        };
    },
    async onTransitionEnd(_fromState, toState, { ctx, order }) {
        if (toState !== 'ArrangingPayment') return;
        // Same order row lock as organizationOrderGuard: a concurrent refresh must commit first.
        await connection
            .getRepository(ctx, Order)
            .query('SELECT id FROM "order" WHERE id = $1 FOR UPDATE', [order.id]);
        const contract = await resolveOrderContractFor(deps, ctx, {
            customerId: order.customerId,
            selectedContractId: order.customFields?.selectedContractId,
        });
        if (!contract) return;
        await connection.getRepository(ctx, Order).query(
            `UPDATE "order" SET "customFieldsSelectedcontractid" = $2
             WHERE id = $1 AND "customFieldsSelectedcontractid" IS DISTINCT FROM $2`,
            [order.id, contract.erpId],
        );
        // Vendure saves this in-memory order right after the hook and would erase the UPDATE above.
        order.customFields = { ...order.customFields, selectedContractId: contract.erpId };
    },
};
