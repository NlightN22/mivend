import { Injectable } from '@nestjs/common';
import { ListQueryBuilder, Order, PaginatedList, RequestContext } from '@vendure/core';
import { OrderListOptions } from '@vendure/common/lib/generated-types';
import { Brackets, WhereExpressionBuilder } from 'typeorm';
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
        const scope = await this.accessScopeService.resolveOrderScope(ctx);
        const qb = this.listQueryBuilder.build(Order, options, { ctx });
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
                qb.andWhere('counterparty.assignedManagerId = :managerId', {
                    managerId: scope.administratorId ?? null,
                });
                break;
            case 'department':
                qb.andWhere(
                    'counterparty.departmentId = :departmentId AND counterparty.branchId = :branchId',
                    { departmentId: scope.departmentId ?? null, branchId: scope.branchId ?? null },
                );
                break;
            case 'all':
                break;
        }

        const [items, totalItems] = await qb.getManyAndCount();
        return { items, totalItems };
    }
}
