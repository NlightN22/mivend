import { DeepPartial } from '@vendure/common/lib/shared-types';
import { UuidEntity } from 'shared';
import { Column, Entity, Index } from 'typeorm';

import type { FactorStatus } from '../two-factor.types';

// Written with raw SQL by TwoFactorFactorStore; the entity declares the schema only.
@Entity()
@Index(['userId'], { unique: true, where: `"status" = 'active'` })
@Index(['userId'], { unique: true, where: `"status" = 'pending'` })
export class TwoFactorFactor extends UuidEntity {
    constructor(input?: DeepPartial<TwoFactorFactor>) {
        super(input);
    }

    @Column({ type: 'varchar' })
    userId!: string;

    @Column({ type: 'varchar', default: 'totp' })
    method!: string;

    @Column({ type: 'varchar' })
    status!: FactorStatus;

    @Column({ type: 'text' })
    secretEncrypted!: string;

    @Column({ type: 'bigint', nullable: true })
    lastUsedStep!: string | null;

    @Column({ type: 'timestamp', nullable: true })
    pendingExpiresAt!: Date | null;

    @Column({ type: 'timestamp', nullable: true })
    activatedAt!: Date | null;
}
