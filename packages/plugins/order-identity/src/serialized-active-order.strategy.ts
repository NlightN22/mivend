import {
    ActiveOrderStrategy,
    DefaultActiveOrderStrategy,
    Injector,
    Order,
    RequestContext,
    TransactionalConnection,
} from '@vendure/core';
import { ctxQuery, withAggregateLock } from 'shared';

type InnerStrategy = Pick<ActiveOrderStrategy, 'init' | 'determineActiveOrder'> & {
    createActiveOrder(ctx: RequestContext): Promise<Order>;
};

// Every Shop API cart mutation resolves the active order inside its transaction, so locking here
// serializes active-order creation per user+channel and all mutations of one order (#258).
export class SerializedActiveOrderStrategy implements ActiveOrderStrategy {
    readonly name = 'default-active-order-strategy';
    private connection!: Pick<TransactionalConnection, 'withTransaction' | 'getRepository'>;

    constructor(private readonly inner: InnerStrategy = new DefaultActiveOrderStrategy()) {}

    async init(injector: Injector): Promise<void> {
        this.connection = injector.get(TransactionalConnection);
        await this.inner.init?.(injector);
    }

    async determineActiveOrder(ctx: RequestContext): Promise<Order | undefined> {
        if (!this.inTransaction(ctx)) return this.inner.determineActiveOrder(ctx, undefined);
        if (ctx.activeUserId) {
            await withAggregateLock(
                this.connection,
                ctx,
                `active-order:${String(ctx.channelId)}:${String(ctx.activeUserId)}`,
                async () => undefined,
            );
        }
        const order = await this.inner.determineActiveOrder(ctx, undefined);
        if (order) {
            await ctxQuery(
                this.connection,
                ctx,
                'SELECT id FROM "order" WHERE id = $1 FOR UPDATE',
                [order.id],
            );
        }
        return order;
    }

    createActiveOrder(ctx: RequestContext): Promise<Order> {
        return this.inner.createActiveOrder(ctx);
    }

    // Read paths run without a transaction; a lock there would only make reads wait for writers.
    private inTransaction(ctx: RequestContext): boolean {
        const repo = this.connection.getRepository(ctx, Order) as {
            manager?: { queryRunner?: { isTransactionActive?: boolean } };
        };
        return repo.manager?.queryRunner?.isTransactionActive === true;
    }
}
