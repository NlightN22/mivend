import { Inject, Injectable } from '@nestjs/common';
import { Logger, RequestContext } from '@vendure/core';

import { clientIp } from '../client-ip';
import { SignInThrottleService } from '../sign-in-throttle.service';
import { CAPTCHA_TOKEN_HEADER, SIGN_IN_PROTECTION_OPTIONS, loggerCtx } from '../types';
import type { SignInProtectionOptions } from '../types';

export interface CaptchaRequirement {
    required: boolean;
    siteKey: string | null;
}

@Injectable()
export class CaptchaService {
    constructor(
        private throttle: SignInThrottleService,
        @Inject(SIGN_IN_PROTECTION_OPTIONS) private options: SignInProtectionOptions,
    ) {}

    // Same answer for an unknown and an existing login: only the counters decide.
    async requirement(ctx: RequestContext, login: string): Promise<CaptchaRequirement> {
        const { provider, afterFailures } = this.options.captcha;
        if (!provider) return { required: false, siteKey: null };
        const failures = await this.throttle.failureCount(ctx, 'password', login);
        return failures >= afterFailures
            ? { required: true, siteKey: provider.siteKey }
            : { required: false, siteKey: null };
    }

    // False only when a challenge is due and the token is missing or rejected; an unreachable provider never blocks.
    async passes(ctx: RequestContext, login: string): Promise<boolean> {
        const provider = this.options.captcha.provider;
        if (!provider || !(await this.requirement(ctx, login)).required) return true;
        const req = ctx.req as { headers?: Record<string, unknown> } | undefined;
        const token = req?.headers?.[CAPTCHA_TOKEN_HEADER];
        if (typeof token !== 'string' || token === '') return false;
        const verdict = await provider.verify(
            token,
            clientIp(ctx, this.options.throttle.trustedProxyHops),
        );
        if (verdict === 'unavailable') {
            Logger.warn(`CAPTCHA verification skipped, ${provider.name} unavailable`, loggerCtx);
        }
        return verdict !== 'invalid';
    }
}
