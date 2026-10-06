import { DeepPartial } from '@vendure/common/lib/shared-types';
import { VendureEntity } from '@vendure/core';
import { Column, Entity, Index } from 'typeorm';

// Reference cache of the `bank` stream (BankChanged).
@Entity()
export class BankRecord extends VendureEntity {
    constructor(input?: DeepPartial<BankRecord>) {
        super(input);
    }

    @Index({ unique: true })
    @Column({ type: 'varchar' })
    entityId!: string;

    @Column({ type: 'varchar' })
    name!: string;

    @Column({ type: 'varchar' })
    bik!: string;

    @Column({ type: 'varchar', nullable: true })
    correspondentAccount!: string | null;

    @Column({ type: 'boolean', default: false })
    isActive!: boolean;

    @Column({ type: 'boolean', default: false })
    isDeleted!: boolean;
}
