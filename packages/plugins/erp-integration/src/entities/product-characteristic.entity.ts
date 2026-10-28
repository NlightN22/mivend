import { DeepPartial } from '@vendure/common/lib/shared-types';
import { VendureEntity } from '@vendure/core';
import { Column, Entity, Index } from 'typeorm';

// One table, group discriminator: two fields are unpopulated upstream but may be filled later.
// key is open-ended on purpose: the source has no fixed attribute catalog, so no enum.
export type ProductCharacteristicGroup = 'attribute' | 'specification' | 'technicalRequirement';

@Entity()
@Index(['productId', 'group', 'key'], { unique: true })
export class ProductCharacteristic extends VendureEntity {
    constructor(input?: DeepPartial<ProductCharacteristic>) {
        super(input);
    }

    @Index()
    @Column({ type: 'varchar' })
    productId!: string;

    @Column({ type: 'varchar' })
    group!: ProductCharacteristicGroup;

    @Column({ type: 'varchar' })
    key!: string;

    // Shape verified against runtime toJson() output; the .d.ts typing alone was not trusted.
    @Column({ type: 'varchar', nullable: true })
    rawValue!: string | null;

    // CharacteristicValue.normalized (string[]) — JSON-encoded; a real, bounded, known shape
    // (search-normalized terms), not an opaque "for later" blob.
    @Column({ type: 'text', nullable: true })
    normalizedValue!: string | null;

    // CharacteristicValue.structured_json — confirmed always null today (the upstream service's
    // attribute-mapping.ts hardcodes it), but a real contract field kept for when it isn't.
    @Column({ type: 'text', nullable: true })
    structuredJson!: string | null;
}
