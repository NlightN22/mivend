import { Injectable } from '@nestjs/common';
import { ID } from '@vendure/common/lib/shared-types';
import DataLoader from 'dataloader';
import { Order, OrderLine, RequestContext, TransactionalConnection } from '@vendure/core';
import { In } from 'typeorm';

import { LookupMemo } from './lookup-memo';
import { PriceResolutionService } from './price-resolution.service';

export interface OrderLineContext {
    productVariantId: string;
    quantity: number;
    order: Order;
}

interface RequestState {
    loader: DataLoader<string, OrderLineContext | null>;
    memo: LookupMemo;
}

// Loads the order of every requested cart line in two queries and seeds one memo for the whole
// cart, so per-line fields do not re-read their siblings. One ctx = one viewer; never shared.
@Injectable()
export class OrderLineContextService {
    private states = new WeakMap<RequestContext, RequestState>();

    constructor(
        private connection: TransactionalConnection,
        private priceResolutionService: PriceResolutionService,
    ) {}

    memoFor(ctx: RequestContext): LookupMemo {
        return this.state(ctx).memo;
    }

    get(ctx: RequestContext, lineId: ID): Promise<OrderLineContext | null> {
        return this.state(ctx).loader.load(String(lineId));
    }

    private state(ctx: RequestContext): RequestState {
        let state = this.states.get(ctx);
        if (!state) {
            const memo = new LookupMemo();
            state = { memo, loader: new DataLoader(ids => this.loadBatch(ctx, memo, ids)) };
            this.states.set(ctx, state);
        }
        return state;
    }

    private async loadBatch(
        ctx: RequestContext,
        memo: LookupMemo,
        ids: readonly string[],
    ): Promise<Array<OrderLineContext | Error | null>> {
        const lines = await this.connection
            .getRepository(ctx, OrderLine)
            .find({ where: { id: In([...ids]) }, relations: ['order'] });
        const orderIds = [...new Set(lines.map(l => l.order.id))];
        const siblings =
            orderIds.length > 0
                ? await this.connection
                      .getRepository(ctx, OrderLine)
                      .find({ where: { order: { id: In(orderIds) } }, relations: ['order'] })
                : [];
        const byOrder = new Map<string, OrderLine[]>();
        for (const line of siblings) {
            const key = String(line.order.id);
            byOrder.set(key, [...(byOrder.get(key) ?? []), line]);
        }
        const orders = new Map<string, Order>();
        for (const line of lines) {
            const key = String(line.order.id);
            if (!orders.has(key)) {
                orders.set(key, Object.assign(line.order, { lines: byOrder.get(key) ?? [] }));
            }
        }
        const failed = new Map<string, Error>();
        for (const [key, order] of orders) {
            try {
                await this.priceResolutionService.preload(ctx, order, memo);
            } catch (e) {
                failed.set(key, e instanceof Error ? e : new Error(String(e)));
            }
        }
        const byId = new Map(lines.map(l => [String(l.id), l]));
        return ids.map(id => {
            const line = byId.get(id);
            const error = line && failed.get(String(line.order.id));
            if (error) return error;
            return line
                ? {
                      productVariantId: String(line.productVariantId),
                      quantity: line.quantity,
                      order: orders.get(String(line.order.id))!,
                  }
                : null;
        });
    }
}
