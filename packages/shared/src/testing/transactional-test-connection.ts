import type { RequestContext, TransactionalConnection } from '@vendure/core';
import type { DataSource, EntityManager } from 'typeorm';

export interface TestTxContext {
    em: EntityManager;
}

// Stands in for TransactionalConnection over a plain DataSource: nested withTransaction reuses
// the caller's transaction; unregistered entities get a raw query handle.
export function createTestConnection(dataSource: DataSource): TransactionalConnection {
    const connection = {
        withTransaction: (ctx: unknown, work: (ctx: TestTxContext) => Promise<unknown>) => {
            const existing = (ctx as Partial<TestTxContext>).em;
            return existing ? work({ em: existing }) : dataSource.transaction(em => work({ em }));
        },
        getRepository: (ctx: Partial<TestTxContext>, entity: unknown) => {
            const em = ctx.em ?? dataSource.manager;
            if (typeof entity === 'function' && dataSource.hasMetadata(entity)) {
                return em.getRepository(entity);
            }
            return { query: (sql: string, params?: unknown[]) => em.query(sql, params) };
        },
    };
    return connection as unknown as TransactionalConnection;
}

export const testRequestContext = {} as RequestContext;
