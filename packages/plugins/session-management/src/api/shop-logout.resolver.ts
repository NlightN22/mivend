import { Context, Mutation, Resolver } from '@nestjs/graphql';
import {
    Allow,
    ConfigService,
    Ctx,
    EventBus,
    LogoutEvent,
    Permission,
    RequestContext,
    extractSessionToken,
    setSessionToken,
} from '@vendure/core';

import { ActingContextService } from '../acting-context.service';
import { SessionManagementService } from '../session-management.service';

type SetTokenOptions = Parameters<typeof setSessionToken>[0];

// Replaces core's logout, which deletes every session of the user, acting sessions included.
@Resolver()
export class ShopLogoutResolver {
    constructor(
        private sessions: SessionManagementService,
        private acting: ActingContextService,
        private configService: ConfigService,
        private eventBus: EventBus,
    ) {}

    @Mutation()
    @Allow(Permission.Public)
    async logout(
        @Ctx() ctx: RequestContext,
        @Context('req') req: SetTokenOptions['req'],
        @Context('res') res: SetTokenOptions['res'],
    ): Promise<{ success: boolean }> {
        const { authOptions } = this.configService;
        const extraction = extractSessionToken(
            req,
            authOptions.tokenMethod,
            authOptions.apiKeyHeaderKey,
        );
        if (!extraction?.token || extraction.method === 'api-key' || !ctx.activeUserId) {
            return { success: false };
        }
        if (await this.acting.get(ctx)) return { success: false };
        await this.eventBus.publish(new LogoutEvent(ctx));
        await this.sessions.deleteOwnSessions(ctx, ctx.activeUserId);
        setSessionToken({ req, res, authOptions, rememberMe: false, sessionToken: '' });
        return { success: true };
    }
}
