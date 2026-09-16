import { DeepPartial } from '@vendure/common/lib/shared-types';
import { VendureEntity } from '@vendure/core';
import { Column, Entity, Index } from 'typeorm';

// ProductChanged's `manufacturer_codes` (repeated ManufacturerCode) — real cross-manufacturer OEM
// codes only; Search Platform's own mapper already filters out the entry matching the product's
// own manufacturer (that one goes to their internal manufacturerPartNumber, never published on
// this stream) — confirmed 0-5 rows per product in practice, issue #116.
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

    // Stored as-is (raw string), NOT resolved to a Manufacturer entity — Search Platform has not
    // confirmed this is the same GUID shape as the top-level ProductChanged.manufacturer field
    // (issue #116's own "verify against a real multi-code fixture during implementation, not a
    // blocker" note). Revisit once that's confirmed.
    @Column({ type: 'varchar' })
    manufacturer!: string;
}
