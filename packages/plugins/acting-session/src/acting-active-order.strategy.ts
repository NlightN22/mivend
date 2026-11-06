import {
    ActiveOrderStrategy,
    InternalServerError,
    Injector,
    Order,
    RequestContext,
} from '@vendure/core';
import { ActingContextService } from '@mivend/plugin-session-management';

import { ActingCartService } from './acting-cart.service';

type Input = Record<string, unknown>;

// An acting session never falls through to the inner strategy, which would return the customer's real cart.
export class ActingActiveOrderStrategy implements ActiveOrderStrategy<Input> {
    readonly name: string;
    readonly defineInputType?: ActiveOrderStrategy['defineInputType'];
    private acting!: ActingContextService;
    private carts!: ActingCartService;

    constructor(private readonly inner: ActiveOrderStrategy<Input>) {
        this.name = inner.name;
        this.defineInputType = inner.defineInputType?.bind(inner);
    }

    async init(injector: Injector): Promise<void> {
        this.acting = injector.get(ActingContextService);
        this.carts = injector.get(ActingCartService);
        await this.inner.init?.(injector);
    }

    async destroy(): Promise<void> {
        await this.inner.destroy?.();
    }

    async determineActiveOrder(ctx: RequestContext, input: Input): Promise<Order | undefined> {
        if (!(await this.acting.get(ctx)) || !ctx.session) {
            return this.inner.determineActiveOrder(ctx, input);
        }
        return this.carts.find(ctx, String(ctx.session.id));
    }

    async createActiveOrder(ctx: RequestContext, input: Input): Promise<Order> {
        const acting = await this.acting.get(ctx);
        if (!acting || !ctx.session) {
            if (!this.inner.createActiveOrder) {
                throw new InternalServerError('error.order-could-not-be-determined-or-created');
            }
            return this.inner.createActiveOrder(ctx, input);
        }
        return this.carts.create(ctx, String(ctx.session.id), acting.administratorId);
    }
}
