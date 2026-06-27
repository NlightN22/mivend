import { DeepPartial } from '@vendure/common/lib/shared-types';
import { VendureEntity } from '@vendure/core';
import { Column, Entity, Index } from 'typeorm';

@Entity()
@Index(['variantId', 'priceTypeCode'], { unique: true })
export class ProductVariantPriceEntry extends VendureEntity {
    constructor(input?: DeepPartial<ProductVariantPriceEntry>) {
        super(input);
    }

    @Column({ type: 'varchar' })
    variantId!: string;

    @Column({ type: 'varchar' })
    priceTypeCode!: string;

    @Column({ type: 'bigint' })
    price!: number;
}
