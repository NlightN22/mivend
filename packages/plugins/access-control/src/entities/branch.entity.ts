import { DeepPartial } from '@vendure/common/lib/shared-types';
import { VendureEntity } from '@vendure/core';
import { Column, Entity, Index } from 'typeorm';

// Independent of ERP org units (unlike Department): may be created manually when no REST sync runs.
// Manual rows get erpId 'mivend-manual:<uuid>', never a real ERP GUID. Flat, no hierarchy.
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
