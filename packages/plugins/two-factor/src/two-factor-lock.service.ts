import { Injectable } from '@nestjs/common';
import { RequestContext, TransactionalConnection } from '@vendure/core';
import { withAggregateLock } from 'shared';

const LOCK_TIMEOUT_MS = 15_000;

// Every state change of one account's factor (enrol, confirm, sign-in step, recovery) runs under this lock.
@Injectable()
export class TwoFactorLockService {
    constructor(private connection: TransactionalConnection) {}

    withUser<T>(
        ctx: RequestContext,
        userId: string,
        work: (txCtx: RequestContext) => Promise<T>,
    ): Promise<T> {
        return withAggregateLock(this.connection, ctx, `two-factor:${userId}`, work, {
            lockTimeoutMs: LOCK_TIMEOUT_MS,
        });
    }
}
