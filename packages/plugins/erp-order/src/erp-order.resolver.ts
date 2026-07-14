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
import { Brackets, WhereExpressionBuilder } from 'typeorm';

interface MyOrdersOptions {
    take?: number;
    skip?: number;
    search?: string;
    erpStatuses?: string[];
}

@Resolver()
export class ErpOrderResolver {
    constructor(private readonly connection: TransactionalConnection) {}

    @Query()
    @Allow(Permission.Owner)
    async myOrders(
        @Ctx() ctx: RequestContext,
        @Args() args: { options?: MyOrdersOptions },
    ): Promise<PaginatedList<Order>> {
        if (!ctx.activeUserId) {
            return { items: [], totalItems: 0 };
        }

        const take = args.options?.take ?? 50;
        const skip = args.options?.skip ?? 0;
        const search = args.options?.search?.trim();
        const erpStatuses = args.options?.erpStatuses;

        const qb = this.connection
            .getRepository(ctx, Order)
            .createQueryBuilder('order')
            .innerJoin('order.customer', 'customer')
            .innerJoin('customer.user', 'user')
            .leftJoinAndSelect('order.lines', 'lines')
            .leftJoinAndSelect('lines.productVariant', 'variant')
            .leftJoinAndSelect('variant.product', 'product')
            .where('user.id = :userId', { userId: ctx.activeUserId })
            .andWhere("order.state NOT IN ('AddingItems', 'Cancelled')")
            .orderBy('order.createdAt', 'DESC')
            .take(take)
            .skip(skip);

        if (erpStatuses && erpStatuses.length > 0) {
            const statusList = erpStatuses.includes('PENDING')
                ? [...erpStatuses, 'null']
                : erpStatuses;
            qb.andWhere(
                new Brackets((bqb: WhereExpressionBuilder) => {
                    bqb.where('order."customFieldsErpstatus" IN (:...statusList)', {
                        statusList,
                    });
                    if (statusList.includes('null')) {
                        bqb.orWhere('order."customFieldsErpstatus" IS NULL');
                    }
                }),
            );
        }

        if (search) {
            const term = `%${search}%`;
            qb.andWhere(
                new Brackets((bqb: WhereExpressionBuilder) => {
                    bqb.where('order.code ILIKE :term', { term }).orWhere(
                        'product.name ILIKE :term',
                        { term },
                    );
                }),
            );
        }

        const [items, totalItems] = await qb.getManyAndCount();
        return { items, totalItems };
    }
}
