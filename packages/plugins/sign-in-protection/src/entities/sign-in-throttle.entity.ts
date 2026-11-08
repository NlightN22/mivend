import { DeepPartial } from '@vendure/common/lib/shared-types';
import { UuidEntity } from 'shared';
import { Column, Entity, Index } from 'typeorm';

// One failure counter per hashed key; written only through atomic upserts on the database clock.
@Entity()
export class SignInThrottle extends UuidEntity {
    constructor(input?: DeepPartial<SignInThrottle>) {
        super(input);
    }

    @Index({ unique: true })
    @Column({ type: 'varchar' })
    key!: string;

    @Column({ type: 'int', default: 0 })
    failures!: number;

    @Column({ type: 'timestamptz' })
    lastFailureAt!: Date;
}
