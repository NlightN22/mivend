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

// Order conflict rule (decided 2026-07-15, see docs/ai/PROJECT_CONTEXT.md): the instance that
// originated an order is the sole source of truth for it — a replica (any order with
// `customFields.sourceOrderId` set, see OrderSyncService.applyCreate) is read-only for anything
// a real human could trigger. This isn't "last write wins" (rejected: RabbitMQ delivery delay —
// seconds to tens of seconds with backoff, see OrderConsumer's producer-side race comment —
// means "arrived last" and "happened last" routinely disagree; also Order.state is an FSM, not
// an independently-mergeable field, so a naive timestamp comparison can silently produce a
// state that's businesses-nonsensical, e.g. Shipped + Cancelled both "won" different fields).
// Instead the conflict is made structurally impossible: only the sync path itself
// (OrderSyncService, which always uses a fresh system RequestContext with no activeUserId — see
// its `requestContextService.create({ apiType: 'admin' })` calls) may ever write to a replica;
// any request from a real logged-in actor (`ctx.activeUserId` set — an admin operator or the
// customer themselves) is rejected with a clear error instead of silently diverging.
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
