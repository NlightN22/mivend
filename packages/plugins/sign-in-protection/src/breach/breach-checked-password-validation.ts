import { Logger, PasswordValidationStrategy, RequestContext } from '@vendure/core';

import { loggerCtx } from '../types';
import type { BreachedPasswordChecker } from './breached-password-checker';

export const PASSWORD_BREACHED_MESSAGE = 'PASSWORD_BREACHED';

// Runs after the wrapped rules; a lookup that cannot answer lets the password through and is logged.
export class BreachCheckedPasswordValidationStrategy implements PasswordValidationStrategy {
    constructor(
        private inner: PasswordValidationStrategy,
        private checker: BreachedPasswordChecker,
    ) {}

    async validate(ctx: RequestContext, password: string): Promise<boolean | string> {
        const base = await this.inner.validate(ctx, password);
        if (base !== true) return base;
        const verdict = await this.checker.check(password);
        if (verdict === 'unavailable') {
            Logger.warn('Breached-password lookup unavailable, password accepted', loggerCtx);
        }
        return verdict === 'breached' ? PASSWORD_BREACHED_MESSAGE : true;
    }
}
