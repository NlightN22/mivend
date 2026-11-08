import { Args, Context, Mutation, Resolver } from '@nestjs/graphql';
import {
    Allow,
    AuthService,
    ConfigService,
    CustomerService,
    Ctx,
    Permission,
    RequestContext,
    Role,
    Transaction,
    User,
    isGraphQlErrorResult,
    setSessionToken,
} from '@vendure/core';

import { TwoFactorPolicyService } from '../two-factor-policy.service';

type SetTokenOptions = Parameters<typeof setSessionToken>[0];

interface CurrentUserResult {
    __typename: 'CurrentUser';
    id: User['id'];
    identifier: string;
    channels: Array<{ id: Role['id']; token: string; code: string; permissions: string[] }>;
}

function currentUser(user: User, withChannels: boolean): CurrentUserResult {
    const channels = new Map<string, CurrentUserResult['channels'][number]>();
    for (const role of withChannels ? (user.roles ?? []) : []) {
        for (const channel of role.channels) {
            const known = channels.get(channel.code);
            const permissions = [...new Set([...(known?.permissions ?? []), ...role.permissions])];
            channels.set(channel.code, {
                id: channel.id,
                token: channel.token,
                code: channel.code,
                permissions,
            });
        }
    }
    return {
        __typename: 'CurrentUser',
        id: user.id,
        identifier: user.identifier,
        channels: [...channels.values()],
    };
}

// Core signs the customer in right after setting a password (verifyCustomerAccount, resetPassword).
// For an account that needs a second step that would be a session without it, so these end without one.
@Resolver()
export class ShopAccountSetupResolver {
    constructor(
        private customers: CustomerService,
        private authService: AuthService,
        private configService: ConfigService,
        private policy: TwoFactorPolicyService,
    ) {}

    @Transaction()
    @Mutation()
    @Allow(Permission.Public)
    async verifyCustomerAccount(
        @Ctx() ctx: RequestContext,
        @Args() args: { token: string; password?: string | null },
        @Context('req') req: SetTokenOptions['req'],
        @Context('res') res: SetTokenOptions['res'],
    ): Promise<unknown> {
        const customer = await this.customers.verifyCustomerEmailAddress(
            ctx,
            args.token,
            args.password || undefined,
        );
        if (isGraphQlErrorResult(customer) || !customer.user) return customer;
        return this.finish(ctx, customer.user, true, req, res);
    }

    @Transaction()
    @Mutation()
    @Allow(Permission.Public)
    async resetPassword(
        @Ctx() ctx: RequestContext,
        @Args() args: { token: string; password: string },
        @Context('req') req: SetTokenOptions['req'],
        @Context('res') res: SetTokenOptions['res'],
    ): Promise<unknown> {
        const user = await this.customers.resetPassword(ctx, args.token, args.password);
        if (isGraphQlErrorResult(user)) return user;
        return this.finish(ctx, user, false, req, res);
    }

    private async finish(
        ctx: RequestContext,
        user: User,
        rememberMe: boolean,
        req: SetTokenOptions['req'],
        res: SetTokenOptions['res'],
    ): Promise<unknown> {
        if (await this.policy.isEnforced(ctx, String(user.id))) return currentUser(user, false);
        const session = await this.authService.createAuthenticatedSessionForUser(
            ctx,
            user,
            'native',
        );
        if (isGraphQlErrorResult(session)) return session;
        setSessionToken({
            req,
            res,
            authOptions: this.configService.authOptions,
            rememberMe,
            sessionToken: session.token,
        });
        return currentUser(session.user, true);
    }
}
