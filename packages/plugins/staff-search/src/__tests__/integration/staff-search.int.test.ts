import { DataSource } from 'typeorm';
import { Logger, type RequestContext } from '@vendure/core';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import {
    createTestSchema,
    dropTestSchema,
    likeTerm,
    testDataSourceConnectionOptions,
    testSchemaOptions,
} from 'shared';

import { StaffSearchRegistry } from '../../staff-search.registry';
import { StaffSearchService } from '../../staff-search.service';
import type { GlobalSearchProvider } from '../../types';

const { schema, extra } = testSchemaOptions('staff_search');
let dataSource: DataSource;
let service: StaffSearchService;

const ctx = {
    userHasPermissions: (p: string[]) => p.includes('Granted'),
} as unknown as RequestContext;

// A real-SQL provider on a scratch table: the wildcard escaping, Cyrillic and case rules of the shared helper.
const items: GlobalSearchProvider = {
    kind: 'item',
    position: 1,
    permissions: ['Granted'] as never,
    search: async (_ctx, term, limit) => {
        const rows: Array<{ id: number; name: string }> = await dataSource.query(
            `SELECT id, name FROM search_item WHERE name ILIKE $1 ORDER BY id LIMIT $2`,
            [likeTerm(term), limit],
        );
        return rows.map(r => ({
            id: String(r.id),
            number: r.name,
            title: r.name,
            subtitle: null,
            status: null,
            counterpartyId: null,
        }));
    },
};

const broken: GlobalSearchProvider = {
    kind: 'broken',
    position: 2,
    permissions: ['Granted'] as never,
    search: async () => {
        await dataSource.query('SELECT * FROM table_that_does_not_exist');
        return [];
    },
};

const closed: GlobalSearchProvider = {
    kind: 'closed',
    position: 3,
    permissions: ['NotGranted'] as never,
    search: items.search,
};

beforeAll(async () => {
    await createTestSchema(schema);
    dataSource = new DataSource({
        type: 'postgres',
        ...testDataSourceConnectionOptions(),
        schema,
        extra,
    });
    await dataSource.initialize();
    await dataSource.query(`CREATE TABLE search_item (id serial PRIMARY KEY, name varchar)`);
    await dataSource.query(
        `INSERT INTO search_item (name) VALUES ('Ромашка'), ('РОМАНОВ'), ('50%_off'), ('50xxoff'), ('Alpha-1'), ('alpha-2')`,
    );
    const registry = new StaffSearchRegistry();
    [items, broken, closed].forEach(p => registry.register(p));
    service = new StaffSearchService(registry);
});

afterAll(async () => {
    await dataSource.destroy();
    await dropTestSchema(schema);
});

const numbers = async (term: string, limit?: number): Promise<string[]> => {
    const groups = await service.search(ctx, term, limit);
    return groups.find(g => g.kind === 'item')?.items.map(i => i.number) ?? [];
};

describe('staff search over real Postgres', () => {
    it('matches Cyrillic regardless of case', async () => {
        expect(await numbers('рома')).toEqual(['Ромашка', 'РОМАНОВ']);
        expect(await numbers('РОМАШ')).toEqual(['Ромашка']);
    });

    it('matches Latin text regardless of case', async () => {
        expect(await numbers('ALPHA')).toEqual(['Alpha-1', 'alpha-2']);
    });

    it('treats % and _ as plain characters', async () => {
        expect(await numbers('0%_o')).toEqual(['50%_off']);
        expect(await numbers('50__')).toEqual([]);
    });

    it('answers empty for one character and clamps the limit', async () => {
        expect(await numbers(' р ')).toEqual([]);
        expect(await numbers('alpha', 1)).toEqual(['Alpha-1']);
    });

    it('omits a kind without permission and survives a kind that fails in the database', async () => {
        const error = vi.spyOn(Logger, 'error').mockImplementation(() => undefined);
        const groups = await service.search(ctx, 'alpha');
        expect(groups.map(g => g.kind)).toEqual(['item']);
        expect(error).toHaveBeenCalledTimes(1);
        expect(String(error.mock.calls[0][0])).toContain('broken');
        error.mockRestore();
    });
});
