import { Injectable } from '@nestjs/common';
import {
    AuthenticatedSession,
    ConfigService,
    RequestContext,
    Session,
    SessionService,
    TransactionalConnection,
    UserService,
} from '@vendure/core';
import { DataSource } from 'typeorm';

import { labelForUserAgent, SessionSummary } from './session.types';

@Injectable()
export class SessionManagementService {
    constructor(
        private connection: TransactionalConnection,
        private configService: ConfigService,
        private userService: UserService,
        private sessionService: SessionService,
        private dataSource: DataSource,
    ) {}

    async getMySessions(ctx: RequestContext): Promise<SessionSummary[]> {
        const userId = ctx.activeUserId;
        if (!userId) {
            return [];
        }
        const repo = this.connection.getRepository(ctx, AuthenticatedSession);
        const sessions = await repo.find({
            where: { user: { id: userId }, invalidated: false },
            order: { createdAt: 'DESC' },
        });
        const currentToken = ctx.session?.token;
        return sessions.map(session => this.toSummary(session, currentToken));
    }

    async endSession(ctx: RequestContext, sessionId: string): Promise<boolean> {
        const userId = ctx.activeUserId;
        if (!userId) {
            return false;
        }
        const repo = this.connection.getRepository(ctx, AuthenticatedSession);
        const session = await repo.findOne({ where: { id: sessionId, user: { id: userId } } });
        if (!session) {
            return false;
        }
        await this.invalidate(ctx, session);
        return true;
    }

    async endOtherSessions(ctx: RequestContext): Promise<boolean> {
        const userId = ctx.activeUserId;
        if (!userId) {
            return false;
        }
        const currentToken = ctx.session?.token;
        const repo = this.connection.getRepository(ctx, AuthenticatedSession);
        const sessions = await repo.find({ where: { user: { id: userId }, invalidated: false } });
        for (const session of sessions) {
            if (session.token !== currentToken) {
                await this.invalidate(ctx, session);
            }
        }
        return true;
    }

    // "Sign out everywhere" — ends every session for the user, including the one
    // making this request, matching the existing frontend button copy/behaviour
    // (issue #40's open question, resolved this way).
    async endAllSessions(ctx: RequestContext): Promise<boolean> {
        const userId = ctx.activeUserId;
        if (!userId) {
            return false;
        }
        const user = await this.userService.getUserById(ctx, userId);
        if (!user) {
            return false;
        }
        await this.sessionService.deleteSessionsByUser(ctx, user);
        return true;
    }

    // DB hygiene, not a security control — runs outside any request, so there's no ctx to
    // build; hits the raw DataSource directly (same pattern as
    // reservation.service.ts's expireDueReservations()). Targets the base `Session` entity
    // (not just AuthenticatedSession) so expired anonymous cart sessions are swept too — both
    // subtypes share the same `session` table via TypeORM single-table inheritance.
    async deleteExpiredSessions(): Promise<number> {
        const result = await this.dataSource
            .getRepository(Session)
            .createQueryBuilder()
            .delete()
            .from(Session)
            .where('expires <= :now', { now: new Date() })
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
