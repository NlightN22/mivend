import {
    ActiveOrderStrategy,
    InternalServerError,
    Injector,
    Order,
    RequestContext,
    SessionService,
} from '@vendure/core';
import { ActingContextService } from '@mivend/plugin-session-management';

import { ActingCartService } from './acting-cart.service';

type Input = Record<string, unknown>;

// An acting session never reaches the inner strategy, and a real session never keeps an acting cart (linked to the same customer).
export class ActingActiveOrderStrategy implements ActiveOrderStrategy<Input> {
    readonly name: string;
    readonly defineInputType?: ActiveOrderStrategy['defineInputType'];
    private acting!: ActingContextService;
    private carts!: ActingCartService;
    private sessions!: SessionService;

    constructor(private readonly inner: ActiveOrderStrategy<Input>) {
        this.name = inner.name;
        this.defineInputType = inner.defineInputType?.bind(inner);
    }

    async init(injector: Injector): Promise<void> {
        this.acting = injector.get(ActingContextService);
        this.carts = injector.get(ActingCartService);
        this.sessions = injector.get(SessionService);
        await this.inner.init?.(injector);
    }

    async destroy(): Promise<void> {
        await this.inner.destroy?.();
    }

    async determineActiveOrder(ctx: RequestContext, input: Input): Promise<Order | undefined> {
        if (!(await this.acting.get(ctx)) || !ctx.session) {
            return this.withoutActingCart(ctx, await this.inner.determineActiveOrder(ctx, input));
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

    // Core's login merge and getActiveOrderForUser pick the customer's newest cart, which may be an acting one.
    private async withoutActingCart(
        ctx: RequestContext,
        order?: Order,
    ): Promise<Order | undefined> {
        if (!order?.customFields?.actingSessionId) return order;
        if (ctx.session) await this.sessions.unsetActiveOrder(ctx, ctx.session);
        return order.customerId ? this.carts.findCustomerCart(ctx, order.customerId) : undefined;
    }
}
