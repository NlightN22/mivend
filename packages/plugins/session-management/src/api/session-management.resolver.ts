import { Args, Mutation, Query, Resolver } from '@nestjs/graphql';
import { Allow, Ctx, Permission, RequestContext } from '@vendure/core';

import { SignInSettings, SignInSettingsService } from '../sign-in-settings.service';
import { SessionManagementService } from '../session-management.service';
import { SessionSummary } from '../session.types';

@Resolver()
export class SessionManagementResolver {
    constructor(
        private sessionManagementService: SessionManagementService,
        private signInSettings: SignInSettingsService,
    ) {}

    @Query()
    @Allow(Permission.Authenticated)
    mySessions(@Ctx() ctx: RequestContext): Promise<SessionSummary[]> {
        return this.sessionManagementService.getMySessions(ctx);
    }

    @Mutation()
    @Allow(Permission.Authenticated)
    endSession(@Ctx() ctx: RequestContext, @Args('id') id: string): Promise<boolean> {
        return this.sessionManagementService.endSession(ctx, id);
    }

    @Mutation()
    @Allow(Permission.Authenticated)
    endOtherSessions(@Ctx() ctx: RequestContext): Promise<boolean> {
        return this.sessionManagementService.endOtherSessions(ctx);
    }

    @Mutation()
    @Allow(Permission.Authenticated)
    endAllSessions(@Ctx() ctx: RequestContext): Promise<boolean> {
        return this.sessionManagementService.endAllSessions(ctx);
    }

    @Query()
    @Allow(Permission.Authenticated)
    mySignInSettings(@Ctx() ctx: RequestContext): Promise<SignInSettings> {
        return this.signInSettings.get(ctx);
    }

    @Mutation()
    @Allow(Permission.Authenticated)
    setNewDeviceEmail(
        @Ctx() ctx: RequestContext,
        @Args('enabled') enabled: boolean,
    ): Promise<SignInSettings> {
        return this.signInSettings.setNewDeviceEmail(ctx, enabled);
    }
}
