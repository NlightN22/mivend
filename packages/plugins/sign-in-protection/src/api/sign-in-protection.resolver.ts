import { Args, Query, Resolver } from '@nestjs/graphql';
import { Allow, Ctx, Permission, RequestContext } from '@vendure/core';

import { CaptchaService } from '../captcha/captcha.service';
import type { CaptchaRequirement } from '../captcha/captcha.service';

@Resolver()
export class SignInProtectionResolver {
    constructor(private captcha: CaptchaService) {}

    @Query()
    @Allow(Permission.Public)
    signInCaptchaRequirement(
        @Ctx() ctx: RequestContext,
        @Args() args: { login: string },
    ): Promise<CaptchaRequirement> {
        return this.captcha.requirement(ctx, args.login);
    }
}
