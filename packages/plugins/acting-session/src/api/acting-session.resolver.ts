import { Args, Mutation, Resolver } from '@nestjs/graphql';
import { Allow, Ctx, Permission, RequestContext, Transaction } from '@vendure/core';

import { ActingSessionService } from '../acting-session.service';
import type { ActingSessionToken, ActingTicketStart } from '../acting-session.types';

@Resolver()
export class ActingSessionAdminResolver {
    constructor(private actingSessions: ActingSessionService) {}

    @Transaction()
    @Mutation()
    @Allow(Permission.CreateOrder)
    startActingSession(
        @Ctx() ctx: RequestContext,
        @Args() args: { counterpartyId: string; tradingPointId?: string | null },
    ): Promise<ActingTicketStart> {
        return this.actingSessions.start(
            ctx,
            String(args.counterpartyId),
            args.tradingPointId ?? null,
        );
    }
}

@Resolver()
export class ActingSessionShopResolver {
    constructor(private actingSessions: ActingSessionService) {}

    @Transaction()
    @Mutation()
    @Allow(Permission.Public)
    exchangeActingTicket(
        @Ctx() ctx: RequestContext,
        @Args() args: { ticket: string },
    ): Promise<ActingSessionToken> {
        return this.actingSessions.exchange(ctx, args.ticket);
    }

    @Transaction()
    @Mutation()
    @Allow(Permission.Authenticated)
    finishActingSession(@Ctx() ctx: RequestContext): Promise<boolean> {
        return this.actingSessions.finish(ctx);
    }
}
