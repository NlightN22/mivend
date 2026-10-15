import { DeepPartial } from '@vendure/common/lib/shared-types';
import { VendureEntity } from '@vendure/core';
import { Column, Entity, Index } from 'typeorm';

// ERP is the source of truth for this org data; it is populated via WarehouseStreamHandler.
// branchId is a raw column resolved via BranchService by erpId, not an ORM relation.
@Entity()
export class Warehouse extends VendureEntity {
    constructor(input?: DeepPartial<Warehouse>) {
        super(input);
    }

    @Index({ unique: true })
    @Column({ type: 'varchar' })
    erpId!: string;

    @Column({ type: 'varchar' })
    name!: string;

    // Nullable: a warehouse is saved even when its ERP-reported branch does not resolve.
    // Unassigned warehouses are assigned manually by staff rather than dropped.
    @Column({ type: 'varchar', nullable: true })
    branchId!: string | null;

    @Column({ type: 'boolean', default: true })
    isActive!: boolean;

    // Human-curated flag, separate from the ERP's isActive, which is an unreliable signal.
    // Defaults to true so new warehouses count toward ATP until staff explicitly exclude them.
    @Column({ type: 'boolean', default: true })
    includedInBranchAtp!: boolean;
}
