import { DeepPartial } from '@vendure/common/lib/shared-types';
import { VendureEntity } from '@vendure/core';
import { Column, Entity, Index } from 'typeorm';

import type { CategoryFlagReason } from '../category-resolver';

// A non-blocking "succeeded but worth reviewing" signal for a product's category link (issue
// #116) — mirrors ProductTaxCodeFlag (issue #79) exactly: a bare, readable record, no status/
// resolution workflow (out of scope per issue #116, same reasoning as #79).
@Entity()
export class ProductCategoryFlag extends VendureEntity {
    constructor(input?: DeepPartial<ProductCategoryFlag>) {
        super(input);
    }

    // Integration Service's own product entity id (ProductStreamHandler's `entityId`), not
    // Vendure's Product.id — same convention as ProductTaxCodeFlag.externalProductId.
    @Index()
    @Column({ type: 'varchar' })
    externalProductId!: string;

    // The raw category_id from the payload, or null when it was absent entirely.
    @Column({ type: 'varchar', nullable: true })
    rawCategoryId!: string | null;

    @Column({ type: 'varchar' })
    reason!: CategoryFlagReason;

    @Column({ type: 'varchar' })
    detail!: string;

    @Column({ type: 'timestamp' })
    detectedAt!: Date;
}
