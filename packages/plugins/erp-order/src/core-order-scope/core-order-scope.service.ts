import { Injectable } from '@nestjs/common';
import type { ID } from '@vendure/common/lib/shared-types';
import { EntityNotFoundError, RequestContext } from '@vendure/core';
import { AccessScopeService } from '@mivend/plugin-access-control';
import { CounterpartyService } from '@mivend/plugin-counterparty';

import { OrderVisibilityService } from '../order-visibility.service';
import {
    CORE_ORDER_OPERATIONS,
    CUSTOMERLESS_DRAFT_OPERATIONS,
    OperationArgs,
    OrderTarget,
    targetIds,
} from './core-order-operations';
import { OrderTargetService } from './order-target.service';

const ENTITY_NAME: Record<OrderTarget['kind'], string> = {
    order: 'Order',
    orderLine: 'OrderLine',
    payment: 'Payment',
    fulfillment: 'Fulfillment',
    refund: 'Refund',
    orderNote: 'HistoryEntry',
    customer: 'Customer',
    customerEmail: 'Customer',
};

// Decides whether a registered core order operation stays inside the caller's order scope (#248).
@Injectable()
export class CoreOrderScopeService {
    constructor(
        private visibility: OrderVisibilityService,
        private targets: OrderTargetService,
        private counterparties: CounterpartyService,
        private accessScope: AccessScopeService,
    ) {}

    async assertInScope(ctx: RequestContext, field: string, args: OperationArgs): Promise<void> {
        const operation = CORE_ORDER_OPERATIONS[field];
        if (!operation || !('targets' in operation)) return;
        for (const target of operation.targets) {
            const ids = targetIds(target, args);
            const owners = await this.targets.owners(ctx, target.kind, ids);
            const denied =
                target.kind === 'customer' || target.kind === 'customerEmail'
                    ? await this.deniedCustomers(ctx, owners)
                    : await this.deniedOrderTargets(ctx, field, owners);
            if (denied) throw new EntityNotFoundError(ENTITY_NAME[target.kind], denied);
        }
    }

    private async deniedOrderTargets(
        ctx: RequestContext,
        field: string,
        owners: Map<string, Array<string | null>>,
    ): Promise<ID | undefined> {
        const orderIds = [
            ...new Set([...owners.values()].flat().filter((id): id is string => !!id)),
        ];
        const visible = await this.visibility.visibleIds(ctx, orderIds);
        const hidden = orderIds.filter(id => !visible.has(id));
        const drafts = CUSTOMERLESS_DRAFT_OPERATIONS.has(field)
            ? await this.targets.customerlessDraftIds(ctx, hidden)
            : new Set<string>();
        for (const [targetId, orderIds] of owners) {
            if (orderIds.some(id => id == null || (!visible.has(id) && !drafts.has(id)))) {
                return targetId;
            }
        }
        return undefined;
    }

    private async deniedCustomers(
        ctx: RequestContext,
        owners: Map<string, Array<string | null>>,
    ): Promise<ID | undefined> {
        for (const [customerId, [counterpartyId]] of owners) {
            const visible = counterpartyId
                ? !!(await this.counterparties.findOneVisible(ctx, counterpartyId))
                : (await this.accessScope.resolveCounterpartyScope(ctx)).kind === 'all';
            if (!visible) return customerId;
        }
        return undefined;
    }
}
