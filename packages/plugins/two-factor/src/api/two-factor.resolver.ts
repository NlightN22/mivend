import { Args, Mutation, Query, Resolver } from '@nestjs/graphql';
import { Allow, Ctx, ForbiddenError, Permission, RequestContext, Transaction } from '@vendure/core';
import { ActingContextService } from '@mivend/plugin-session-management';

import { TwoFactorChallengeService } from '../two-factor-challenge.service';
import { TwoFactorEnrolmentService } from '../two-factor-enrolment.service';
import { TwoFactorPolicyService } from '../two-factor-policy.service';
import { TwoFactorRecoveryService } from '../two-factor-recovery.service';
import { twoFactorError } from '../two-factor.types';
import type {
    TwoFactorChallengeResult,
    TwoFactorEnrolmentResult,
    TwoFactorErrorResult,
    TwoFactorRecoveryRequestedResult,
    TwoFactorStatusResult,
} from '../two-factor.types';

@Resolver()
export class TwoFactorResolver {
    constructor(
        private policy: TwoFactorPolicyService,
        private challenges: TwoFactorChallengeService,
        private enrolment: TwoFactorEnrolmentService,
        private recovery: TwoFactorRecoveryService,
        private acting: ActingContextService,
    ) {}

    @Query()
    @Allow(Permission.Public)
    twoFactorRequired(): boolean {
        return this.policy.required;
    }

    @Query()
    @Allow(Permission.Authenticated)
    twoFactorStatus(@Ctx() ctx: RequestContext): Promise<TwoFactorStatusResult> {
        return this.enrolment.status(ctx, this.ownUserId(ctx));
    }

    @Transaction()
    @Mutation()
    @Allow(Permission.Public)
    startTwoFactorSignIn(
        @Ctx() ctx: RequestContext,
        @Args() args: { username: string; password: string },
    ): Promise<TwoFactorChallengeResult | TwoFactorErrorResult> {
        return this.challenges.start(ctx, args.username, args.password);
    }

    @Transaction()
    @Mutation()
    @Allow(Permission.Public)
    async startTwoFactorEnrolment(
        @Ctx() ctx: RequestContext,
        @Args()
        args: { challenge?: string | null; password?: string | null; currentCode?: string | null },
    ): Promise<TwoFactorEnrolmentResult | TwoFactorErrorResult> {
        if (args.challenge) return this.enrolment.startForChallenge(ctx, args.challenge);
        await this.refuseActing(ctx);
        return this.enrolment.startForSession(
            ctx,
            this.ownUserId(ctx),
            args.password,
            args.currentCode,
        );
    }

    @Transaction()
    @Mutation()
    @Allow(Permission.Authenticated)
    async confirmTwoFactorEnrolment(
        @Ctx() ctx: RequestContext,
        @Args() args: { code: string },
    ): Promise<TwoFactorStatusResult | TwoFactorErrorResult> {
        await this.refuseActing(ctx);
        const userId = this.ownUserId(ctx);
        const outcome = await this.enrolment.confirmForSession(ctx, userId, args.code);
        if (outcome === 'ACTIVATED') return this.enrolment.status(ctx, userId);
        if (outcome === 'INVALID_CODE') return twoFactorError('INVALID_CODE');
        return twoFactorError('ENROLMENT_EXPIRED');
    }

    @Transaction()
    @Mutation()
    @Allow(Permission.Public)
    requestTwoFactorRecovery(
        @Ctx() ctx: RequestContext,
        @Args() args: { challenge: string },
    ): Promise<TwoFactorRecoveryRequestedResult | TwoFactorErrorResult> {
        return this.recovery.request(ctx, args.challenge);
    }

    @Transaction()
    @Mutation()
    @Allow(Permission.Public)
    completeTwoFactorRecovery(
        @Ctx() ctx: RequestContext,
        @Args() args: { token: string; password: string },
    ): Promise<TwoFactorChallengeResult | TwoFactorErrorResult> {
        return this.recovery.complete(ctx, args.token, args.password);
    }

    private ownUserId(ctx: RequestContext): string {
        if (!ctx.activeUserId) throw new ForbiddenError();
        return String(ctx.activeUserId);
    }

    // A manager acting as a customer must not touch the customer's second factor.
    private async refuseActing(ctx: RequestContext): Promise<void> {
        if (await this.acting.get(ctx)) throw new ForbiddenError();
    }
}
