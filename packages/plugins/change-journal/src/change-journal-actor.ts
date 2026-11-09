import type { ChangeActor } from './change-journal.types';
import { SYSTEM_ACTOR } from './change-journal-context';

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
