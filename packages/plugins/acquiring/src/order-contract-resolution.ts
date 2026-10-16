import type { ID, RequestContext } from '@vendure/core';
import type { Contract } from '@mivend/plugin-counterparty';
import type { ContractService, CounterpartyService } from '@mivend/plugin-counterparty';

export interface ContractResolutionDeps {
    counterparties: CounterpartyService;
    contracts: ContractService;
}

// The order is registered in the ERP under one contract; null when the customer has no usable one (#205).
export async function resolveOrderContractFor(
    deps: ContractResolutionDeps,
    ctx: RequestContext,
    order: { customerId?: ID | null; selectedContractId?: string | null },
): Promise<Contract | null> {
    if (!order.customerId) return null;
    const counterparty = await deps.counterparties.getForCustomer(ctx, order.customerId);
    if (!counterparty) return null;
    return deps.contracts.resolveOrderContract(
        ctx,
        counterparty,
        order.selectedContractId,
        order.customerId,
    );
}
