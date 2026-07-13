import { DeepPartial } from '@vendure/common/lib/shared-types';
import { VendureEntity } from '@vendure/core';
import { Column, Entity, Index } from 'typeorm';

export type EntityVersionAction = 'create' | 'update' | 'deactivate' | 'reactivate';

// One row per write to a versioned entity, appended by the owning plugin's service via
// VersioningService.recordChange — never by a TypeORM subscriber (no subscriber exists
// anywhere in this codebase; every "who did what" record is written explicitly in the
// service layer, e.g. ApprovalStep in plugin-approval-workflow). entityName/entityId is a
// generic (not foreign-keyed) pointer so this table stays reusable across plugins without a
// dependency from plugin-versioning back onto them. Timestamp is VendureEntity's own
// createdAt — no separate occurredAt column.
@Entity()
export class EntityVersion extends VendureEntity {
    constructor(input?: DeepPartial<EntityVersion>) {
        super(input);
    }

    @Index()
    @Column({ type: 'varchar' })
    entityName!: string;

    @Index()
    @Column({ type: 'varchar' })
    entityId!: string;

    @Column({ type: 'varchar' })
    action!: EntityVersionAction;

    // JSON: { [field: string]: { from: unknown; to: unknown } } — null when the action carries
    // no field-level diff (e.g. a bare reactivate that only flips one already-named-by-action field).
    @Column({ type: 'text', nullable: true })
    changedFields!: string | null;

    // Null for system-initiated changes (e.g. a future scheduled job) — never a raw user id,
    // always an Administrator id, resolved from ctx.activeUserId at write time.
    @Column({ type: 'varchar', nullable: true })
    administratorId!: string | null;

    @Column({ type: 'varchar', nullable: true })
    comment!: string | null;
}
