import { DeepPartial } from '@vendure/common/lib/shared-types';
import { UuidEntity } from 'shared';
import { Column, Entity, Index } from 'typeorm';

// Append-only: giving, declining and withdrawing a consent are each a new row.
@Entity()
@Index(['customerId', 'kind'])
export class LegalAcceptance extends UuidEntity {
    constructor(input?: DeepPartial<LegalAcceptance>) {
        super(input);
    }

    @Column({ type: 'int' })
    customerId!: number;

    @Column({ type: 'varchar' })
    kind!: string;

    @Column({ type: 'int' })
    version!: number;

    @Column({ type: 'boolean' })
    accepted!: boolean;

    @Column({ type: 'varchar' })
    locale!: string;

    @Column({ type: 'varchar' })
    portal!: string;

    @Column({ type: 'varchar' })
    ip!: string;

    @Column({ type: 'varchar' })
    userAgent!: string;
}
