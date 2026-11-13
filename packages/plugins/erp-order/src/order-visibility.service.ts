import { Injectable } from '@nestjs/common';
import {
    ID,
    ListQueryBuilder,
    Order,
    PaginatedList,
    RequestContext,
    UserInputError,
} from '@vendure/core';
import { OrderListOptions } from '@vendure/common/lib/generated-types';
import { Brackets, SelectQueryBuilder, WhereExpressionBuilder } from 'typeorm';
import { getManyBounded, getPageAndCount, likeTerm, normalizeDocumentNumber } from 'shared';
import { AccessScopeService, BranchSettingsService } from '@mivend/plugin-access-control';
import { Counterparty } from '@mivend/plugin-counterparty';
import { orderBranchClause } from './order-branch-clause';
import { orderCounterpartyJoinSql } from './order-counterparty-join';

const MAX_SEARCH_LENGTH = 200;

// Must stay in sync with CounterpartyService.findVisible (access-control layer 3).
@Injectable()
export class OrderVisibilityService {
    constructor(
        private listQueryBuilder: ListQueryBuilder,
        private accessScopeService: AccessScopeService,
        private branchSettingsService: BranchSettingsService,
    ) {}

    // Split out so plugin-acquiring can add its payment-status filter before executing.
    // Can't move it there: plugin-erp-order can't depend on plugin-acquiring (circular package refs).
    async buildVisibleOrdersQuery(
        ctx: RequestContext,
        options?: OrderListOptions,
        managerId?: string,
        customerId?: string,
        search?: string,
        relations: string[] = [],
    ): Promise<SelectQueryBuilder<Order>> {
        // Vendure's Order.totalQuantity resolver throws unless lines and fulfillments are joined here.
        const qb = this.listQueryBuilder.build(Order, options, {
            ctx,
            relations: [
                ...new Set([
                    'lines',
                    'fulfillments',
                    ...relations.filter(r => !r.startsWith('customer')),
                ]),
            ],
        });
        qb.leftJoinAndSelect(`${qb.alias}.customer`, 'customer').leftJoin(
            Counterparty,
            'counterparty',
            orderCounterpartyJoinSql(qb.alias),
        );

        await this.applyVisibility(qb, ctx, managerId, customerId, search);
        return qb;
    }

    // qb must alias the order table and join `customer` and `counterparty` (orderCounterpartyJoinSql).
    async applyVisibility(
        qb: SelectQueryBuilder<Order>,
        ctx: RequestContext,
        managerId?: string,
        customerId?: string,
        search?: string,
    ): Promise<void> {
        const scope = await this.accessScopeService.resolveOrderScope(ctx);
        if (managerId) {
            qb.andWhere('counterparty.assignedManagerId = :filterManagerId', {
                filterManagerId: managerId,
            });
        }
        if (customerId) {
            qb.andWhere('customer.id = :filterCustomerId', { filterCustomerId: customerId });
        }
        if (search) {
            if (search.length > MAX_SEARCH_LENGTH) {
                throw new UserInputError(`Search is limited to ${MAX_SEARCH_LENGTH} characters`);
            }
            const term = likeTerm(search);
            // code's own term undoes the display-only dash (docs/identifiers.md) separately —
            // the other fields match the literal search term as-is.
            const codeTerm = likeTerm(normalizeDocumentNumber(search));
            qb.andWhere(
                new Brackets((bqb: WhereExpressionBuilder) => {
                    bqb.where(`${qb.alias}.code ILIKE :codeTerm`, { codeTerm })
                        .orWhere('customer.phoneNumber ILIKE :term', { term })
                        .orWhere('counterparty.shortName ILIKE :term', { term })
                        .orWhere('counterparty.legalName ILIKE :term', { term })
                        .orWhere('counterparty.inn ILIKE :term', { term });
                }),
            );
        }

        switch (scope.kind) {
            case 'own':
                // Deliberately no branch restriction: key-account managers must see all orders for their accounts,
                // even those serviced at another branch (chain customers span branches).
                this.accessScopeService.applyOwnCounterpartyFilter(qb, 'counterparty', scope);
                break;
            case 'department': {
                // Never the placement snapshot: external orders have none and counterparties move (#263).
                const branch = orderBranchClause(
                    qb.alias,
                    'counterparty',
                    scope.branchId ?? null,
                    await this.branchSettingsService.getGlobalDefaultBranchId(ctx),
                );
                const managers = this.accessScopeService.managerClause(scope, 'counterparty');
                qb.andWhere(`(${branch.sql}${managers ? ` OR ${managers.sql}` : ''})`, {
                    ...branch.params,
                    ...managers?.params,
                });
                break;
            }
            case 'all':
                break;
        }
    }

    // The caller's visible order ids as SQL for another plugin's own filter; null for scope 'all'.
    async visibleIdsSql(
        ctx: RequestContext,
    ): Promise<{ sql: string; params: Record<string, unknown> } | null> {
        if ((await this.accessScopeService.resolveOrderScope(ctx)).kind === 'all') return null;
        const qb = await this.buildVisibleOrdersQuery(ctx);
        qb.select(`CAST("${qb.alias}"."id" AS TEXT)`).orderBy();
        return { sql: qb.getQuery(), params: qb.getParameters() };
    }

    async visibleIds(ctx: RequestContext, orderIds: ID[]): Promise<Set<string>> {
        if (orderIds.length === 0) return new Set();
        const qb = await this.buildVisibleOrdersQuery(ctx);
        const rows = await getManyBounded(
            qb.andWhere(`${qb.alias}.id IN (:...scopeOrderIds)`, { scopeOrderIds: orderIds }),
            new Set(orderIds.map(String)).size,
        );
        return new Set(rows.map(order => String(order.id)));
    }

    async findVisible(
        ctx: RequestContext,
        options?: OrderListOptions,
        // Manager is a joined Counterparty column, so it can't use generic OrderListOptions.filter.
        managerId?: string,
        // OrderFilterParameter exposes no customerId filter (only a customerLastName contains match).
        customerId?: string,
        // Must be server-side: company name, INN and phone live on joined Counterparty/Customer rows.
        // OrderFilterParameter._or can only reach Order's own columns.
        search?: string,
        relations?: string[],
    ): Promise<PaginatedList<Order>> {
        const qb = await this.buildVisibleOrdersQuery(
            ctx,
            options,
            managerId,
            customerId,
            search,
            relations,
        );
        return getPageAndCount(qb, options?.take, options?.skip);
    }
}
