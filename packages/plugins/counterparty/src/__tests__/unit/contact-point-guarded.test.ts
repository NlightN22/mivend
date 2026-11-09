import { describe, expect, it, vi } from 'vitest';
import type { RequestContext } from '@vendure/core';

import { ContactPointService } from '../../contact-point.service';

const ctx = {} as RequestContext;

function make(): { service: ContactPointService; queries: string[] } {
    const queries: string[] = [];
    const connection = {
        getRepository: () => ({
            query: vi.fn(async (sql: string) => {
                queries.push(sql);
            }),
        }),
    };
    return { service: new ContactPointService(connection as never), queries };
}

const named = (name: string, message = 'x'): Error => Object.assign(new Error(message), { name });
const coded = (code: string): Error => Object.assign(new Error('db'), { code });

describe('ContactPointService.guarded', () => {
    it('releases the savepoint on success and reports no failure', async () => {
        const { service, queries } = make();
        expect(await service.guarded(ctx, 'x', async () => undefined)).toBeNull();
        expect(queries).toEqual(['SAVEPOINT contact_step', 'RELEASE SAVEPOINT contact_step']);
    });

    it.each([
        ['a constraint violation', coded('23505')],
        ['a malformed value', coded('22P02')],
        ['a TypeError', new TypeError('bad')],
    ])('records %s, rolls back and releases the savepoint', async (_n, error) => {
        const { service, queries } = make();
        const failure = await service.guarded(ctx, 'x', async () => {
            throw error;
        });
        expect(failure).toMatch(/^contact step failed: /);
        expect(queries).toEqual([
            'SAVEPOINT contact_step',
            'ROLLBACK TO SAVEPOINT contact_step',
            'RELEASE SAVEPOINT contact_step',
        ]);
    });

    it.each([
        ['a missing dependency', named('MissingDependencyError')],
        ['a missing reference', named('MissingReferenceError')],
        ['a statement timeout', coded('57014')],
        ['a lost connection', coded('08006')],
        ['a deadlock', coded('40P01')],
        ['a driver timeout', new Error('Connection terminated due to connection timeout')],
    ])('rethrows %s so its own policy applies', async (_n, error) => {
        const { service } = make();
        await expect(
            service.guarded(ctx, 'x', async () => {
                throw error;
            }),
        ).rejects.toBe(error);
    });
});
