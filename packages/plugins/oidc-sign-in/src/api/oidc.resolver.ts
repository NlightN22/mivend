import { Args, Mutation, Query, Resolver } from '@nestjs/graphql';
import { Allow, Ctx, Permission, RequestContext } from '@vendure/core';

import { OidcProviderService } from '../oidc-provider.service';
import { OidcSignInService } from '../oidc-sign-in.service';
import type { OidcSignInResult } from '../oidc.types';

@Resolver()
export class OidcResolver {
    constructor(
        private provider: OidcProviderService,
        private signIn: OidcSignInService,
    ) {}

    @Query()
    @Allow(Permission.Public)
    oidcSignIn(): { host: string; iconUrl: string } | null {
        return this.provider.publicInfo;
    }

    @Mutation()
    @Allow(Permission.Public)
    async startOidcSignIn(@Ctx() ctx: RequestContext): Promise<{ authorizationUrl: string }> {
        if (!this.provider.enabled) throw new Error('OIDC sign-in is not configured');
        return { authorizationUrl: await this.signIn.start(ctx) };
    }

    @Mutation()
    @Allow(Permission.Authenticated)
    prepareOidcSignOut(@Ctx() ctx: RequestContext): Promise<string | null> {
        return this.signIn.providerSignOutUrl(ctx);
    }

    @Mutation()
    @Allow(Permission.Public)
    completeOidcSignIn(
        @Ctx() ctx: RequestContext,
        @Args() args: { code: string; state: string },
    ): Promise<OidcSignInResult> {
        if (!this.provider.enabled) return Promise.resolve('FAILED');
        return this.signIn.complete(ctx, args.code, args.state);
    }
}
