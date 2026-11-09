import { Injectable } from '@nestjs/common';
import {
    ConfigService,
    Logger,
    RequestContext,
    TransactionalConnection,
    User,
    UserService,
} from '@vendure/core';
import { SignInThrottleService } from '@mivend/plugin-sign-in-protection';

import { randomToken } from './oidc-crypto';
import { OidcIdentityService } from './oidc-identity.service';
import { OidcProviderService } from './oidc-provider.service';
import { OidcRequestStoreService } from './oidc-request-store.service';
import { OidcSessionTokenStoreService } from './oidc-session-token-store.service';
import { loggerCtx } from './oidc.types';
import type { OidcClaims } from './oidc.types';

// The provider decides its own factors (docs/access-control.md), so no local second step is asked here.
@Injectable()
export class OidcSignInService {
    constructor(
        private provider: OidcProviderService,
        private requests: OidcRequestStoreService,
        private tokens: OidcSessionTokenStoreService,
        private identity: OidcIdentityService,
        private throttle: SignInThrottleService,
        private users: UserService,
        private configService: ConfigService,
        private connection: TransactionalConnection,
    ) {}

    async start(ctx: RequestContext): Promise<string> {
        const nonce = randomToken();
        const verifier = randomToken();
        const state = await this.requests.create(ctx, nonce, verifier);
        if (!state) {
            Logger.warn('OIDC sign-in start refused: too many pending requests', loggerCtx);
            throw new Error('OIDC sign-in is unavailable');
        }
        return this.provider.authorizationUrl(state, nonce, verifier);
    }

    // False for every refusal, so a caller cannot tell a wrong state from an unknown account.
    // The provider is called between two short transactions, never inside one.
    async complete(ctx: RequestContext, code: string, state: string): Promise<boolean> {
        const request = await this.connection.withTransaction(ctx, tx =>
            this.requests.beginExchange(tx, state),
        );
        if (!request) return false;
        const claims = await this.provider.exchange(code, request.codeVerifier, request.nonce);
        if (!claims) return false;
        return this.connection.withTransaction(ctx, tx => this.link(tx, request.id, claims));
    }

    private async link(
        ctx: RequestContext,
        requestId: number,
        claims: OidcClaims,
    ): Promise<boolean> {
        if (await this.throttle.isLocked(ctx, 'oidc', claims.sub)) return false;
        const userId = await this.identity.resolve(ctx, claims);
        const user = userId ? await this.users.getUserById(ctx, userId) : undefined;
        if (!user || !this.mayUseApi(user)) {
            Logger.warn('OIDC sign-in refused: no single active administrator matches', loggerCtx);
            await this.throttle.recordFailure(ctx, 'oidc', claims.sub);
            return false;
        }
        await this.throttle.reset(ctx, 'oidc', claims.sub);
        await this.tokens.save(ctx, Number(user.id), claims.idToken);
        await this.requests.markVerified(ctx, requestId, String(user.id));
        return true;
    }

    // Strategy side: the verified request is claimed once.
    async claim(ctx: RequestContext, state: string): Promise<User | false> {
        const userId = await this.requests.claimVerified(ctx, state);
        if (!userId) return false;
        const user = await this.users.getUserById(ctx, userId);
        return user && this.mayUseApi(user) ? user : false;
    }

    private mayUseApi(user: User): boolean {
        return !this.configService.authOptions.requireVerification || user.verified;
    }

    // The caller's own sign-out: the provider logout URL for a provider-opened session, otherwise null.
    async providerSignOutUrl(ctx: RequestContext): Promise<string | null> {
        const sessionToken = ctx.session?.token;
        if (!ctx.activeUserId || !sessionToken) return null;
        const taken = await this.tokens.takeForSession(ctx, Number(ctx.activeUserId), sessionToken);
        return taken ? this.provider.endSessionUrl(taken.idToken) : null;
    }
}
