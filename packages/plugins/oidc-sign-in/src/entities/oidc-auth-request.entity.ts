import { DeepPartial } from '@vendure/common/lib/shared-types';
import { UuidEntity } from 'shared';
import { Column, Entity, Index } from 'typeorm';

import type { RequestStatus } from '../oidc.types';

// One sign-in attempt: the state is stored only as a SHA-256 hash and every step claims the row atomically.
@Entity()
export class OidcAuthRequest extends UuidEntity {
    constructor(input?: DeepPartial<OidcAuthRequest>) {
        super(input);
    }

    @Index({ unique: true })
    @Column({ type: 'varchar' })
    stateHash!: string;

    @Column({ type: 'varchar' })
    nonce!: string;

    @Column({ type: 'varchar' })
    codeVerifier!: string;

    @Column({ type: 'varchar' })
    status!: RequestStatus;

    @Column({ type: 'varchar', nullable: true })
    userId!: string | null;

    @Column({ type: 'timestamptz' })
    expiresAt!: Date;
}
