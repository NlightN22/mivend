import {
    ActiveOrderStrategy,
    Injector,
    Order,
    RequestContext,
    TransactionalConnection,
} from '@vendure/core';
import { ctxQuery, withAggregateLock, withOrderCancelLocks } from 'shared';

type LockConnection = Pick<TransactionalConnection, 'withTransaction' | 'getRepository'>;

// Every Shop API cart mutation resolves the active order inside its transaction, so locking here
// serializes active-order creation per user+channel and all mutations of one order (#258).
export class SerializedActiveOrderStrategy implements ActiveOrderStrategy<Record<string, unknown>> {
    readonly name: string;
    readonly createActiveOrder?: ActiveOrderStrategy<Record<string, unknown>>['createActiveOrder'];
    readonly defineInputType?: ActiveOrderStrategy['defineInputType'];
    private connection!: LockConnection;

    constructor(private readonly inner: ActiveOrderStrategy<Record<string, unknown>>) {
        this.name = inner.name;
        this.defineInputType = inner.defineInputType?.bind(inner);
        const create = inner.createActiveOrder?.bind(inner);
        if (create) this.createActiveOrder = create;
    }

    async init(injector: Injector): Promise<void> {
        this.connection = injector.get(TransactionalConnection);
        await this.inner.init?.(injector);
    }

    async destroy(): Promise<void> {
        await this.inner.destroy?.();
    }

    async determineActiveOrder(
        ctx: RequestContext,
        input: Record<string, unknown>,
    ): Promise<Order | undefined> {
        if (!this.inTransaction(ctx)) return this.inner.determineActiveOrder(ctx, input);
        if (ctx.activeUserId) {
            await withAggregateLock(
                this.connection,
                ctx,
                `active-order:${String(ctx.channelId)}:${String(ctx.activeUserId)}`,
                async () => undefined,
            );
        }
        const order = await this.inner.determineActiveOrder(ctx, input);
        if (!order) return order;
        // Same order as a cancel or capture (proforma, reserve, row), so transition hooks never invert it.
        await withOrderCancelLocks(this.connection, ctx, order.id, async txCtx => {
            await ctxQuery(
                this.connection,
                txCtx,
                'SELECT id FROM "order" WHERE id = $1 FOR UPDATE',
                [order.id],
            );
        });
        return order;
    }

    // Public TypeORM API: a ctx without a transaction yields the pool manager with no query runner.
    private inTransaction(ctx: RequestContext): boolean {
        return (
            this.connection.getRepository(ctx, Order).manager.queryRunner?.isTransactionActive ===
            true
        );
    }
}

export function serializeActiveOrderStrategies<
    S extends ActiveOrderStrategy<Record<string, unknown>>,
>(configured: S | S[]): SerializedActiveOrderStrategy | SerializedActiveOrderStrategy[] {
    return Array.isArray(configured)
        ? configured.map(s => new SerializedActiveOrderStrategy(s))
        : new SerializedActiveOrderStrategy(configured);
}
