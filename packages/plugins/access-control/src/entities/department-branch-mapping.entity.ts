import { DeepPartial } from '@vendure/common/lib/shared-types';
import { VendureEntity } from '@vendure/core';
import { Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';

import { Branch } from './branch.entity';

// Staff-maintained: a mapping applies to the department and is inherited by all its descendants.
@Entity()
export class DepartmentBranchMapping extends VendureEntity {
    constructor(input?: DeepPartial<DepartmentBranchMapping>) {
        super(input);
    }

    @Index({ unique: true })
    @Column({ type: 'varchar' })
    departmentErpId!: string;

    @Index()
    @Column({ type: 'int' })
    branchId!: number;

    @ManyToOne(() => Branch, { nullable: false, onDelete: 'RESTRICT' })
    @JoinColumn({ name: 'branchId' })
    branch?: Branch;
}
