import { Injectable } from '@nestjs/common';
import { RequestContext, TransactionalConnection } from '@vendure/core';
import { shouldApplyDocument, withAggregateLock } from 'shared';

import { OrderStatusReference } from './entities/order-status-reference.entity';

export interface OrderStatusReferenceInput {
    code: string;
    version: string;
    isDeleted: boolean;
    name: string;
    rank: number;
    terminal: boolean;
    customerVisible: boolean;
    description: string;
}

export type OrderStatusReferenceResult = 'applied' | 'stale' | 'unknown-deleted';

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

    async ranks(ctx: RequestContext): Promise<ReadonlyMap<string, number>> {
        const rows = await this.connection
            .getRepository(ctx, OrderStatusReference)
            .find({ where: { isDeleted: false } });
        return new Map(rows.map(row => [row.code, row.rank]));
    }

    listActive(ctx: RequestContext, codes: string[]): Promise<OrderStatusReference[]> {
        if (codes.length === 0) return Promise.resolve([]);
        return this.connection
            .getRepository(ctx, OrderStatusReference)
            .createQueryBuilder('ref')
            .where('ref.code IN (:...codes)', { codes })
            .andWhere('ref.isDeleted = false')
            .getMany();
    }

    private async write(
        ctx: RequestContext,
        input: OrderStatusReferenceInput,
    ): Promise<OrderStatusReferenceResult> {
        const repo = this.connection.getRepository(ctx, OrderStatusReference);
        const existing = await repo.findOne({ where: { code: input.code } });
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
            isDeleted: input.isDeleted,
            sourceVersion: input.version,
        };
        if (existing) await repo.update(existing.id, fields);
        else await repo.save(repo.create({ code: input.code, ...fields }));
        return 'applied';
    }
}
