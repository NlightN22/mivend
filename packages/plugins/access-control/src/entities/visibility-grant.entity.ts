import { DeepPartial } from '@vendure/common/lib/shared-types';
import { UuidEntity } from 'shared';
import { Column, Entity, Index } from 'typeorm';

// Closed technical discriminator of what a grant points at; new kinds are added here with their resolver.
export type VisibilitySubjectKind = 'manager';

// Rows are never deleted: a revoke sets revokedAt, an expired grant just stops matching (#123).
@Entity()
@Index(['granteeAdministratorId', 'subjectKind'])
export class VisibilityGrant extends UuidEntity {
    constructor(input?: DeepPartial<VisibilityGrant>) {
        super(input);
    }

    @Column({ type: 'varchar' })
    granteeAdministratorId!: string;

    @Column({ type: 'varchar' })
    subjectKind!: VisibilitySubjectKind;

    // For the manager kind: the manager's Administrator id.
    @Column({ type: 'varchar' })
    subjectRef!: string;

    @Column({ type: 'timestamp', nullable: true })
    validFrom!: Date | null;

    @Column({ type: 'timestamp', nullable: true })
    validTo!: Date | null;

    @Column({ type: 'text' })
    reason!: string;

    @Column({ type: 'varchar', nullable: true })
    grantedByAdministratorId!: string | null;

    @Column({ type: 'timestamp', nullable: true })
    revokedAt!: Date | null;

    @Column({ type: 'varchar', nullable: true })
    revokedByAdministratorId!: string | null;
}
