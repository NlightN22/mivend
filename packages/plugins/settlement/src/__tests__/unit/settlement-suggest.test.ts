import { describe, expect, it, vi } from 'vitest';
import type { RequestContext } from '@vendure/core';

import { SettlementSuggestService } from '../../settlement-suggest.service';

const ctx = {} as RequestContext;

function setup(visible: { sql: string; params: Record<string, unknown> } | null, rows: unknown[]) {
    const where: [string, unknown?][] = [];
    const qb = {
        innerJoin: () => qb,
        leftJoin: () => qb,
        select: () => qb,
        andWhere: (sql: string, params?: unknown) => (where.push([sql, params]), qb),
        setParameters: () => qb,
        orderBy: () => qb,
        limit: vi.fn(() => qb),
        getRawMany: vi.fn(async () => rows),
    };
    const connection = {
        getRepository: vi.fn(() => ({ createQueryBuilder: () => qb })),
    };
    const counterparties = { visibleErpIdsSql: vi.fn(async () => visible) };
    const service = new SettlementSuggestService(connection as never, counterparties as never);
    return { service, qb, where, connection, counterparties };
}

describe('settlement filter suggestions', () => {
    it('does not touch the database for a prefix shorter than two characters', async () => {
        const { service, connection } = setup(null, []);
        await expect(service.suggest(ctx, 'customer', 'a')).resolves.toEqual([]);
        expect(connection.getRepository).not.toHaveBeenCalled();
    });

    it('refuses a field that has no suggestions', async () => {
        const { service } = setup(null, []);
        await expect(service.suggest(ctx, 'counterpartyId', 'ab')).rejects.toThrow('No suggestions');
        await expect(service.suggest(ctx, 'organization', 'ab')).rejects.toThrow('No suggestions');
    });

    it.each(['customer', 'number'])(
        'narrows %s by the caller visible counterparties, not by anything the client sends',
        async field => {
            const { service, where } = setup({ sql: 'SELECT 1', params: { scopeBranch: 'b-1' } }, []);
            await service.suggest(ctx, field, 'ab');
            const scope = where.find(([sql]) => sql.includes('IN (SELECT 1)'));
            expect(scope?.[1]).toEqual({ scopeBranch: 'b-1' });
        },
    );

    it('adds no scope clause for a caller who sees every counterparty', async () => {
        const { service, where } = setup(null, []);
        await service.suggest(ctx, 'customer', 'ab');
        expect(where.some(([sql]) => sql.includes('erpId" IN ('))).toBe(false);
    });

    it('returns distinct values up to the clamped limit', async () => {
        const rows = [{ value: 'A-1' }, { value: 'A-1' }, { value: 'A-2' }, { value: 'A-3' }];
        const { service } = setup(null, rows);
        await expect(service.suggest(ctx, 'number', 'a-', 2)).resolves.toEqual(['A-1', 'A-2']);
    });
});
