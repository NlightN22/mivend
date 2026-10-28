import { DeepPartial } from '@vendure/common/lib/shared-types';
import { VendureEntity } from '@vendure/core';
import { Column, Entity, Index } from 'typeorm';

// Excludes the product's own manufacturer's code: the upstream service routes it to an internal field
// so this stream only carries cross-manufacturer OEM codes, typically 0-5 per product.
@Entity()
export class ProductManufacturerCode extends VendureEntity {
    constructor(input?: DeepPartial<ProductManufacturerCode>) {
        super(input);
    }

    @Index()
    @Column({ type: 'varchar' })
    productId!: string;

    @Column({ type: 'int' })
    lineNumber!: number;

    @Column({ type: 'varchar' })
    code!: string;

    // Kept as a raw string, not resolved to a Manufacturer entity: the upstream service has not confirmed
    // its GUID shape matches top-level ProductChanged.manufacturer. Revisit once confirmed.
    @Column({ type: 'varchar' })
    manufacturer!: string;
}
