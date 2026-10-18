import { DeepPartial, ID } from '@vendure/common/lib/shared-types';
import { VendureEntity } from '@vendure/core';
import { Column, Entity, Index } from 'typeorm';

export type ErpUserStatus = 'unlinked' | 'linked';

// Never deleted on link: this row is the only way consumers distinguish "no info yet, retry"
// from "known, will never link, do not retry".
@Entity()
export class ErpUser extends VendureEntity {
    constructor(input?: DeepPartial<ErpUser>) {
        super(input);
    }

    @Index({ unique: true })
    @Column({ type: 'varchar' })
    erpId!: string;

    @Column({ type: 'varchar', nullable: true })
    fullName!: string | null;

    @Column({ type: 'varchar', nullable: true })
    email!: string | null;

    @Column({ type: 'varchar', nullable: true })
    departmentId!: string | null;

    // Soft reference to ErpPosition.erpId: the position may arrive after the user.
    @Column({ type: 'varchar', nullable: true })
    positionErpId!: string | null;

    @Column({ type: 'timestamp' })
    firstSeenAt!: Date;

    @Column({ type: 'timestamp' })
    lastSeenAt!: Date;

    @Column({ type: 'varchar', default: 'unlinked' })
    status!: ErpUserStatus;

    // Set only by ErpUserService.markLinked, in the same transaction as the Administrator that
    // now owns this erpId — never set independently of `status` flipping to 'linked'.
    @Column({ type: 'varchar', nullable: true })
    administratorId!: ID | null;

    // null = never told either way. Only hides the "Create administrator" action for inactive or
    // deleted ERP users while unlinked; must not drive manager resolution (status/administratorId only).
    @Column({ type: 'boolean', nullable: true })
    active!: boolean | null;
}
