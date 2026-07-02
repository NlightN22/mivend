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

@Resolver()
export class ErpOrderResolver {
    constructor(private readonly connection: TransactionalConnection) {}

    @Query()
    @Allow(Permission.Owner)
    async myOrders(
        @Ctx() ctx: RequestContext,
        @Args() args: { options?: { take?: number; skip?: number } },
    ): Promise<PaginatedList<Order>> {
        if (!ctx.activeUserId) {
            return { items: [], totalItems: 0 };
        }

        const take = args.options?.take ?? 50;
        const skip = args.options?.skip ?? 0;

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

        const [items, totalItems] = await qb.getManyAndCount();
        return { items, totalItems };
    }
}
