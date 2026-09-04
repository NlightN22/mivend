import { DeepPartial } from '@vendure/common/lib/shared-types';
import { VendureEntity } from '@vendure/core';
import { Column, Entity, Index } from 'typeorm';

// Org-structure master data — ERP is the source of truth (AGENTS.md "ERP is master for business
// data"), populated via erp-integration's WarehouseStreamHandler. branchId is a raw column (the
// owning Branch's local id, resolved via BranchService by erpId at upsert time) rather than a
// TypeORM relation — mirrors Branch's own preference for explicit service-layer resolution over
// deep ORM relation graphs (see AGENTS.md's Warehouse plan, "a raw @Column() branchId!: string
// resolved via BranchService lookup is acceptable").
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

    @Column({ type: 'varchar' })
    branchId!: string;

    @Column({ type: 'boolean', default: true })
    isActive!: boolean;
}
