import { DeepPartial } from '@vendure/common/lib/shared-types';
import { VendureEntity } from '@vendure/core';
import { Column, Entity, Index } from 'typeorm';

// ProductChanged.barcodes is repeated, so use a one-to-many table, not a nullable column.
// Attached to ProductVariant, not Product: it is the sellable unit a barcode scan resolves to.
@Entity()
@Index(['productVariantId', 'code'], { unique: true })
export class ProductVariantBarcode extends VendureEntity {
    constructor(input?: DeepPartial<ProductVariantBarcode>) {
        super(input);
    }

    @Index()
    @Column({ type: 'varchar' })
    productVariantId!: string;

    @Column({ type: 'varchar' })
    code!: string;
}
