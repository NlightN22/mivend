import { DeepPartial } from '@vendure/common/lib/shared-types';
import { UuidEntity } from 'shared';
import { Column, Entity, Index } from 'typeorm';

import type { TokenPurpose, TwoFactorApi } from '../two-factor.types';

// Sign-in challenges and recovery links; only the SHA-256 of the token is stored.
@Entity()
export class TwoFactorToken extends UuidEntity {
    constructor(input?: DeepPartial<TwoFactorToken>) {
        super(input);
    }

    @Index({ unique: true })
    @Column({ type: 'varchar' })
    tokenHash!: string;

    @Column({ type: 'varchar' })
    purpose!: TokenPurpose;

    @Column({ type: 'varchar' })
    userId!: string;

    @Column({ type: 'varchar', nullable: true })
    stage!: 'VERIFY' | 'ENROL' | null;

    @Column({ type: 'varchar', nullable: true })
    apiType!: TwoFactorApi | null;

    @Column({ type: 'timestamptz' })
    expiresAt!: Date;

    @Column({ type: 'timestamptz', nullable: true })
    usedAt!: Date | null;

    @Column({ type: 'int', default: 0 })
    attempts!: number;
}
