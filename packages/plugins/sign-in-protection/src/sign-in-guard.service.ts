import { Injectable } from '@nestjs/common';
import { RequestContext, User } from '@vendure/core';

import { PasswordBreachService } from './breach/password-breach.service';
import { CaptchaService } from './captcha/captcha.service';
import { SignInThrottleService } from './sign-in-throttle.service';

// What the password step asks before and after checking a password; refusal is indistinguishable from a wrong password.
@Injectable()
export class SignInGuardService {
    constructor(
        private throttle: SignInThrottleService,
        private captcha: CaptchaService,
        private breach: PasswordBreachService,
    ) {}

    clearPasswordChangeRequired(ctx: RequestContext, userId: string): Promise<void> {
        return this.breach.clearPasswordChangeRequired(ctx, userId);
    }

    async admit(ctx: RequestContext, login: string): Promise<boolean> {
        await this.throttle.lock(ctx, 'password', login);
        if (await this.throttle.isLocked(ctx, 'password', login)) return false;
        return this.captcha.passes(ctx, login);
    }

    recordFailure(ctx: RequestContext, login: string): Promise<void> {
        return this.throttle.recordFailure(ctx, 'password', login);
    }

    async recordSuccess(
        ctx: RequestContext,
        login: string,
        user: User,
        password: string,
    ): Promise<void> {
        await this.throttle.reset(ctx, 'password', login);
        await this.breach.flagIfBreached(ctx, String(user.id), password);
    }
}
