import { DeepPartial } from '@vendure/common/lib/shared-types';
import { UuidEntity } from 'shared';
import { Column, Entity, Index } from 'typeorm';

// A browser or client an account has signed in from; only a hash of the device key is stored.
@Entity()
@Index(['userId', 'deviceHash'], { unique: true })
export class KnownDevice extends UuidEntity {
    constructor(input?: DeepPartial<KnownDevice>) {
        super(input);
    }

    @Column({ type: 'varchar' })
    userId!: string;

    @Column({ type: 'varchar' })
    deviceHash!: string;

    @Column({ type: 'varchar' })
    label!: string;

    @Column({ type: 'timestamptz' })
    lastSeenAt!: Date;
}
