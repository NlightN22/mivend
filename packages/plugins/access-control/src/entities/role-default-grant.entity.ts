import { DeepPartial } from '@vendure/common/lib/shared-types';
import { VendureEntity } from '@vendure/core';
import { Column, Entity, Index } from 'typeorm';

// Marks a release grant (a permission, or `scope:<resource>`) as already applied to a role,
// so a right an admin later removes is never granted again.
@Entity()
@Index(['roleCode', 'grantKey'], { unique: true })
export class RoleDefaultGrant extends VendureEntity {
    constructor(input?: DeepPartial<RoleDefaultGrant>) {
        super(input);
    }

    @Column({ type: 'varchar' })
    roleCode!: string;

    @Column({ type: 'varchar' })
    grantKey!: string;
}
