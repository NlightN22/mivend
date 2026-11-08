import { createHash } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import { RequestContext } from '@vendure/core';

import { clientIp } from './client-ip';
import { ThrottleStoreService } from './throttle-store.service';
import { liveFailures, remainingLockMs } from './throttle-policy';
import { SIGN_IN_PROTECTION_OPTIONS } from './types';
import type { SignInProtectionOptions, ThrottleScope } from './types';

const sha256 = (value: string): string => createHash('sha256').update(value).digest('hex');

@Injectable()
export class SignInThrottleService {
    constructor(
        private store: ThrottleStoreService,
        @Inject(SIGN_IN_PROTECTION_OPTIONS) private options: SignInProtectionOptions,
    ) {}

    get enabled(): boolean {
        return this.options.throttle.enabled;
    }

    // The subject is hashed whether or not it names a real account, so the counters never reveal one.
    private keys(
        ctx: RequestContext,
        scope: ThrottleScope,
        subject: string,
    ): { login: string; loginIp: string } {
        const login = `${scope}:${sha256(subject.trim().toLowerCase())}`;
        const ip = clientIp(ctx, this.options.throttle.trustedProxyHops);
        return { login, loginIp: `${login}:${sha256(ip)}` };
    }

    // Take before isLocked and hold through the password check and recordFailure. A concurrent attempt on the same
    // login and address gets false at once instead of queueing, so another address is never refused as busy.
    async tryLock(ctx: RequestContext, scope: ThrottleScope, subject: string): Promise<boolean> {
        if (!this.enabled) return true;
        return this.store.tryLock(ctx, `sign-in:${this.keys(ctx, scope, subject).loginIp}`);
    }

    async isLocked(ctx: RequestContext, scope: ThrottleScope, subject: string): Promise<boolean> {
        if (!this.enabled) return false;
        const { throttle } = this.options;
        const keys = this.keys(ctx, scope, subject);
        const state = await this.store.read(ctx, [keys.login, keys.loginIp]);
        return (
            remainingLockMs(state.get(keys.login), throttle.perLogin, throttle.resetAfterMs) > 0 ||
            remainingLockMs(state.get(keys.loginIp), throttle.perLoginIp, throttle.resetAfterMs) > 0
        );
    }

    async failureCount(
        ctx: RequestContext,
        scope: ThrottleScope,
        subject: string,
    ): Promise<number> {
        if (!this.enabled) return 0;
        const keys = this.keys(ctx, scope, subject);
        const state = await this.store.read(ctx, [keys.login, keys.loginIp]);
        const { resetAfterMs } = this.options.throttle;
        return Math.max(
            liveFailures(state.get(keys.login), resetAfterMs),
            liveFailures(state.get(keys.loginIp), resetAfterMs),
        );
    }

    async recordFailure(ctx: RequestContext, scope: ThrottleScope, subject: string): Promise<void> {
        if (!this.enabled) return;
        const keys = this.keys(ctx, scope, subject);
        const { resetAfterMs } = this.options.throttle;
        await this.store.recordFailure(ctx, keys.login, resetAfterMs);
        await this.store.recordFailure(ctx, keys.loginIp, resetAfterMs);
    }

    async reset(ctx: RequestContext, scope: ThrottleScope, subject: string): Promise<void> {
        if (!this.enabled) return;
        const keys = this.keys(ctx, scope, subject);
        await this.store.reset(ctx, [keys.login, keys.loginIp]);
    }
}
