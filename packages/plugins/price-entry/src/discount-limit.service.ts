import { Injectable } from '@nestjs/common';
import { RequestContext, TransactionalConnection, UserInputError } from '@vendure/core';
import { In } from 'typeorm';
import { withAggregateLock } from 'shared';

import { DiscountLimit } from './discount-limit.entity';
import { resolveCeiling } from './discount-limit-resolve';
import { loadProductAttributes } from './discount-setup-filter-lookup';

@Injectable()
export class DiscountLimitService {
    constructor(private connection: TransactionalConnection) {}

    list(ctx: RequestContext): Promise<DiscountLimit[]> {
        return this.connection
            .getRepository(ctx, DiscountLimit)
            .find({ order: { roleCode: 'ASC', groupRef: 'ASC' } });
    }

    async setLimit(
        ctx: RequestContext,
        roleCode: string,
        groupRef: string,
        maxDiscountPercent: number,
    ): Promise<DiscountLimit> {
        if (!(maxDiscountPercent >= 0 && maxDiscountPercent <= 100)) {
            throw new UserInputError('The discount limit must be between 0 and 100 percent');
        }
        return withAggregateLock(
            this.connection,
            ctx,
            `discount-limit:${roleCode}:${groupRef}`,
            async txCtx => {
                const repo = this.connection.getRepository(txCtx, DiscountLimit);
                const row =
                    (await repo.findOne({ where: { roleCode, groupRef } })) ??
                    repo.create({ roleCode, groupRef });
                row.maxDiscountPercent = maxDiscountPercent;
                return repo.save(row);
            },
        );
    }

    async removeLimit(ctx: RequestContext, roleCode: string, groupRef: string): Promise<boolean> {
        const result = await this.connection
            .getRepository(ctx, DiscountLimit)
            .delete({ roleCode, groupRef });
        return (result.affected ?? 0) > 0;
    }

    // Ceiling per product ERP id for these roles; null (no limit) when no row of theirs covers the product.
    async ceilingsForProducts(
        ctx: RequestContext,
        roleCodes: string[],
        productErpIds: string[],
    ): Promise<Map<string, number | null>> {
        const ceilings = new Map<string, number | null>(productErpIds.map(id => [id, null]));
        if (roleCodes.length === 0 || productErpIds.length === 0) return ceilings;
        const rows = await this.connection
            .getRepository(ctx, DiscountLimit)
            .find({ where: { roleCode: In(roleCodes) } });
        if (rows.length === 0) return ceilings;
        const attributes = await loadProductAttributes(this.connection, ctx, [
            ...new Set(productErpIds),
        ]);
        for (const id of ceilings.keys()) {
            const attrs = attributes.get(id);
            const refs = new Set<string>(attrs?.categoryRefs ?? []);
            if (attrs?.manufacturerRef) refs.add(attrs.manufacturerRef);
            ceilings.set(id, resolveCeiling(rows, roleCodes, refs));
        }
        return ceilings;
    }
}
