import { DeepPartial } from '@vendure/common/lib/shared-types';
import { VendureEntity } from '@vendure/core';
import { Column, Entity } from 'typeorm';

// Issue #119: a 1C "user" (UserChanged) with no linked Administrator yet — a *candidate*, not an
// account. Surfaced to a human (sysadmin/leadership) to decide whether it becomes a real
// Administrator login (see AdministratorProvisioningService.createFromPending). Upserted by
// UserEnrichmentService whenever linkAndEnrich's email-match fails to find an existing
// Administrator, and deleted the moment a link is established, by either path — auto email-match
// or manual creation.
@Entity()
export class PendingErpUser extends VendureEntity {
    constructor(input?: DeepPartial<PendingErpUser>) {
        super(input);
    }

    @Column({ type: 'varchar', unique: true })
    erpId!: string;

    @Column({ type: 'varchar', nullable: true })
    fullName!: string | null;

    @Column({ type: 'varchar', nullable: true })
    email!: string | null;

    @Column({ type: 'varchar', nullable: true })
    departmentId!: string | null;

    @Column({ type: 'timestamp' })
    firstSeenAt!: Date;

    @Column({ type: 'timestamp' })
    lastSeenAt!: Date;
}
