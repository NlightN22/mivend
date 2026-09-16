import { DeepPartial } from '@vendure/common/lib/shared-types';
import { VendureEntity } from '@vendure/core';
import { Column, Entity, Index } from 'typeorm';

// ProductChanged's `barcodes` (repeated string) — issue #116. Real data today is 0-1 barcode per
// product (confirmed with Search Platform), but the contract is `repeated`, so a proper
// one-to-many table (not a single nullable column) is the correct shape — keyed for lookup, per
// the issue's own design ask, not a JSON array.
//
// Attached to the ProductVariant, not the Product, even though ProductChanged itself carries
// barcodes at the product level — this plugin's whole single-variant-per-product model (see
// ProductStreamHandler's own createDefaultVariant comment) makes the variant the real sellable
// unit a barcode scan actually resolves to.
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
