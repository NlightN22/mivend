import { DeepPartial } from '@vendure/common/lib/shared-types';
import { VendureEntity } from '@vendure/core';
import { Column, Entity, Index } from 'typeorm';

// Reference cache of the `bank-account` stream (BankAccountChanged); bankId and ownerId are soft links.
@Entity()
export class BankAccountRecord extends VendureEntity {
    constructor(input?: DeepPartial<BankAccountRecord>) {
        super(input);
    }

    @Index({ unique: true })
    @Column({ type: 'varchar' })
    entityId!: string;

    @Column({ type: 'varchar' })
    accountNumber!: string;

    @Column({ type: 'varchar' })
    bankId!: string;

    @Index()
    @Column({ type: 'varchar' })
    ownerId!: string;

    @Column({ type: 'varchar' })
    ownerType!: string;

    @Column({ type: 'boolean', default: false })
    isActive!: boolean;

    @Column({ type: 'boolean', default: false })
    isDeleted!: boolean;
}
