import { randomUUID } from 'node:crypto';
import type { RequestContext, TransactionalConnection } from '@vendure/core';

// Rolls back only the work's own statements on failure, so a SQL error cannot leave the outer
// transaction aborted. Needs an active transaction on `ctx`.
export async function withSavepoint<T>(
    connection: Pick<TransactionalConnection, 'getRepository'>,
    ctx: RequestContext,
    work: () => Promise<T>,
): Promise<T> {
    const repo = connection.getRepository(ctx, 'Channel');
    const name = `sp_${randomUUID().replace(/-/g, '')}`;
    await repo.query(`SAVEPOINT ${name}`);
    try {
        const result = await work();
        await repo.query(`RELEASE SAVEPOINT ${name}`);
        return result;
    } catch (error) {
        await repo.query(`ROLLBACK TO SAVEPOINT ${name}`);
        throw error;
    }
}
