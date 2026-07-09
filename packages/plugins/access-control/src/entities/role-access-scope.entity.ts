import { DeepPartial } from '@vendure/common/lib/shared-types';
import { VendureEntity } from '@vendure/core';
import { Column, Entity, Index } from 'typeorm';

// Vendure's Role entity does not support customFields (unlike Administrator/Customer) —
// role -> max-scope-per-resource config lives in this dedicated table instead, keyed by
// Role.code. See docs/access-control.md, layer 3.
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
