import { Args, Mutation, Query, Resolver } from '@nestjs/graphql';
import { Allow, Ctx, Permission, RequestContext } from '@vendure/core';

import { OidcProviderService } from '../oidc-provider.service';
import { OidcSignInService } from '../oidc-sign-in.service';

@Resolver()
export class OidcResolver {
    constructor(
        private provider: OidcProviderService,
        private signIn: OidcSignInService,
    ) {}

    @Query()
    @Allow(Permission.Public)
    oidcSignInEnabled(): boolean {
        return this.provider.enabled;
    }

    @Mutation()
    @Allow(Permission.Public)
    async startOidcSignIn(@Ctx() ctx: RequestContext): Promise<{ authorizationUrl: string }> {
        if (!this.provider.enabled) throw new Error('OIDC sign-in is not configured');
        return { authorizationUrl: await this.signIn.start(ctx) };
    }

    @Mutation()
    @Allow(Permission.Public)
    completeOidcSignIn(
        @Ctx() ctx: RequestContext,
        @Args() args: { code: string; state: string },
    ): Promise<boolean> {
        if (!this.provider.enabled) return Promise.resolve(false);
        return this.signIn.complete(ctx, args.code, args.state);
    }
}
