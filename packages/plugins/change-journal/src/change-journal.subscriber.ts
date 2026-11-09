import {
    EntitySubscriberInterface,
    EventSubscriber,
    InsertEvent,
    ObjectLiteral,
    RecoverEvent,
    RemoveEvent,
    SoftRemoveEvent,
    UpdateEvent,
} from 'typeorm';
import type { EntityManager, EntityMetadata } from 'typeorm';

import type { ChangeAction, FieldChanges } from './change-journal.types';
import { BACKGROUND_SOURCE, currentChangeScope, SYSTEM_ACTOR } from './change-journal-context';
import { snapshotChanges, updateChanges } from './change-journal-diff';
import { isJournaled } from './change-journal-scope';
import { insertJournalEntry } from './change-journal-write';

function idOf(metadata: EntityMetadata, entity: ObjectLiteral | undefined): string | null {
    if (!entity) return null;
    const ids = metadata.primaryColumns.map(c => c.getEntityValue(entity) as unknown);
    if (ids.length === 0 || ids.some(v => v === undefined || v === null)) return null;
    return ids.map(String).join(':');
}

function idOfRaw(raw: unknown): string | null {
    if (raw === undefined || raw === null) return null;
    if (typeof raw === 'object') return Object.values(raw).map(String).join(':');
    return String(raw);
}

function uuidOf(metadata: EntityMetadata, entity: ObjectLiteral): string | null {
    const value: unknown = metadata.findColumnWithPropertyName('uuid')?.getEntityValue(entity);
    return typeof value === 'string' ? value : null;
}

// Runs on event.manager, so the entry commits or rolls back with the change itself.
async function record(
    manager: EntityManager,
    metadata: EntityMetadata,
    action: ChangeAction,
    entity: ObjectLiteral | undefined,
    changes: () => FieldChanges,
    fallbackId?: unknown,
): Promise<void> {
    if (!isJournaled(metadata.name)) return;
    const entityId = idOf(metadata, entity) ?? idOfRaw(fallbackId);
    // Query-builder bulk updates/deletes carry no row identity; documented as a known gap.
    if (!entityId) return;
    const diff = changes();
    if (action === 'update' && Object.keys(diff).length === 0) return;
    const scope = currentChangeScope();
    const actor = scope ? await scope.resolveActor(manager) : SYSTEM_ACTOR;
    await insertJournalEntry(manager, {
        ...actor,
        source: scope?.source ?? BACKGROUND_SOURCE,
        requestId: scope?.requestId ?? null,
        sessionId: scope?.sessionId() ?? null,
        entityType: metadata.name,
        entityId,
        entityUuid: entity ? uuidOf(metadata, entity) : null,
        action,
        changes: diff,
        occurredAt: new Date(),
    });
}

@EventSubscriber()
export class ChangeJournalSubscriber implements EntitySubscriberInterface {
    afterInsert(event: InsertEvent<ObjectLiteral>): Promise<void> {
        const { metadata, entity } = event;
        return record(event.manager, metadata, 'insert', entity, () =>
            snapshotChanges(metadata.columns, entity, 'after'),
        );
    }

    afterUpdate(event: UpdateEvent<ObjectLiteral>): Promise<void> {
        const { metadata, databaseEntity } = event;
        const entity = event.entity as ObjectLiteral | undefined;
        return record(event.manager, metadata, 'update', entity, () =>
            updateChanges(
                event.updatedColumns,
                event.updatedRelations,
                entity ?? {},
                databaseEntity,
            ),
        );
    }

    afterSoftRemove(event: SoftRemoveEvent<ObjectLiteral>): Promise<void> {
        const entity = event.databaseEntity ?? event.entity;
        return record(
            event.manager,
            event.metadata,
            'soft-remove',
            entity,
            () => ({}),
            event.entityId,
        );
    }

    afterRecover(event: RecoverEvent<ObjectLiteral>): Promise<void> {
        const entity = event.databaseEntity ?? event.entity;
        return record(event.manager, event.metadata, 'recover', entity, () => ({}), event.entityId);
    }

    afterRemove(event: RemoveEvent<ObjectLiteral>): Promise<void> {
        const { metadata } = event;
        const entity = event.databaseEntity ?? event.entity;
        return record(
            event.manager,
            metadata,
            'remove',
            entity,
            () => (entity ? snapshotChanges(metadata.columns, entity, 'before') : {}),
            event.entityId,
        );
    }
}
