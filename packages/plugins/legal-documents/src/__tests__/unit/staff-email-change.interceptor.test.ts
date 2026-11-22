import { lastValueFrom, of } from 'rxjs';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@nestjs/graphql', () => ({ GqlExecutionContext: { create: (c: never) => c } }));
vi.mock('@vendure/core', () => ({
    internal_getRequestContext: (_r: unknown, c: { ctx: unknown }) => c.ctx,
}));

import { StaffEmailChangeInterceptor } from '../../staff-email-change.interceptor';

function run(change: string, apiType = 'admin', field = 'updateCustomer') {
    const input: Record<string, unknown> = {
        id: '4',
        emailAddress: 'New@Example.com',
        firstName: 'A',
    };
    const changes = {
        classify: vi.fn(async () => change),
        stage: vi.fn(async () => undefined),
        cancel: vi.fn(async () => undefined),
    };
    const context = {
        ctx: { apiType },
        getType: () => 'graphql',
        getInfo: () => ({ parentType: { name: 'Mutation' }, fieldName: field }),
        getContext: () => ({ req: {} }),
        getArgs: () => ({ input }),
    };
    const seen: unknown[] = [];
    const next = { handle: () => (seen.push({ ...input }), of('result')) };
    const done = new StaffEmailChangeInterceptor(changes as never)
        .intercept(context as never, next as never)
        .then(o => lastValueFrom(o));
    return { done, changes, input, seen };
}

describe('StaffEmailChangeInterceptor', () => {
    it('removes a staged address from the update and records it after success', async () => {
        const t = run('staged');
        expect(await t.done).toBe('result');
        expect(t.seen[0]).toEqual({ id: '4', firstName: 'A' });
        expect(t.changes.stage).toHaveBeenCalledWith({ apiType: 'admin' }, 4, 'New@Example.com');
    });

    it('cancels a pending change when staff set the current address again', async () => {
        const t = run('unchanged');
        await t.done;
        expect(t.input.emailAddress).toBeUndefined();
        expect(t.changes.cancel).toHaveBeenCalled();
    });

    it('passes the update through untouched when core must apply or reject it', async () => {
        const t = run('apply');
        await t.done;
        expect(t.input.emailAddress).toBe('New@Example.com');
        expect(t.changes.stage).not.toHaveBeenCalled();
    });

    it('ignores the shop api and other mutations', async () => {
        for (const t of [run('staged', 'shop'), run('staged', 'admin', 'updateCustomerNote')]) {
            await t.done;
            expect(t.changes.classify).not.toHaveBeenCalled();
            expect(t.input.emailAddress).toBe('New@Example.com');
        }
    });
});
