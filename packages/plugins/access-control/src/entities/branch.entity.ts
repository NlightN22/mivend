import { DeepPartial } from '@vendure/common/lib/shared-types';
import { VendureEntity } from '@vendure/core';
import { Column, Entity, Index } from 'typeorm';

// Org-structure master data — ERP is the source of truth (see AGENTS.md "ERP is master for
// business data"), populated via erp-import's BranchRecord, never edited manually. Flat list, no
// parent/child hierarchy (unlike Department).
@Entity()
export class Branch extends VendureEntity {
    constructor(input?: DeepPartial<Branch>) {
        super(input);
    }

    @Index({ unique: true })
    @Column({ type: 'varchar' })
    erpId!: string;

    @Column({ type: 'varchar' })
    name!: string;
}
