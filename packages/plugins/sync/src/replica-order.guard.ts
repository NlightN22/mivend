import type {
    Order,
    OrderInterceptor,
    OrderLine,
    OrderProcess,
    OrderState,
    OrderTransitionData,
    RequestContext,
    WillAddItemToOrderInput,
    WillAdjustOrderLineInput,
} from '@vendure/core';

// Replicas (sourceOrderId set) are read-only for humans; only the sync path may write to them.
// Not last-write-wins: RabbitMQ delays reorder events; Order.state is an FSM, not mergeable fields.
const REPLICA_READONLY_MESSAGE =
    'This order originated on another instance and is managed there — changes must be made at the source.';

function blockIfReplicaEditByUser(ctx: RequestContext, order: Order): string | void {
    if (!order.customFields.sourceOrderId) return;
    if (!ctx.activeUserId) return; // sync-internal system context — allowed
    return REPLICA_READONLY_MESSAGE;
}

export class ReplicaOrderInterceptor implements OrderInterceptor {
    willAddItemToOrder(
        ctx: RequestContext,
        order: Order,
        _input: WillAddItemToOrderInput,
    ): string | void {
        return blockIfReplicaEditByUser(ctx, order);
    }

    willAdjustOrderLine(
        ctx: RequestContext,
        order: Order,
        _input: WillAdjustOrderLineInput,
    ): string | void {
        return blockIfReplicaEditByUser(ctx, order);
    }

    willRemoveItemFromOrder(
        ctx: RequestContext,
        order: Order,
        _orderLine: OrderLine,
    ): string | void {
        return blockIfReplicaEditByUser(ctx, order);
    }
}

export class ReplicaOrderProcess implements OrderProcess<OrderState> {
    onTransitionStart(
        _fromState: OrderState,
        _toState: OrderState,
        data: OrderTransitionData,
    ): string | void {
        return blockIfReplicaEditByUser(data.ctx, data.order);
    }
}
