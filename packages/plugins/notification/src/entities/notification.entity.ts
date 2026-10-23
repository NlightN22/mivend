import { DeepPartial } from '@vendure/common/lib/shared-types';
import { VendureEntity } from '@vendure/core';
import { Column, Entity, Index } from 'typeorm';

export type NotificationRecipientType = 'administrator' | 'administrator-broadcast' | 'customer';
export type NotificationKind = 'info' | 'success' | 'warning' | 'error';
export type NotificationStatus = 'unread' | 'read' | 'resolved';

// recipientType/recipientId is an identity, not a foreign key; the target table depends on type.
// Broadcast rows use recipientId = null and are never fanned out per admin (breaks upsert dedupe).
@Entity()
@Index(['sourceType', 'sourceId'])
export class Notification extends VendureEntity {
    constructor(input?: DeepPartial<Notification>) {
        super(input);
    }

    @Column({ type: 'varchar' })
    recipientType!: NotificationRecipientType;

    // Nullable only for recipientType === 'administrator-broadcast' — every other recipientType
    // must set a real recipientId.
    @Column({ type: 'varchar', nullable: true })
    recipientId!: string | null;

    @Column({ type: 'varchar' })
    kind!: NotificationKind;

    @Column({ type: 'varchar' })
    sourceType!: string;

    @Column({ type: 'varchar', nullable: true })
    sourceId!: string | null;

    // A broadcast with an order is shown only to administrators who see that order (#263).
    @Column({ type: 'varchar', nullable: true })
    orderId!: string | null;

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
