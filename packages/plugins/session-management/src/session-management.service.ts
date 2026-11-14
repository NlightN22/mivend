import { Injectable } from '@nestjs/common';
import {
    AuthenticatedSession,
    ConfigService,
    ForbiddenError,
    ID,
    RequestContext,
    Session,
    TransactionalConnection,
    UserService,
} from '@vendure/core';
import { MoreThan } from 'typeorm';
import { findBounded, keysetBatches } from 'shared';

import { ActingContextService } from './acting-context.service';
import { labelForUserAgent, SessionSummary } from './session.types';

// A manager's acting session is not the customer's own: it stays out of their list and their bulk sign-out.
function isOwn(session: AuthenticatedSession): boolean {
    return !(session.customFields as { actingAdministratorId?: string | null } | undefined)
        ?.actingAdministratorId;
}

@Injectable()
export class SessionManagementService {
    constructor(
        private connection: TransactionalConnection,
        private configService: ConfigService,
        private userService: UserService,
        private acting: ActingContextService,
    ) {}

    // A manager acting as the customer must not sign the customer out of their own devices.
    private async refuseActing(ctx: RequestContext): Promise<void> {
        if (await this.acting.get(ctx)) throw new ForbiddenError();
    }

    async getMySessions(ctx: RequestContext): Promise<SessionSummary[]> {
        const userId = ctx.activeUserId;
        if (!userId) {
            return [];
        }
        const repo = this.connection.getRepository(ctx, AuthenticatedSession);
        const sessions = await findBounded(repo, {
            where: { user: { id: userId }, invalidated: false },
            order: { createdAt: 'DESC' },
        });
        const currentToken = ctx.session?.token;
        return sessions.filter(isOwn).map(session => this.toSummary(session, currentToken));
    }

    async endSession(ctx: RequestContext, sessionId: string): Promise<boolean> {
        await this.refuseActing(ctx);
        const userId = ctx.activeUserId;
        if (!userId) {
            return false;
        }
        const repo = this.connection.getRepository(ctx, AuthenticatedSession);
        const session = await repo.findOne({ where: { id: sessionId, user: { id: userId } } });
        if (!session || !isOwn(session)) {
            return false;
        }
        await this.invalidate(ctx, session);
        return true;
    }

    async endOtherSessions(ctx: RequestContext): Promise<boolean> {
        await this.refuseActing(ctx);
        const userId = ctx.activeUserId;
        if (!userId) {
            return false;
        }
        const currentToken = ctx.session?.token;
        const repo = this.connection.getRepository(ctx, AuthenticatedSession);
        const sessions = await findBounded(repo, {
            where: { user: { id: userId }, invalidated: false },
        });
        for (const session of sessions.filter(isOwn)) {
            if (session.token !== currentToken) {
                await this.invalidate(ctx, session);
            }
        }
        return true;
    }

    // Intentionally ends the caller's own session too, to match the frontend's
    // "Sign out everywhere" button behaviour.
    async endAllSessions(ctx: RequestContext): Promise<boolean> {
        await this.refuseActing(ctx);
        const userId = ctx.activeUserId;
        if (!userId) {
            return false;
        }
        const user = await this.userService.getUserById(ctx, userId);
        if (!user) {
            return false;
        }
        await this.deleteOwnSessions(ctx, user.id);
        return true;
    }

    // Core's deleteSessionsByUser also removes the acting sessions, which share the customer's user.
    async deleteOwnSessions(ctx: RequestContext, userId: ID): Promise<void> {
        const repo = this.connection.getRepository(ctx, AuthenticatedSession);
        const slices = keysetBatches<AuthenticatedSession>((afterId, limit) =>
            repo.find({
                where: {
                    user: { id: userId },
                    ...(afterId === null ? {} : { id: MoreThan(afterId) }),
                },
                order: { id: 'ASC' },
                take: limit,
            }),
        );
        for await (const slice of slices) {
            const own = slice.filter(isOwn);
            // delete by id: remove() would clear the ids the next slice's cursor reads.
            if (own.length > 0) await repo.delete(own.map(session => Number(session.id)));
            for (const session of own) {
                await this.configService.authOptions.sessionCacheStrategy.delete(session.token);
            }
        }
    }

    // Targets base Session so anonymous cart sessions are swept too (STI shares one table).
    async deleteEndedSessions(ctx: RequestContext): Promise<number> {
        const result = await this.connection
            .getRepository(ctx, Session)
            .createQueryBuilder()
            .delete()
            .from(Session)
            .where('expires <= :now OR invalidated = true', { now: new Date() })
            .execute();
        return result.affected ?? 0;
    }

    private async invalidate(ctx: RequestContext, session: AuthenticatedSession): Promise<void> {
        const repo = this.connection.getRepository(ctx, AuthenticatedSession);
        await repo.update({ id: session.id }, { invalidated: true });
        await this.configService.authOptions.sessionCacheStrategy.delete(session.token);
    }

    private toSummary(
        session: AuthenticatedSession,
        currentToken: string | undefined,
    ): SessionSummary {
        const userAgent =
            (session.customFields as { userAgent?: string | null })?.userAgent ?? null;
        return {
            id: String(session.id),
            userAgent,
            deviceLabel: labelForUserAgent(userAgent),
            createdAt: session.createdAt,
            expires: session.expires,
            current: session.token === currentToken,
        };
    }
}
