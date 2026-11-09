import { AsyncLocalStorage } from 'node:async_hooks';
import { randomUUID } from 'node:crypto';

import type { ChangeActor } from './change-journal.types';

export interface ChangeJournalScope {
    source: string;
    requestId: string | null;
    sessionId(): string | null;
    resolveActor(): Promise<ChangeActor>;
}

export const SYSTEM_ACTOR: ChangeActor = {
    actorType: 'system',
    userId: null,
    administratorId: null,
};

// Writes outside any request or labelled task (job queue, bootstrap) are still recorded, as this source.
export const BACKGROUND_SOURCE = 'background';

const storage = new AsyncLocalStorage<ChangeJournalScope>();

export function runInChangeScope<T>(scope: ChangeJournalScope, work: () => T): T {
    return storage.run(scope, work);
}

export function runAsSystem<T>(source: string, work: () => T): T {
    return storage.run(
        {
            source,
            requestId: randomUUID(),
            sessionId: () => null,
            resolveActor: () => Promise.resolve(SYSTEM_ACTOR),
        },
        work,
    );
}

export function currentChangeScope(): ChangeJournalScope | undefined {
    return storage.getStore();
}
