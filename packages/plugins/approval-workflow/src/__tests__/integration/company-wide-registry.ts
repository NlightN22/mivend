import type { TransactionalConnection } from '@vendure/core';

import { ApprovalScopeRegistry } from '../../approval-scope.registry';

// The engine tests' request types, all declared company-wide: scope rules are tested separately.
export function companyWideRegistry(connection: TransactionalConnection): ApprovalScopeRegistry {
    const registry = new ApprovalScopeRegistry(connection);
    for (const type of ['priceAdjustmentApproval', 'discountGrantApproval', 'otherApproval'])
        registry.register(type, null);
    return registry;
}
