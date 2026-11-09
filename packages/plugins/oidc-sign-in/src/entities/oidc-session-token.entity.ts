import { DeepPartial } from '@vendure/common/lib/shared-types';
import { UuidEntity } from 'shared';
import { Column, Entity, Index } from 'typeorm';

// The newest provider ID token of an administrator; it is only the hint for ending the provider session.
@Entity()
export class OidcSessionToken extends UuidEntity {
    constructor(input?: DeepPartial<OidcSessionToken>) {
        super(input);
    }

    @Index({ unique: true })
    @Column({ type: 'int' })
    userId!: number;

    @Column({ type: 'text' })
    idToken!: string;
}
