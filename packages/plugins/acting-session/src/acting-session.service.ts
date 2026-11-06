import { randomBytes } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import {
    AdministratorService,
    AuthenticatedSession,
    ConfigService,
    ForbiddenError,
    Logger,
    RequestContext,
    TransactionalConnection,
    User,
    UserInputError,
} from '@vendure/core';
import { ctxQuery } from 'shared';

import { ActingCartService } from './acting-cart.service';
import { ActingEligibilityService } from './acting-eligibility.service';
import { ActingSessionLivenessService } from './acting-session-liveness.service';
import { ActingTicketService } from './acting-ticket.service';
import {
    ACTING_AUTH_STRATEGY,
    ACTING_SESSION_PLUGIN_OPTIONS,
    SESSION_TTL_DEFAULT_MS,
    loggerCtx,
} from './acting-session.types';
import type {
    ActingSessionPluginOptions,
    ActingSessionToken,
    ActingTicketStart,
} from './acting-session.types';

@Injectable()
export class ActingSessionService {
    constructor(
        private connection: TransactionalConnection,
        private configService: ConfigService,
        private administratorService: AdministratorService,
        private eligibility: ActingEligibilityService,
        private tickets: ActingTicketService,
        private liveness: ActingSessionLivenessService,
        private carts: ActingCartService,
        @Inject(ACTING_SESSION_PLUGIN_OPTIONS) private options: ActingSessionPluginOptions,
    ) {}

    async start(
        ctx: RequestContext,
        counterpartyId: string,
        tradingPointId: string | null,
    ): Promise<ActingTicketStart> {
        if (!this.options.storefrontPublicUrl) {
            throw new UserInputError(
                'STOREFRONT_PUBLIC_URL is not configured; acting sessions cannot start',
            );
        }
        const admin = ctx.activeUserId
            ? await this.administratorService.findOneByUserId(ctx, ctx.activeUserId)
            : undefined;
        if (!admin || !ctx.session) throw new ForbiddenError();
        const target = await this.eligibility.resolveForManager(
            ctx,
            counterpartyId,
            tradingPointId,
        );
        const { ticket, expiresAt } = await this.tickets.issue(ctx, {
            administratorId: String(admin.id),
            parentSessionId: String(ctx.session.id),
            counterpartyId: target.counterpartyId,
            customerId: target.customerId,
            tradingPointId: target.tradingPointId,
        });
        Logger.info(
            `Acting session ticket issued: administrator=${admin.id} counterparty=${target.counterpartyId}`,
            loggerCtx,
        );
        return { ticket, storefrontUrl: this.options.storefrontPublicUrl, expiresAt };
    }

    // Built through the repository, not SessionService.createNewAuthenticatedSession, which would merge the customer's real cart.
    async exchange(ctx: RequestContext, ticket: string): Promise<ActingSessionToken> {
        const binding = await this.tickets.claim(ctx, ticket);
        const target = await this.eligibility.resolveByIds(
            ctx,
            binding.counterpartyId,
            binding.tradingPointId,
        );
        if (target.customerId !== binding.customerId) {
            throw new UserInputError('The counterparty portal access changed; start again');
        }
        const user = await this.connection
            .getRepository(ctx, User)
            .findOneOrFail({ where: { id: target.userId } });
        const ttl = this.options.sessionTtlMs ?? SESSION_TTL_DEFAULT_MS;
        const expiresAt = new Date(Date.now() + ttl);
        const token = randomBytes(32).toString('hex');
        await this.connection.getRepository(ctx, AuthenticatedSession).save(
            new AuthenticatedSession({
                token,
                user,
                authenticationStrategy: ACTING_AUTH_STRATEGY,
                expires: expiresAt,
                invalidated: false,
                customFields: {
                    actingAdministratorId: binding.administratorId,
                    actingParentSessionId: binding.parentSessionId,
                    actingTradingPointId: binding.tradingPointId,
                },
            }),
        );
        const ended = await this.liveness.endDeadSession(ctx, token, ttl);
        if (ended > 0) throw new ForbiddenError();
        Logger.info(
            `Acting session started: administrator=${binding.administratorId} customer=${binding.customerId}`,
            loggerCtx,
        );
        return {
            token,
            expiresAt,
            administratorId: binding.administratorId,
            counterpartyId: binding.counterpartyId,
            tradingPointId: binding.tradingPointId,
        };
    }

    async finish(ctx: RequestContext): Promise<boolean> {
        const token = ctx.session?.token;
        if (!token) return false;
        const rows = await ctxQuery<Array<{ id: string }>>(
            this.connection,
            ctx,
            `WITH ended AS (
                UPDATE session SET invalidated = true
                WHERE token = $1 AND invalidated = false AND "customFieldsActingadministratorid" IS NOT NULL
                RETURNING id
            ) SELECT id FROM ended`,
            [token],
        );
        if (rows.length === 0) return false;
        await this.configService.authOptions.sessionCacheStrategy.delete(token);
        await this.carts.deleteForSession(ctx, String(ctx.session?.id));
        return true;
    }
}
