import { DeepPartial } from '@vendure/common/lib/shared-types';
import { VendureEntity } from '@vendure/core';
import { Column, Entity, Index } from 'typeorm';

// Business configuration, 1:1 with Branch — deliberately separate from AccessScopeService's
// RoleAccessScope (who-sees-what for RBAC); this is what a branch's client/manager portals
// default and restrict to (issue #66). branchId is a raw column (this plugin's established
// pattern for Branch/Warehouse relations — see Warehouse.branchId) rather than a TypeORM
// relation. visible*Ids are JSON arrays of ids (manager-portal-only restriction, unset = no
// restriction); the client portal only ever reads default*Id.
@Entity()
export class BranchSettings extends VendureEntity {
    constructor(input?: DeepPartial<BranchSettings>) {
        super(input);
    }

    @Index({ unique: true })
    @Column({ type: 'varchar' })
    branchId!: string;

    @Column({ type: 'varchar' })
    defaultPriceTypeId!: string;

    @Column({ type: 'simple-json', nullable: true })
    visiblePriceTypeIds?: string[] | null;

    @Column({ type: 'varchar' })
    defaultWarehouseId!: string;

    @Column({ type: 'simple-json', nullable: true })
    visibleWarehouseIds?: string[] | null;
}
