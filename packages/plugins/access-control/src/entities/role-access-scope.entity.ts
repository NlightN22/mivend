import { DeepPartial } from '@vendure/common/lib/shared-types';
import { VendureEntity } from '@vendure/core';
import { Column, Entity, Index } from 'typeorm';

// Vendure's Role entity has no customFields (unlike Administrator/Customer), so role config
// lives in a dedicated table keyed by Role.code instead.
@Entity()
export class RoleAccessScope extends VendureEntity {
    constructor(input?: DeepPartial<RoleAccessScope>) {
        super(input);
    }

    @Index({ unique: true })
    @Column({ type: 'varchar' })
    roleCode!: string;

    @Column({ type: 'text' })
    accessScopeConfig!: string;
}
