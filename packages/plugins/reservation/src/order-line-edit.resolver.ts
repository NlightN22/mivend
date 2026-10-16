import { Args, Mutation, Query, Resolver } from '@nestjs/graphql';
import { ID } from '@vendure/common/lib/shared-types';
import { Allow, Ctx, Permission, RequestContext, Transaction } from '@vendure/core';
import { CustomPermission } from '@mivend/plugin-access-control';

import { OrderLineEditService } from './order-line-edit.service';

@Resolver()
export class OrderLineEditResolver {
    constructor(private edits: OrderLineEditService) {}

    @Query()
    @Allow(Permission.ReadOrder)
    async orderLineAvailability(@Ctx() ctx: RequestContext, @Args() args: { orderId: ID }) {
        const rows = await this.edits.availability(ctx, args.orderId);
        return rows.map(({ lineId, ...rest }) => ({ orderLineId: lineId, ...rest }));
    }

    @Transaction()
    @Mutation()
    @Allow(CustomPermission.ConfirmOrder.Permission)
    async changeOrderLineQuantity(
        @Ctx() ctx: RequestContext,
        @Args() args: { orderId: ID; orderLineId: ID; quantity: number },
    ): Promise<boolean> {
        await this.edits.setQuantity(ctx, args.orderId, args.orderLineId, args.quantity);
        return true;
    }

    @Transaction()
    @Mutation()
    @Allow(CustomPermission.ConfirmOrder.Permission)
    async removeOrderLine(
        @Ctx() ctx: RequestContext,
        @Args() args: { orderId: ID; orderLineId: ID },
    ): Promise<boolean> {
        await this.edits.removeLine(ctx, args.orderId, args.orderLineId);
        return true;
    }

    @Transaction()
    @Mutation()
    @Allow(CustomPermission.ConfirmOrder.Permission)
    async splitOrderLinesByStock(@Ctx() ctx: RequestContext, @Args() args: { orderId: ID }) {
        const outcomes = await this.edits.splitByStock(ctx, args.orderId);
        return outcomes.map(({ lineId, ...rest }) => ({ orderLineId: lineId, ...rest }));
    }
}
