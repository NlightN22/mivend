import { Injectable, OnApplicationBootstrap } from '@nestjs/common';
import { Permission } from '@vendure/common/lib/generated-types';
import { Order, RequestContext, TransactionalConnection } from '@vendure/core';
import { likeTerm, normalizeDocumentNumber } from 'shared';
import { Counterparty } from '@mivend/plugin-counterparty';
import { StaffSearchRegistry, type GlobalSearchHit } from '@mivend/plugin-staff-search';

import { orderCounterpartyJoinSql } from './order-counterparty-join';
import { OrderVisibilityService } from './order-visibility.service';

export const ORDER_SEARCH_KIND = 'order';

// Same joins and visibility as the order list (OrderListService); matches the order code only.
@Injectable()
export class OrderSearchProvider implements OnApplicationBootstrap {
    constructor(
        private readonly registry: StaffSearchRegistry,
        private readonly connection: TransactionalConnection,
        private readonly visibility: OrderVisibilityService,
    ) {}

    onApplicationBootstrap(): void {
        this.registry.register({
            kind: ORDER_SEARCH_KIND,
            position: 20,
            permissions: [Permission.ReadOrder],
            search: (ctx, term, limit) => this.search(ctx, term, limit),
        });
    }

    async search(ctx: RequestContext, term: string, limit: number): Promise<GlobalSearchHit[]> {
        const qb = this.connection
            .getRepository(ctx, Order)
            .createQueryBuilder('order')
            .leftJoin('order.customer', 'customer')
            .leftJoin(Counterparty, 'counterparty', orderCounterpartyJoinSql('order'));
        await this.visibility.applyVisibility(qb, ctx);
        const rows = await qb
            .andWhere('"order"."code" ILIKE :gsTerm', {
                gsTerm: likeTerm(normalizeDocumentNumber(term)),
            })
            .select('"order"."id"', 'id')
            .addSelect('"order"."code"', 'code')
            .addSelect('"order"."state"', 'state')
            .addSelect('counterparty.id', 'counterpartyId')
            .addSelect('counterparty.shortName', 'counterpartyName')
            .orderBy('"order"."createdAt"', 'DESC')
            .addOrderBy('"order"."id"', 'DESC')
            .limit(limit)
            .getRawMany<Record<string, unknown>>();
        return rows.map(r => ({
            id: String(r.id),
            number: String(r.code),
            title: String(r.code),
            subtitle: (r.counterpartyName as string | null) ?? null,
            status: String(r.state),
            counterpartyId: r.counterpartyId == null ? null : String(r.counterpartyId),
        }));
    }
}
