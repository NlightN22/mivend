import { Args, Query, Resolver } from '@nestjs/graphql';
import {
    Allow,
    Ctx,
    Order,
    PaginatedList,
    Permission,
    RequestContext,
    TransactionalConnection,
} from '@vendure/core';
import { OrderListOptions } from '@vendure/common/lib/generated-types';
import { Brackets, WhereExpressionBuilder } from 'typeorm';

@Resolver()
export class ErpOrderResolver {
    constructor(private readonly connection: TransactionalConnection) {}

    @Query()
    @Allow(Permission.Owner)
    async myOrders(
        @Ctx() ctx: RequestContext,
        @Args() args: { options?: OrderListOptions; search?: string },
    ): Promise<PaginatedList<Order>> {
        if (!ctx.activeUserId) {
            return { items: [], totalItems: 0 };
        }

        const take = args.options?.take ?? 50;
        const skip = args.options?.skip ?? 0;
        const search = args.search?.trim();
        // erpStatus already exists on the real, Vendure-generated OrderFilterParameter (Order
        // customFields are exposed flat, per AGENTS.md) — no custom filter/options type needed.
        const erpStatuses = (args.options?.filter as { erpStatus?: { in?: string[] } } | undefined)
            ?.erpStatus?.in;

        const qb = this.connection
            .getRepository(ctx, Order)
            .createQueryBuilder('order')
            .innerJoin('order.customer', 'customer')
            .innerJoin('customer.user', 'user')
            .leftJoinAndSelect('order.lines', 'lines')
            .leftJoinAndSelect('lines.productVariant', 'variant')
            .leftJoinAndSelect('variant.product', 'product')
            .leftJoin('product.translations', 'productTranslation')
            .where('user.id = :userId', { userId: ctx.activeUserId })
            .andWhere("order.state NOT IN ('AddingItems', 'Cancelled')")
            .orderBy('order.createdAt', 'DESC')
            .take(take)
            .skip(skip);

        if (erpStatuses && erpStatuses.length > 0) {
            // PENDING has no real ERP status yet (customFieldsErpstatus IS NULL) — a plain `IN`
            // filter never matches NULL in SQL, so this stays a manual Brackets clause rather
            // than the generic StringOperators `in` alone.
            const statusList = erpStatuses.includes('PENDING')
                ? [...erpStatuses, 'null']
                : erpStatuses;
            qb.andWhere(
                new Brackets((bqb: WhereExpressionBuilder) => {
                    bqb.where('"order"."customFieldsErpstatus" IN (:...statusList)', {
                        statusList,
                    });
                    if (statusList.includes('null')) {
                        bqb.orWhere('"order"."customFieldsErpstatus" IS NULL');
                    }
                }),
            );
        }

        if (search) {
            const term = `%${search}%`;
            // Product.name is translatable — not a real column on `product`, only on the
            // joined `product_translation` table (see AGENTS.md's raw-SQL-in-Brackets gotcha:
            // this was never actually exercised until now, hence never caught).
            qb.andWhere(
                new Brackets((bqb: WhereExpressionBuilder) => {
                    bqb.where('"order".code ILIKE :term', { term }).orWhere(
                        'productTranslation.name ILIKE :term',
                        { term },
                    );
                }),
            );
        }

        const [items, totalItems] = await qb.getManyAndCount();
        return { items, totalItems };
    }
}
