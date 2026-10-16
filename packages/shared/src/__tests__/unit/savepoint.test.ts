import { describe, expect, it, vi } from 'vitest';
import type { RequestContext } from '@vendure/core';

import { withSavepoint } from '../../savepoint';

const ctx = {} as RequestContext;

function setup() {
    const statements: string[] = [];
    const connection = {
        getRepository: () => ({ query: vi.fn(async (sql: string) => void statements.push(sql)) }),
    };
    return { connection, statements };
}

describe('withSavepoint', () => {
    it('releases the savepoint when the work succeeds', async () => {
        const { connection, statements } = setup();
        expect(await withSavepoint(connection as never, ctx, async () => 7)).toBe(7);
        expect(statements.map(s => s.split(' ')[0])).toEqual(['SAVEPOINT', 'RELEASE']);
    });

    it('rolls back to the savepoint and rethrows when the work fails', async () => {
        const { connection, statements } = setup();
        await expect(
            withSavepoint(connection as never, ctx, async () => {
                throw new Error('sql');
            }),
        ).rejects.toThrow('sql');
        expect(statements.map(s => s.split(' ')[0])).toEqual(['SAVEPOINT', 'ROLLBACK']);
    });
});
