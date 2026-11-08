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

    constructor(private readonly native: PasswordStrategy = new NativeAuthenticationStrategy()) {}

    async init(injector: Injector): Promise<void> {
        await this.native.init(injector);
        this.policy = injector.get(TwoFactorPolicyService);
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
        const user = await this.native.authenticate(ctx, data);
        if (!user) return false;
        return (await this.policy.isEnforced(ctx, String(user.id)))
            ? TWO_FACTOR_REQUIRED_ERROR
            : user;
    }
}
