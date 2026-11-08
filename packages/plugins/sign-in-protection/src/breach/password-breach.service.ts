import { Inject, Injectable } from '@nestjs/common';
import { Logger, RequestContext, TransactionalConnection } from '@vendure/core';
import { ctxQuery } from 'shared';

import { SIGN_IN_PROTECTION_OPTIONS, loggerCtx } from '../types';
import type { SignInProtectionOptions } from '../types';

@Injectable()
export class PasswordBreachService {
    constructor(
        private connection: TransactionalConnection,
        @Inject(SIGN_IN_PROTECTION_OPTIONS) private options: SignInProtectionOptions,
    ) {}

    // Core saves the stale User after the new hash (reset, then session creation), writing the old flag back; clear it last.
    async clearPasswordChangeRequired(ctx: RequestContext, userId: string): Promise<void> {
        await ctxQuery(
            this.connection,
            ctx,
            `UPDATE "user" SET "customFieldsPasswordchangerequired" = false WHERE id = $1`,
            [userId],
        );
    }

    // The only moment the plaintext exists for an old password; a hit requires a change, it does not block sign-in.
    async flagIfBreached(ctx: RequestContext, userId: string, password: string): Promise<void> {
        const checker = this.options.breach.checker;
        if (!checker) return;
        const verdict = await checker.check(password);
        if (verdict === 'unavailable') {
            Logger.warn('Breached-password lookup unavailable at sign-in, skipped', loggerCtx);
            return;
        }
        if (verdict !== 'breached') return;
        await ctxQuery(
            this.connection,
            ctx,
            `UPDATE "user" SET "customFieldsPasswordchangerequired" = true WHERE id = $1`,
            [userId],
        );
    }
}
