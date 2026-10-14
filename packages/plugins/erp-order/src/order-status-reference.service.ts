import { Injectable } from '@nestjs/common';
import { RequestContext, TransactionalConnection } from '@vendure/core';
import { shouldApplyDocument, withAggregateLock } from 'shared';

import { OrderStatusReference } from './entities/order-status-reference.entity';
import { OrderStatusDictionary, type OrderStatusEntry } from './order-status-dictionary';

export interface OrderStatusReferenceInput {
    code: string;
    version: string;
    isDeleted: boolean;
    name: string;
    rank: number;
    terminal: boolean;
    customerVisible: boolean;
    description: string;
    customerGroup: string;
    warehouseStarted: boolean;
    shipped: boolean;
    delivered: boolean;
    cancelled: boolean;
}

export type OrderStatusReferenceResult = 'applied' | 'stale' | 'unknown-deleted' | 'protected';

@Injectable()
export class OrderStatusReferenceService {
    constructor(private readonly connection: TransactionalConnection) {}

    apply(
        ctx: RequestContext,
        input: OrderStatusReferenceInput,
    ): Promise<OrderStatusReferenceResult> {
        return withAggregateLock(
            this.connection,
            ctx,
            `order-status-reference:${input.code}`,
            txCtx => this.write(txCtx, input),
        );
    }

    findActive(ctx: RequestContext, code: string): Promise<OrderStatusReference | null> {
        return this.connection
            .getRepository(ctx, OrderStatusReference)
            .findOne({ where: { code, isDeleted: false } });
    }

    async dictionary(ctx: RequestContext): Promise<OrderStatusDictionary> {
        const rows = await this.connection
            .getRepository(ctx, OrderStatusReference)
            .find({ where: { isDeleted: false }, order: { rank: 'ASC', id: 'ASC' } });
        return new OrderStatusDictionary(rows.map(toEntry));
    }

    private async write(
        ctx: RequestContext,
        input: OrderStatusReferenceInput,
    ): Promise<OrderStatusReferenceResult> {
        const repo = this.connection.getRepository(ctx, OrderStatusReference);
        const existing = await repo.findOne({ where: { code: input.code } });
        if (existing?.source === 'mivend') return 'protected';
        if (!existing && input.isDeleted) return 'unknown-deleted';
        const stored = existing
            ? { version: existing.sourceVersion, isDeleted: existing.isDeleted }
            : null;
        if (!shouldApplyDocument(input, stored)) return 'stale';
        const fields = {
            name: input.name,
            rank: input.rank,
            terminal: input.terminal,
            customerVisible: input.customerVisible,
            description: input.description,
            customerGroup: input.customerGroup,
            warehouseStarted: input.warehouseStarted,
            shipped: input.shipped,
            delivered: input.delivered,
            cancelled: input.cancelled,
            source: 'erp' as const,
            isDeleted: input.isDeleted,
            sourceVersion: input.version,
        };
        if (existing) await repo.update(existing.id, fields);
        else await repo.save(repo.create({ code: input.code, ...fields }));
        return 'applied';
    }
}

export function toEntry(row: OrderStatusReference): OrderStatusEntry {
    return {
        code: row.code,
        name: row.name,
        description: row.description,
        rank: row.rank,
        customerGroup: row.customerGroup,
        source: row.source,
        terminal: row.terminal,
        customerVisible: row.customerVisible,
        warehouseStarted: row.warehouseStarted,
        shipped: row.shipped,
        delivered: row.delivered,
        cancelled: row.cancelled,
        initial: row.initial,
        submitted: row.submitted,
        rejected: row.rejected,
        reservationConfirmed: row.reservationConfirmed,
        externalDefault: row.externalDefault,
    };
}
