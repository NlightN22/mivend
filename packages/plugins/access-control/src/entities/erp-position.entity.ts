import { DeepPartial } from '@vendure/common/lib/shared-types';
import { VendureEntity } from '@vendure/core';
import { Column, Entity, Index } from 'typeorm';

// Job-position master data — ERP is the source of truth, populated only by the `position` stream.
@Entity()
export class ErpPosition extends VendureEntity {
    constructor(input?: DeepPartial<ErpPosition>) {
        super(input);
    }

    @Index({ unique: true })
    @Column({ type: 'varchar' })
    erpId!: string;

    @Column({ type: 'varchar' })
    name!: string;

    @Column({ type: 'varchar', nullable: true })
    parentErpId!: string | null;

    @Column({ type: 'boolean', default: true })
    isActive!: boolean;
}
