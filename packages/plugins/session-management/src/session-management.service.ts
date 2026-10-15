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

    // Intentionally ends the caller's own session too, to match the frontend's
    // "Sign out everywhere" button behaviour.
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

    // Not a security control: runs outside any request, so no ctx is built.
    // Targets base Session so anonymous cart sessions are swept too (STI shares one table).
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
