import { DeepPartial } from '@vendure/common/lib/shared-types';
import { VendureEntity } from '@vendure/core';
import { Column, Entity, Index } from 'typeorm';

// mivend's own org-structure grouping — deliberately independent of whatever org unit the ERP's data
// represents (unlike Department, which is genuinely ERP master data). Populated either via
// erp-import's BranchRecord (erpId = a real ERP GUID) or manually via BranchService.createManual
// (erpId = a synthetic "mivend-manual:<uuid>", never a real ERP GUID) — see that method's own
// comment for why staff need the manual path on any contour where the REST sync never runs.
// Flat list, no parent/child hierarchy (unlike Department).
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
