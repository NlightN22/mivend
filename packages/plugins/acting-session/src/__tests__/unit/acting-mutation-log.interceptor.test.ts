import { describe, expect, it, vi, beforeEach } from 'vitest';

const state = vi.hoisted(() => ({ parent: 'Mutation', logged: [] as string[] }));

vi.mock('@nestjs/graphql', () => ({
    GqlExecutionContext: {
        create: () => ({
            getInfo: () => ({ parentType: { name: state.parent }, fieldName: 'addItemToOrder' }),
            getContext: () => ({ req: {} }),
        }),
    },
}));
vi.mock('@vendure/core', async importOriginal => ({
    ...(await importOriginal<typeof import('@vendure/core')>()),
    internal_getRequestContext: () => ({
        apiType: 'shop',
        session: { token: 't' },
        activeUserId: 'u-1',
    }),
    Logger: { info: (message: string) => state.logged.push(message) },
}));

import { ActingMutationLogInterceptor } from '../../acting-mutation-log.interceptor';

const handler = { handle: () => 'next' };
const context = { getType: () => 'graphql' } as never;

beforeEach(() => {
    state.parent = 'Mutation';
    state.logged = [];
});

describe('ActingMutationLogInterceptor', () => {
    it('logs who, what and when for a mutation in an acting session', async () => {
        const interceptor = new ActingMutationLogInterceptor({
            get: async () => ({ administratorId: '7', tradingPointId: null }),
        } as never);

        await interceptor.intercept(context, handler as never);

        expect(state.logged).toHaveLength(1);
        expect(state.logged[0]).toMatch(
            /administrator=7 user=u-1 mutation=addItemToOrder at=\d{4}-/,
        );
    });

    it('logs nothing for an ordinary customer mutation or for a query', async () => {
        const ordinary = new ActingMutationLogInterceptor({ get: async () => null } as never);
        await ordinary.intercept(context, handler as never);
        state.parent = 'Query';
        const acting = new ActingMutationLogInterceptor({
            get: async () => ({ administratorId: '7', tradingPointId: null }),
        } as never);
        await acting.intercept(context, handler as never);

        expect(state.logged).toEqual([]);
    });
});
