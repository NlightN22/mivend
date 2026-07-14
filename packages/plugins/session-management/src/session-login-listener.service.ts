import { Injectable } from '@nestjs/common';
import { AuthenticatedSession, RequestContext, TransactionalConnection, User } from '@vendure/core';

@Injectable()
export class SessionLoginListenerService {
    constructor(private connection: TransactionalConnection) {}

    // Called from LoginEvent — the AuthenticatedSession row was already created
    // synchronously just before the event publishes, so the most-recently-created
    // session for this user is the one we just need to tag with its user agent.
    async tagLatestSessionWithUserAgent(ctx: RequestContext, user: User): Promise<void> {
        const userAgent = ctx.req?.headers['user-agent'];
        if (!userAgent) {
            return;
        }
        const repo = this.connection.getRepository(ctx, AuthenticatedSession);
        const latest = await repo.findOne({
            where: { user: { id: user.id } },
            order: { createdAt: 'DESC' },
        });
        if (!latest) {
            return;
        }
        await repo.update(
            { id: latest.id },
            { customFields: { ...latest.customFields, userAgent: String(userAgent) } },
        );
    }
}
