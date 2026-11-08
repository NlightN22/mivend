import { Injectable } from '@nestjs/common';
import { ID } from '@vendure/common/lib/shared-types';
import {
    Administrator,
    AdministratorService,
    RequestContext,
    TransactionalConnection,
    UserInputError,
} from '@vendure/core';
import { activeAdministratorId } from '@mivend/plugin-approval-workflow';
import { IsNull } from 'typeorm';
import { withAggregateLock } from 'shared';

import { DiscountLimit } from './discount-limit.entity';
import { resolveCeiling } from './discount-limit-resolve';
import { ALL_PRODUCTS_SCOPE, LIMIT_SCOPE_KINDS, refsByScopeKind } from './discount-limit-scope';
import { loadProductAttributes } from './discount-setup-filter-lookup';

@Injectable()
export class DiscountLimitService {
    constructor(
        private connection: TransactionalConnection,
        private administratorService: AdministratorService,
    ) {}

    list(ctx: RequestContext, administratorId?: ID | null): Promise<DiscountLimit[]> {
        return this.connection.getRepository(ctx, DiscountLimit).find({
            where: administratorId ? { administratorId: String(administratorId) } : {},
            order: { administratorId: 'ASC', scopeKind: 'ASC', scopeRef: 'ASC' },
        });
    }

    actorAdministratorId(ctx: RequestContext): Promise<string | null> {
        return activeAdministratorId(this.administratorService, ctx);
    }

    async setLimit(
        ctx: RequestContext,
        administratorId: ID,
        scopeKind: string,
        scopeRef: string,
        maxDiscountPercent: number,
    ): Promise<DiscountLimit> {
        const adminId = String(administratorId);
        this.assertScope(scopeKind, scopeRef);
        if (!(maxDiscountPercent >= 0 && maxDiscountPercent <= 100)) {
            throw new UserInputError('The discount limit must be between 0 and 100 percent');
        }
        return withAggregateLock(this.connection, ctx, `discount-limit:${adminId}`, async txCtx => {
            const repo = this.connection.getRepository(txCtx, DiscountLimit);
            const row =
                (await repo.findOne({
                    where: { administratorId: adminId, scopeKind, scopeRef },
                })) ?? repo.create({ administratorId: adminId, scopeKind, scopeRef });
            row.maxDiscountPercent = maxDiscountPercent;
            return repo.save(row);
        });
    }

    async assertAdministratorExists(ctx: RequestContext, administratorId: ID): Promise<void> {
        const admin = await this.connection
            .getRepository(ctx, Administrator)
            .findOne({ where: { id: administratorId, deletedAt: IsNull() } });
        if (!admin) throw new UserInputError('Administrator not found');
    }

    removeLimit(
        ctx: RequestContext,
        administratorId: ID,
        scopeKind: string,
        scopeRef: string,
    ): Promise<boolean> {
        const adminId = String(administratorId);
        return withAggregateLock(this.connection, ctx, `discount-limit:${adminId}`, async txCtx => {
            const result = await this.connection
                .getRepository(txCtx, DiscountLimit)
                .delete({ administratorId: adminId, scopeKind, scopeRef });
            return (result.affected ?? 0) > 0;
        });
    }

    // Ceiling per product ERP id for one employee; null (no limit) when no row of theirs covers the product.
    async ceilingsForProducts(
        ctx: RequestContext,
        administratorId: string | null,
        productErpIds: string[],
    ): Promise<Map<string, number | null>> {
        const ceilings = new Map<string, number | null>(productErpIds.map(id => [id, null]));
        if (!administratorId || productErpIds.length === 0) return ceilings;
        const rows = await this.connection
            .getRepository(ctx, DiscountLimit)
            .find({ where: { administratorId } });
        if (rows.length === 0) return ceilings;
        const attributes = await loadProductAttributes(this.connection, ctx, [
            ...new Set(productErpIds),
        ]);
        for (const id of ceilings.keys()) {
            ceilings.set(id, resolveCeiling(rows, refsByScopeKind(attributes.get(id))));
        }
        return ceilings;
    }

    private assertScope(scopeKind: string, scopeRef: string): void {
        if (!LIMIT_SCOPE_KINDS.includes(scopeKind)) {
            throw new UserInputError(`Unknown discount limit scope "${scopeKind}"`);
        }
        if ((scopeKind === ALL_PRODUCTS_SCOPE) !== (scopeRef === '')) {
            throw new UserInputError('A product scope needs a reference; all products takes none');
        }
    }
}
