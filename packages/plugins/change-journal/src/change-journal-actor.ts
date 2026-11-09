import type { ChangeActor } from './change-journal.types';
import { SYSTEM_ACTOR } from './change-journal-context';
import type { SqlRunner } from './change-journal-write';

export interface ActorContext {
    apiType: string;
    activeUserId?: string | number | null;
}

export interface ActorLookups {
    actingAdministratorId(): Promise<string | null>;
    administratorIdForUser(userId: string): Promise<string | null>;
}

export async function resolveRequestActor(
    ctx: ActorContext,
    lookups: ActorLookups,
): Promise<ChangeActor> {
    if (ctx.activeUserId == null) return SYSTEM_ACTOR;
    const userId = String(ctx.activeUserId);
    if (ctx.apiType === 'shop') {
        const acting = await lookups.actingAdministratorId();
        return acting
            ? { actorType: 'acting', userId, administratorId: acting }
            : { actorType: 'customer', userId, administratorId: null };
    }
    const administratorId = await lookups.administratorIdForUser(userId);
    return administratorId
        ? { actorType: 'administrator', userId, administratorId }
        : { actorType: 'customer', userId, administratorId: null };
}

async function firstId(runner: SqlRunner, sql: string, param: string): Promise<string | null> {
    const rows = (await runner.query(sql, [param])) as Array<{ id: string | number | null }>;
    const id = rows[0]?.id;
    return id === undefined || id === null ? null : String(id);
}

// Same session columns as ActingContextService, read on the caller's runner.
export function sqlActorLookups(runner: SqlRunner, sessionToken: string | undefined): ActorLookups {
    return {
        actingAdministratorId: () =>
            sessionToken
                ? firstId(
                      runner,
                      `SELECT "customFieldsActingadministratorid" AS id FROM session
                       WHERE token = $1 AND invalidated = false`,
                      sessionToken,
                  )
                : Promise.resolve(null),
        administratorIdForUser: userId =>
            firstId(
                runner,
                'SELECT id FROM administrator WHERE "userId" = $1 AND "deletedAt" IS NULL',
                userId,
            ),
    };
}
