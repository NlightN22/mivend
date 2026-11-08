import { DeepPartial } from '@vendure/common/lib/shared-types';
import { VendureEntity } from '@vendure/core';
import { Column, Entity, Index } from 'typeorm';

// Last state of the `product-group` stream; parentId is a soft link (no FK).
@Entity()
export class ProductGroupErp extends VendureEntity {
    constructor(input?: DeepPartial<ProductGroupErp>) {
        super(input);
    }

    @Index({ unique: true })
    @Column({ type: 'varchar' })
    erpId!: string;

    @Column({ type: 'varchar', nullable: true })
    name!: string | null;

    @Column({ type: 'varchar', nullable: true })
    code!: string | null;

    @Column({ type: 'varchar', nullable: true })
    parentId!: string | null;

    @Column({ type: 'boolean', default: true })
    isActive!: boolean;

    @Column({ type: 'boolean', default: false })
    isDeleted!: boolean;
}
