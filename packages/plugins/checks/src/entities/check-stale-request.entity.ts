import { DeepPartial } from '@vendure/common/lib/shared-types';
import { UuidEntity } from 'shared';
import { Column, Entity, Index } from 'typeorm';

// Durable, idempotent "mark the affected subjects stale" request, written atomically with the data change.
@Entity()
@Index(['kind', 'key'], { unique: true })
export class CheckStaleRequest extends UuidEntity {
    constructor(input?: DeepPartial<CheckStaleRequest>) {
        super(input);
    }

    @Column({ type: 'varchar' })
    kind!: string;

    @Column({ type: 'varchar' })
    key!: string;

    @Column({ type: 'int', default: 1 })
    version!: number;

    // Lease claim (docs/concurrency.md (i)): a worker owns the row until claimedUntil, fenced by claimToken.
    @Column({ type: 'timestamptz', nullable: true })
    claimedUntil!: Date | null;

    @Column({ type: 'uuid', nullable: true })
    claimToken!: string | null;
}
