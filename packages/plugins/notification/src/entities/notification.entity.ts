import { DeepPartial } from '@vendure/common/lib/shared-types';
import { VendureEntity } from '@vendure/core';
import { Column, Entity, Index } from 'typeorm';

export type NotificationRecipientType = 'administrator' | 'customer';
export type NotificationKind = 'info' | 'success' | 'warning' | 'error';
export type NotificationStatus = 'unread' | 'read' | 'resolved';

// One row per notification, addressed to either an Administrator or a Customer (never both) —
// the recipientType/recipientId pair is the identity, not a foreign key, since either side can
// point at a different table depending on recipientType. Upserted by (sourceType, sourceId) while
// still open (see NotificationService.create) so a repeated event about the same source updates
// the existing row instead of piling up duplicates.
@Entity()
@Index(['sourceType', 'sourceId'])
export class Notification extends VendureEntity {
    constructor(input?: DeepPartial<Notification>) {
        super(input);
    }

    @Column({ type: 'varchar' })
    recipientType!: NotificationRecipientType;

    @Column({ type: 'varchar' })
    recipientId!: string;

    @Column({ type: 'varchar' })
    kind!: NotificationKind;

    @Column({ type: 'varchar' })
    sourceType!: string;

    @Column({ type: 'varchar', nullable: true })
    sourceId!: string | null;

    @Column({ type: 'varchar' })
    title!: string;

    @Column({ type: 'text' })
    message!: string;

    @Column({ type: 'varchar', default: 'unread' })
    status!: NotificationStatus;

    @Column({ type: 'timestamp', nullable: true })
    readAt!: Date | null;

    @Column({ type: 'timestamp', nullable: true })
    resolvedAt!: Date | null;

    @Column({ type: 'varchar', nullable: true })
    resolution!: string | null;
}
