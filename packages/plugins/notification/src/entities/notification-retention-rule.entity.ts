import { DeepPartial } from '@vendure/common/lib/shared-types';
import { VendureEntity } from '@vendure/core';
import { Column, Entity, Index } from 'typeorm';

// How long notifications of one sourceType are kept; null days inherit the default row ('*').
@Entity('notification_retention_rule')
export class NotificationRetentionRule extends VendureEntity {
    constructor(input?: DeepPartial<NotificationRetentionRule>) {
        super(input);
    }

    @Index({ unique: true })
    @Column({ type: 'uuid' })
    uuid!: string;

    @Index({ unique: true })
    @Column({ type: 'varchar' })
    sourceType!: string;

    // Read and resolved notifications.
    @Column({ type: 'int', nullable: true })
    readDays!: number | null;

    @Column({ type: 'int', nullable: true })
    unreadDays!: number | null;
}
