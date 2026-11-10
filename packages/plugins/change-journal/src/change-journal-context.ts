import { AsyncLocalStorage } from 'node:async_hooks';
import { randomUUID } from 'node:crypto';

import type { ChangeActor } from './change-journal.types';
import type { SqlRunner } from './change-journal-write';

export interface ChangeJournalScope {
    source: string;
    // False for changes that arrive from the ERP integration: owner decision 2026-11-10, docs/change-journal.md.
    journaled: boolean;
    requestId: string | null;
    sessionId(): string | null;
    // Lookups run on the writing transaction's own connection, never a second pool connection.
    resolveActor(runner: SqlRunner): Promise<ChangeActor>;
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

export function runAsSystem<T>(source: string, work: () => T, journaled = true): T {
    return storage.run(
        {
            source,
            journaled,
            requestId: randomUUID(),
            sessionId: () => null,
            resolveActor: () => Promise.resolve(SYSTEM_ACTOR),
        },
        work,
    );
}

export function runAsIntegration<T>(source: string, work: () => T): T {
    return runAsSystem(source, work, false);
}

export function currentChangeScope(): ChangeJournalScope | undefined {
    return storage.getStore();
}
