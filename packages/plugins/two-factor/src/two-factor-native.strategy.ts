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
import { SignInGuardService } from '@mivend/plugin-sign-in-protection';

import { TwoFactorPolicyService } from './two-factor-policy.service';

export const TWO_FACTOR_REQUIRED_ERROR = 'TWO_FACTOR_REQUIRED';

type PasswordStrategy = Pick<
    NativeAuthenticationStrategy,
    'init' | 'defineInputType' | 'authenticate' | 'verifyUserPassword'
>;

// Same name as the stock strategy, which it wraps: a password alone never opens a session where a second step
// is needed. The code is only ever taken by the `twoFactor` strategy.
export class TwoFactorNativeAuthenticationStrategy implements AuthenticationStrategy<NativeAuthenticationData> {
    readonly name = NATIVE_AUTH_STRATEGY_NAME;
    private policy!: TwoFactorPolicyService;
    private guard!: SignInGuardService;

    constructor(private readonly native: PasswordStrategy = new NativeAuthenticationStrategy()) {}

    async init(injector: Injector): Promise<void> {
        await this.native.init(injector);
        this.policy = injector.get(TwoFactorPolicyService);
        this.guard = injector.get(SignInGuardService);
    }

    defineInputType(): DocumentNode {
        return this.native.defineInputType();
    }

    verifyUserPassword(ctx: RequestContext, userId: ID, password: string): Promise<boolean> {
        return this.native.verifyUserPassword(ctx, userId, password);
    }

    // Password check only, for the step that issues a challenge. A throttled or CAPTCHA-less attempt is a plain false.
    async verifyCredentials(
        ctx: RequestContext,
        data: NativeAuthenticationData,
    ): Promise<User | false> {
        if (!(await this.guard.admit(ctx, data.username))) return false;
        const user = await this.native.authenticate(ctx, data);
        if (!user) {
            await this.guard.recordFailure(ctx, data.username);
            return false;
        }
        await this.guard.recordSuccess(ctx, data.username, user, data.password);
        return user;
    }

    async authenticate(
        ctx: RequestContext,
        data: NativeAuthenticationData,
    ): Promise<User | false | string> {
        const user = await this.verifyCredentials(ctx, data);
        if (!user) return false;
        return (await this.policy.isEnforced(ctx, String(user.id)))
            ? TWO_FACTOR_REQUIRED_ERROR
            : user;
    }
}
