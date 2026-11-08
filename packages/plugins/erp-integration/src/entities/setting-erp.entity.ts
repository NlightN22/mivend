import { DeepPartial } from '@vendure/common/lib/shared-types';
import { VendureEntity } from '@vendure/core';
import { Column, Entity, Index } from 'typeorm';

// Last state of the `setting` stream: a base-wide ERP flag by code. Nothing in mivend reads it yet.
@Entity()
export class SettingErp extends VendureEntity {
    constructor(input?: DeepPartial<SettingErp>) {
        super(input);
    }

    @Index({ unique: true })
    @Column({ type: 'varchar' })
    erpId!: string;

    @Column({ type: 'varchar', nullable: true })
    code!: string | null;

    @Column({ type: 'boolean', nullable: true })
    boolValue!: boolean | null;

    @Column({ type: 'boolean', default: false })
    isDeleted!: boolean;
}
