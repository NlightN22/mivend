import type { Injector, OrderProcess, OrderState, RequestContext } from '@vendure/core';
import { Order, TransactionalConnection } from '@vendure/core';
import type { Contract } from '@mivend/plugin-counterparty';
import { ContractService, CounterpartyService } from '@mivend/plugin-counterparty';

export const CONTRACT_MISSING_MESSAGE =
    'No active contract is available to register this order. Contact your manager.';

let connection: TransactionalConnection;
let counterparties: CounterpartyService;
let contracts: ContractService;

async function resolveContract(ctx: RequestContext, order: Order): Promise<Contract | null> {
    if (!order.customerId) return null;
    const counterparty = await counterparties.getForCustomer(ctx, order.customerId);
    if (!counterparty) return null;
    return contracts.resolveOrderContract(
        ctx,
        counterparty,
        order.customFields?.selectedContractId,
        order.customerId,
    );
}

// The order is registered in the ERP under one contract: without a usable one checkout stops here
// instead of failing after the reservation (#205).
export const contractOrderGuard: OrderProcess<OrderState> = {
    init(injector: Injector) {
        connection = injector.get(TransactionalConnection);
        counterparties = injector.get(CounterpartyService);
        contracts = injector.get(ContractService);
    },
    async onTransitionStart(_fromState, toState, { ctx, order }) {
        if (toState !== 'ArrangingPayment') return;
        if (!(await resolveContract(ctx, order))) return CONTRACT_MISSING_MESSAGE;
    },
    async onTransitionEnd(_fromState, toState, { ctx, order }) {
        if (toState !== 'ArrangingPayment') return;
        // Same order row lock as organizationOrderGuard: a concurrent refresh must commit first.
        await connection
            .getRepository(ctx, Order)
            .query('SELECT id FROM "order" WHERE id = $1 FOR UPDATE', [order.id]);
        const contract = await resolveContract(ctx, order);
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
