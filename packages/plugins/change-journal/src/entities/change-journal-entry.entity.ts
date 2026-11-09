import { DeepPartial } from '@vendure/common/lib/shared-types';
import { UuidEntity } from 'shared';
import { Column, Entity, Index } from 'typeorm';

import type { ChangeAction, ChangeActorType, FieldChanges } from '../change-journal.types';

// Written by ChangeJournalSubscriber with raw SQL in the changing transaction; this class only declares the schema.
@Entity()
@Index('IDX_change_journal_entry_entity', ['entityType', 'entityId', 'occurredAt'])
export class ChangeJournalEntry extends UuidEntity {
    constructor(input?: DeepPartial<ChangeJournalEntry>) {
        super(input);
    }

    @Index('IDX_change_journal_entry_occurred_at')
    @Column({ type: 'timestamp' })
    occurredAt!: Date;

    @Column({ type: 'varchar' })
    actorType!: ChangeActorType;

    @Column({ type: 'varchar', nullable: true })
    userId!: string | null;

    @Column({ type: 'varchar', nullable: true })
    administratorId!: string | null;

    @Column({ type: 'varchar' })
    source!: string;

    @Column({ type: 'varchar', nullable: true })
    requestId!: string | null;

    @Column({ type: 'varchar', nullable: true })
    sessionId!: string | null;

    @Column({ type: 'varchar' })
    entityType!: string;

    @Column({ type: 'varchar' })
    entityId!: string;

    @Column({ type: 'varchar', nullable: true })
    entityUuid!: string | null;

    @Column({ type: 'varchar' })
    action!: ChangeAction;

    @Column({ type: 'jsonb' })
    changes!: FieldChanges;
}
