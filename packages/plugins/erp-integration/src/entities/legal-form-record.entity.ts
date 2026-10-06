import { DeepPartial } from '@vendure/common/lib/shared-types';
import { VendureEntity } from '@vendure/core';
import { Column, Entity, Index } from 'typeorm';

// Reference cache of the `legal-form` stream (LegalFormChanged).
@Entity()
export class LegalFormRecord extends VendureEntity {
    constructor(input?: DeepPartial<LegalFormRecord>) {
        super(input);
    }

    @Index({ unique: true })
    @Column({ type: 'varchar' })
    entityId!: string;

    @Column({ type: 'varchar' })
    name!: string;

    @Column({ type: 'varchar' })
    code!: string;

    @Column({ type: 'varchar', nullable: true })
    fullName!: string | null;

    @Column({ type: 'boolean', default: false })
    isActive!: boolean;

    @Column({ type: 'boolean', default: false })
    isDeleted!: boolean;
}
