import type { DocumentNode } from 'graphql';
import {
    AuthenticationStrategy,
    ID,
    Injector,
    NATIVE_AUTH_STRATEGY_NAME,
    NativeAuthenticationData,
    NativeAuthenticationStrategy,
    RequestContext,
    User,
} from '@vendure/core';

import { FactorStoreService } from './factor-store.service';
import { TwoFactorLockService } from './two-factor-lock.service';
import { TwoFactorPolicyService } from './two-factor-policy.service';
import { TwoFactorVerificationService } from './two-factor-verification.service';

export const TWO_FACTOR_REQUIRED_ERROR = 'TWO_FACTOR_REQUIRED';
export const TWO_FACTOR_INVALID_CODE_ERROR = 'TWO_FACTOR_INVALID_CODE';

const INLINE_CODE = /^(.+) (\d{6})$/s;

interface Candidate {
    password: string;
    code: string | null;
}

// Same name as the stock strategy, which it wraps: a password alone never opens a session where a second step
// is needed. Admins may append " <code>" to the password (the stock Dashboard form has no code field).
export class TwoFactorNativeAuthenticationStrategy implements AuthenticationStrategy<NativeAuthenticationData> {
    readonly name = NATIVE_AUTH_STRATEGY_NAME;
    private readonly native = new NativeAuthenticationStrategy();
    private policy!: TwoFactorPolicyService;
    private verification!: TwoFactorVerificationService;
    private factors!: FactorStoreService;
    private locks!: TwoFactorLockService;

    async init(injector: Injector): Promise<void> {
        await this.native.init(injector);
        this.policy = injector.get(TwoFactorPolicyService);
        this.verification = injector.get(TwoFactorVerificationService);
        this.factors = injector.get(FactorStoreService);
        this.locks = injector.get(TwoFactorLockService);
    }

    defineInputType(): DocumentNode {
        return this.native.defineInputType();
    }

    verifyUserPassword(ctx: RequestContext, userId: ID, password: string): Promise<boolean> {
        return this.native.verifyUserPassword(ctx, userId, password);
    }

    // Password check only, for the step that issues a challenge.
    verifyCredentials(ctx: RequestContext, data: NativeAuthenticationData): Promise<User | false> {
        return this.native.authenticate(ctx, data);
    }

    async authenticate(
        ctx: RequestContext,
        data: NativeAuthenticationData,
    ): Promise<User | false | string> {
        // #278: throttle failed password attempts here.
        const inline = ctx.apiType === 'admin' ? INLINE_CODE.exec(data.password) : null;
        const candidates: Candidate[] = [{ password: data.password, code: null }];
        if (inline) candidates.unshift({ password: inline[1], code: inline[2] });
        for (const candidate of candidates) {
            const user = await this.native.authenticate(ctx, {
                username: data.username,
                password: candidate.password,
            });
            if (user) return this.secondStep(ctx, user, candidate.code);
        }
        return false;
    }

    private async secondStep(
        ctx: RequestContext,
        user: User,
        code: string | null,
    ): Promise<User | string> {
        const userId = String(user.id);
        if (!(await this.policy.isEnforced(ctx, userId))) return user;
        if (!code) return TWO_FACTOR_REQUIRED_ERROR;
        return this.locks.withUser(ctx, userId, async txCtx => {
            const factor = await this.factors.find(txCtx, userId, 'active');
            // #278: throttle failed second-step attempts here.
            const accepted =
                factor && (await this.verification.verifyAndClaim(txCtx, factor, code));
            return accepted ? user : TWO_FACTOR_INVALID_CODE_ERROR;
        });
    }
}
