import { DeepPartial } from '@vendure/common/lib/shared-types';
import { VendureEntity } from '@vendure/core';
import { Column, Entity, Index } from 'typeorm';

// Org-structure master data — ERP is the source of truth (see the external-integration-rules skill's "ERP is master for
// business data"), populated via erp-import's DepartmentRecord, never edited manually.
@Entity()
export class Department extends VendureEntity {
    constructor(input?: DeepPartial<Department>) {
        super(input);
    }

    @Index({ unique: true })
    @Column({ type: 'varchar' })
    erpId!: string;

    @Column({ type: 'varchar' })
    name!: string;

    @Column({ type: 'varchar', nullable: true })
    parentErpId!: string | null;

    // mivend.issue.88 follow-up (2026-09-15): DepartmentStreamHandler never read isActive/
    // isDeleted despite the Kafka contract carrying both — a department deactivated/deleted in
    // ERP had no way to reflect that locally at all. erp-import's own DepartmentRecordDto never
    // carried this either, so this defaults true for any row created via that path.
    @Column({ type: 'boolean', default: true })
    isActive!: boolean;
}
