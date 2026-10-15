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
import { documentNumberSearchTerm } from 'shared';
import { TradingPointService } from '@mivend/plugin-counterparty';

import { EXTERNAL_ORDER_OWNER_CLAUSE } from './external-order-visibility';

@Resolver()
export class ErpOrderResolver {
    constructor(
        private readonly connection: TransactionalConnection,
        private readonly tradingPointService: TradingPointService,
    ) {}

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
        // customFields are exposed flat, per the backend-plugin-rules skill) — no custom filter/options type needed.
        const erpStatuses = (args.options?.filter as { erpStatus?: { in?: string[] } } | undefined)
            ?.erpStatus?.in;

        const isExternal = (args.options?.filter as { isExternal?: { eq?: boolean } } | undefined)
            ?.isExternal?.eq;
        const counterpartyId = await this.tradingPointService.getCounterpartyIdForUser(ctx);

        const qb = this.connection
            .getRepository(ctx, Order)
            .createQueryBuilder('order')
            .leftJoin('order.customer', 'customer')
            .leftJoin('customer.user', 'user')
            .leftJoinAndSelect('order.lines', 'lines')
            .leftJoinAndSelect('lines.productVariant', 'variant')
            .leftJoinAndSelect('variant.product', 'product')
            .leftJoin('product.translations', 'productTranslation')
            .where(
                new Brackets((bqb: WhereExpressionBuilder) => {
                    bqb.where('user.id = :userId', { userId: ctx.activeUserId });
                    if (counterpartyId) {
                        bqb.orWhere(EXTERNAL_ORDER_OWNER_CLAUSE, {
                            counterpartyId: String(counterpartyId),
                        });
                    }
                }),
            )
            // 'Draft' is admin work-in-progress: customer attached, but the order was never placed.
            // Excluding it here keeps abandoned admin drafts out of the customer's storefront order list.
            .andWhere("order.state NOT IN ('AddingItems', 'Draft')")
            .orderBy('order.createdAt', 'DESC')
            .take(take)
            .skip(skip);

        if (isExternal !== undefined) {
            qb.andWhere('"order"."customFieldsIsexternal" = :isExternal', { isExternal });
        }

        if (erpStatuses && erpStatuses.length > 0) {
            qb.andWhere('"order"."customFieldsErpstatus" IN (:...erpStatuses)', { erpStatuses });
        }

        if (search) {
            const term = `%${search}%`;
            const codeTerm = documentNumberSearchTerm(search);
            // Product.name is translatable and lives only on the joined product_translation table, not product.
            // Raw SQL must join product_translation to read the name.
            qb.andWhere(
                new Brackets((bqb: WhereExpressionBuilder) => {
                    bqb.where('"order".code ILIKE :codeTerm', { codeTerm }).orWhere(
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
