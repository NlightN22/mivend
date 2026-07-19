import { Injectable } from '@nestjs/common';
import { ListQueryBuilder, Order, PaginatedList, RequestContext } from '@vendure/core';
import { OrderListOptions } from '@vendure/common/lib/generated-types';
import { Brackets, SelectQueryBuilder, WhereExpressionBuilder } from 'typeorm';
import { AccessScopeService } from '@mivend/plugin-access-control';
import { Counterparty } from '@mivend/plugin-counterparty';

/**
 * Row-level visibility for the manager portal's order list — mirrors
 * CounterpartyService.findVisible (see docs/access-control.md, layer 3). Order has no direct
 * department/branch/manager column of its own, so scope is resolved by joining through
 * Customer -> Counterparty, which already carries assignedManagerId/departmentId/branchId.
 */
@Injectable()
export class OrderVisibilityService {
    constructor(
        private listQueryBuilder: ListQueryBuilder,
        private accessScopeService: AccessScopeService,
    ) {}

    // Exposed separately from findVisible() so plugin-acquiring can extend this same scoped
    // query with its own real payment-status subquery filter before executing — see
    // AdminPaymentOrderResolver.visibleOrdersByPaymentView in plugin-acquiring for why this
    // can't just live here: erp-order can't depend on plugin-acquiring's PaymentAttempt entity
    // (plugin-acquiring already depends on plugin-erp-order transitively via plugin-sync, so the
    // reverse edge would be a circular package dependency — confirmed via a real `tsc -b`
    // "Project references may not form a circular graph" error when this was tried the other
    // way). plugin-acquiring depending on plugin-erp-order instead has no such cycle.
    async buildVisibleOrdersQuery(
        ctx: RequestContext,
        options?: OrderListOptions,
        managerId?: string,
        customerId?: string,
        search?: string,
    ): Promise<SelectQueryBuilder<Order>> {
        const scope = await this.accessScopeService.resolveOrderScope(ctx);
        // `lines` and `fulfillments` aren't joined by ListQueryBuilder by default — without
        // them, Vendure's own Order.totalQuantity field resolver throws ("requires the
        // Order.lines relation to be joined") the moment a caller asks for it, e.g.
        // CustomerOrdersTab.vue's Items/Fulfillment columns (see api/customers.ts's
        // CUSTOMER_ORDER_ITEM_FIELDS).
        const qb = this.listQueryBuilder.build(Order, options, {
            ctx,
            relations: ['lines', 'fulfillments'],
        });
        qb.leftJoinAndSelect(`${qb.alias}.customer`, 'customer').leftJoin(
            Counterparty,
            'counterparty',
            'customer."customFieldsCounterpartyid"::text = counterparty.id::text',
        );

        if (managerId) {
            qb.andWhere('counterparty.assignedManagerId = :filterManagerId', {
                filterManagerId: managerId,
            });
        }
        if (customerId) {
            qb.andWhere('customer.id = :filterCustomerId', { filterCustomerId: customerId });
        }
        if (search) {
            const term = `%${search}%`;
            qb.andWhere(
                new Brackets((bqb: WhereExpressionBuilder) => {
                    bqb.where(`${qb.alias}.code ILIKE :term`, { term })
                        .orWhere('customer.phoneNumber ILIKE :term', { term })
                        .orWhere('counterparty.shortName ILIKE :term', { term })
                        .orWhere('counterparty.legalName ILIKE :term', { term })
                        .orWhere('counterparty.inn ILIKE :term', { term });
                }),
            );
        }

        switch (scope.kind) {
            case 'own':
                // No branch restriction here — this is the key-account-manager read exception
                // from docs/access-control.md: an administrator scoped to their own assigned
                // accounts must see every order for those accounts regardless of which branch
                // actually serviced it (a chain customer's locations can span branches). Adding
                // `AND order.branchId = mine` here would silently hide a manager's own orders
                // placed against an out-of-branch trading point — don't add it.
                this.accessScopeService.applyOwnCounterpartyFilter(
                    qb,
                    'counterparty',
                    scope.administratorId,
                );
                break;
            case 'department':
                // Filtered by the order's own denormalized servicing branch
                // (`${qb.alias}."customFieldsBranchid"`, set at placement time from the
                // customer's preferred TradingPoint — see ErpOrderService.onOrderPlaced), not
                // Counterparty.branchId. A chain account's "home" branch and the branch that
                // actually services a given order can differ; department-scoped roles (e.g.
                // branch-office-director) must see orders their own branch handles, not orders
                // for customers nominally "based" there. See docs/access-control.md's "Branch
                // scope is a separate axis" section.
                // `order` is a reserved SQL keyword — TypeORM's alias.property auto-quoting
                // only fires for a bare `alias.propertyName` it can resolve against entity
                // metadata; mixing the raw alias with an already-quoted raw column name here
                // bypasses that pass entirely, so the alias itself must be quoted explicitly or
                // this becomes `syntax error at or near "order"` at query time (same class of
                // bug as AGENTS.md's documented Brackets-alias gotcha, but here it hit even
                // outside a Brackets callback because of the raw-column mixing).
                qb.andWhere(
                    `counterparty.departmentId = :departmentId AND "${qb.alias}"."customFieldsBranchid" = :branchId`,
                    { departmentId: scope.departmentId ?? null, branchId: scope.branchId ?? null },
                );
                break;
            case 'all':
                break;
        }

        return qb;
    }

    async findVisible(
        ctx: RequestContext,
        options?: OrderListOptions,
        // Filters by the assigned manager on the customer's counterparty — not expressible via
        // the generic OrderListOptions.filter object since it's a joined column, not a plain
        // Order field. Used by the Orders list's "Manager" filter (Operator/Dept Head only).
        managerId?: string,
        // Order has no plain-column customerId exposed via OrderFilterParameter (only
        // customerLastName, a contains filter) — used by the customer detail page's Orders tab
        // to show only that customer's orders.
        customerId?: string,
        // Free-text search across order code + counterparty company name/INN + customer phone —
        // deliberately server-side, not expressible via OrderFilterParameter._or (see #38):
        // company name/INN/phone all live on the joined Counterparty/Customer rows, not on
        // Order itself.
        search?: string,
    ): Promise<PaginatedList<Order>> {
        const qb = await this.buildVisibleOrdersQuery(ctx, options, managerId, customerId, search);
        const [items, totalItems] = await qb.getManyAndCount();
        return { items, totalItems };
    }
}
