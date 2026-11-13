import { describe, expect, it, vi } from 'vitest';
import { QueryTooLargeError } from 'shared';
import type { RequestContext, Role, TransactionalConnection } from '@vendure/core';

import { HiddenCategoryFacetValuesService } from '../../hidden-category-facet-values.service';
import { HiddenCategoryProductsService } from '../../hidden-category-products.service';
import { RoleScopeConfigService } from '../../role-scope-config.service';
import { VisibilityGrantReader } from '../../visibility-grant-reader.service';

const ctx = {} as unknown as RequestContext;
const rowsOf = (count: number, row: object = {}): object[] =>
    Array.from({ length: count }, () => row);

function rawBuilder(count: number, row: object, chain: string[]): Record<string, unknown> {
    const qb: Record<string, unknown> = {};
    for (const method of chain) qb[method] = () => qb;
    qb.limit = vi.fn(() => qb);
    qb.getRawMany = vi.fn(async () => rowsOf(count, row));
    return qb;
}

describe('permission and scope reads fail closed over the ceiling', () => {
    const roleService = (count: number): RoleScopeConfigService =>
        new RoleScopeConfigService({
            getRepository: () => ({ find: vi.fn(async () => rowsOf(count, { roleCode: 'r' })) }),
        } as unknown as TransactionalConnection);

    it('roleCodesWithScope passes at the default ceiling and throws one over', async () => {
        await expect(roleService(1000).roleCodesWithScope(ctx, 'order', 'all')).resolves.toEqual(
            [],
        );
        await expect(
            roleService(1001).roleCodesWithScope(ctx, 'order', 'all'),
        ).rejects.toBeInstanceOf(QueryTooLargeError);
    });

    it('maxScopeFor uses the caller role count as its ceiling', async () => {
        const roles = [{ code: 'r' }] as unknown as Role[];
        await expect(roleService(1).maxScopeFor(ctx, roles, 'order')).resolves.toBe('own');
        await expect(roleService(2).maxScopeFor(ctx, roles, 'order')).rejects.toBeInstanceOf(
            QueryTooLargeError,
        );
    });

    it('active manager grants throw one over the ceiling instead of a partial set', async () => {
        const reader = (count: number): VisibilityGrantReader => {
            const qb = rawBuilder(count, { subjectRef: 'a' }, ['select', 'where', 'andWhere']);
            return new VisibilityGrantReader({
                getRepository: () => ({ createQueryBuilder: () => qb }),
            } as unknown as TransactionalConnection);
        };
        await expect(reader(1000).activeManagerIds(ctx, 'g')).resolves.toHaveLength(1000);
        await expect(reader(1001).activeManagerIds(ctx, 'g')).rejects.toBeInstanceOf(
            QueryTooLargeError,
        );
    });
});

describe('hidden category reads fail closed over the ceiling', () => {
    it('hidden category ERP ids pass at 5000 rows and throw one over', async () => {
        const build = (count: number): HiddenCategoryProductsService =>
            new HiddenCategoryProductsService({
                getRepository: () => ({
                    query: vi.fn(async () => rowsOf(count, { id: 1, parentId: null, slug: 'x' })),
                }),
            } as never);
        await expect(build(5000).hiddenCategoryErpIds(ctx)).resolves.toBeDefined();
        await expect(build(5001).hiddenCategoryErpIds(ctx)).rejects.toBeInstanceOf(
            QueryTooLargeError,
        );
    });

    it('hidden facet value lookup bounds its raw read by 10x the slugs', async () => {
        const build = (count: number): HiddenCategoryFacetValuesService => {
            const qb = rawBuilder(count, { slug: 's' }, [
                'innerJoin',
                'select',
                'where',
                'andWhere',
            ]);
            return new HiddenCategoryFacetValuesService({
                getRepository: (_ctx: unknown, entity: { name?: string }) =>
                    entity?.name === 'FacetValue'
                        ? { find: async () => [{ id: 1, code: 'c', facet: { code: 'category' } }] }
                        : { createQueryBuilder: () => qb },
            } as never);
        };
        await expect(build(10).findHiddenIds(ctx, [1])).resolves.toBeDefined();
        await expect(build(11).findHiddenIds(ctx, [1])).rejects.toBeInstanceOf(QueryTooLargeError);
    });
});
