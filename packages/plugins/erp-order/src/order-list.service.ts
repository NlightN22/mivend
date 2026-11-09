import { Injectable } from '@nestjs/common';
import { clampSkip, clampTake } from 'shared';
import { Order, PaginatedList, RequestContext, TransactionalConnection } from '@vendure/core';
import { In } from 'typeorm';
import { Counterparty } from '@mivend/plugin-counterparty';

import { applyOrderListFilter, applyOrderListSort, type OrderListInput } from './order-list-query';
import { orderCounterpartyJoinSql } from './order-counterparty-join';
import { OrderVisibilityService } from './order-visibility.service';

@Injectable()
export class OrderListService {
    constructor(
        private connection: TransactionalConnection,
        private orderVisibilityService: OrderVisibilityService,
    ) {}

    // Same visibility as findVisible, filtered and sorted by the shared list engine.
    async findVisible(
        ctx: RequestContext,
        list: OrderListInput = {},
        managerId?: string,
        customerId?: string,
        search?: string,
    ): Promise<PaginatedList<Order>> {
        const take = clampTake(list.take);
        const repo = this.connection.getRepository(ctx, Order);
        const qb = repo
            .createQueryBuilder('order')
            .leftJoinAndSelect('order.customer', 'customer')
            .leftJoin(Counterparty, 'counterparty', orderCounterpartyJoinSql('order'));
        await this.orderVisibilityService.applyVisibility(qb, ctx, managerId, customerId, search);
        applyOrderListFilter(qb, list.filter);

        const totalItems = await qb.getCount();
        if (take === 0) return { items: [], totalItems };
        applyOrderListSort(qb, list.sort);
        // Joins are to-one, so offset/limit is exact; the to-many relations load in a second query.
        const page = await qb.offset(clampSkip(list.skip)).limit(take).getMany();
        if (page.length === 0) return { items: [], totalItems };
        const withRelations = await repo.find({
            where: { id: In(page.map(o => o.id)) },
            relations: ['lines', 'fulfillments'],
        });
        const byId = new Map(withRelations.map(o => [o.id, o]));
        for (const order of page) {
            order.lines = byId.get(order.id)?.lines ?? [];
            order.fulfillments = byId.get(order.id)?.fulfillments ?? [];
        }
        return { items: page, totalItems };
    }
}
