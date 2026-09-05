import { DeepPartial } from '@vendure/common/lib/shared-types';
import { VendureEntity } from '@vendure/core';
import { Column, Entity, Index } from 'typeorm';

// Org-structure master data — ERP is the source of truth (the external-integration-rules skill's "ERP is master for
// business data" rule), populated via erp-integration's WarehouseStreamHandler. branchId is a raw column (the
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

    // Human-curated "does this warehouse hold real sellable stock for its branch's ATP
    // aggregation" flag (issue #66) — deliberately separate from isActive, which is only 1C's
    // own suggested default and has been observed to be an unreliable signal (a branch's
    // largest-stock warehouse flagged isActive=false, several near-empty ones flagged true).
    // Defaults to true (not to isActive's value) so a fresh warehouse participates in ATP until
    // staff explicitly excludes it — matching this project's "never silently drop real
    // inventory" principle; junk leaves (БРАК, charging bays, etc.) hold no stock today anyway,
    // so an admin excluding them later costs nothing.
    @Column({ type: 'boolean', default: true })
    includedInBranchAtp!: boolean;
}
