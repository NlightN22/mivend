import { DeepPartial } from '@vendure/common/lib/shared-types';
import { VendureEntity } from '@vendure/core';
import { Column, Entity, Index } from 'typeorm';

@Entity()
@Index(['oemCode', 'oemBrand'])
export class ProductCrossReference extends VendureEntity {
    constructor(input?: DeepPartial<ProductCrossReference>) {
        super(input);
    }

    @Index()
    @Column({ type: 'int' })
    productId!: number;

    @Column({ type: 'varchar' })
    oemCode!: string;

    @Column({ type: 'varchar' })
    oemBrand!: string;
}
