import { Inject, Injectable } from '@nestjs/common';
import { ID, Order, OrderService, RequestContext, TransactionalConnection } from '@vendure/core';
import { ctxQuery } from 'shared';

import { ACTING_SESSION_PLUGIN_OPTIONS, CART_TTL_DEFAULT_MS } from './acting-session.types';
import type { ActingSessionPluginOptions } from './acting-session.types';

// The acting cart is linked to the customer like a real one; the marker keeps it out of the customer's own sessions.
@Injectable()
export class ActingCartService {
    constructor(
        private connection: TransactionalConnection,
        private orderService: OrderService,
        @Inject(ACTING_SESSION_PLUGIN_OPTIONS) private options: ActingSessionPluginOptions,
    ) {}

    async find(ctx: RequestContext, sessionId: string): Promise<Order | undefined> {
        const rows = await ctxQuery<Array<{ id: string }>>(
            this.connection,
            ctx,
            `SELECT id FROM "order" WHERE "customFieldsActingsessionid" = $1 AND active = true
             ORDER BY id DESC LIMIT 1`,
            [sessionId],
        );
        return rows[0] ? this.orderService.findOne(ctx, rows[0].id) : undefined;
    }

    async findCustomerCart(ctx: RequestContext, customerId: ID): Promise<Order | undefined> {
        const rows = await ctxQuery<Array<{ id: string }>>(
            this.connection,
            ctx,
            `SELECT o.id FROM "order" o
             JOIN order_channels_channel oc ON oc."orderId" = o.id AND oc."channelId" = $2
             WHERE o."customerId" = $1 AND o.active = true AND o."customFieldsActingsessionid" IS NULL
             ORDER BY o."createdAt" DESC LIMIT 1`,
            [customerId, ctx.channelId],
        );
        return rows[0] ? this.orderService.findOne(ctx, rows[0].id) : undefined;
    }

    async create(ctx: RequestContext, sessionId: string, administratorId: string): Promise<Order> {
        const order = await this.orderService.create(ctx, ctx.activeUserId);
        await this.connection.getRepository(ctx, Order).update(order.id, {
            customFields: { actingSessionId: sessionId, actingAdministratorId: administratorId },
        });
        const created = await this.orderService.findOne(ctx, order.id);
        return created ?? order;
    }

    deleteForSession(ctx: RequestContext, sessionId: string): Promise<number> {
        return this.deleteWhere(ctx, '"customFieldsActingsessionid" = $1', [sessionId]);
    }

    deleteAbandoned(ctx: RequestContext): Promise<number> {
        const cutoff = new Date(Date.now() - (this.options.cartTtlMs ?? CART_TTL_DEFAULT_MS));
        return this.deleteWhere(
            ctx,
            '"customFieldsActingsessionid" IS NOT NULL AND "updatedAt" < $1',
            [cutoff],
        );
    }

    // Each cart is re-checked under its row lock: a checkout that placed it meanwhile makes it inactive and it is kept.
    private async deleteWhere(
        ctx: RequestContext,
        condition: string,
        params: unknown[],
    ): Promise<number> {
        const ids = await ctxQuery<Array<{ id: string }>>(
            this.connection,
            ctx,
            `SELECT id FROM "order" WHERE active = true AND ${condition}`,
            params,
        );
        let deleted = 0;
        for (const { id } of ids) {
            const done = await this.connection.withTransaction(ctx, async txCtx => {
                const locked = await ctxQuery<Array<{ id: string }>>(
                    this.connection,
                    txCtx,
                    `SELECT id FROM "order" WHERE id = $1 AND active = true AND ${condition.replace(
                        /\$1/g,
                        '$2',
                    )} FOR UPDATE`,
                    [id, ...params],
                );
                if (locked.length === 0) return false;
                await this.orderService.deleteOrder(txCtx, id);
                return true;
            });
            if (done) deleted++;
        }
        return deleted;
    }
}
