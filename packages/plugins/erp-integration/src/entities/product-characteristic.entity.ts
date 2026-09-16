import { DeepPartial } from '@vendure/common/lib/shared-types';
import { VendureEntity } from '@vendure/core';
import { Column, Entity, Index } from 'typeorm';

// ProductChanged carries three separate map<string, CharacteristicValue> fields — `attributes`,
// `specifications`, `technicalRequirements` — with an identical value shape. Search Platform
// confirmed `specifications`/`technicalRequirements` are permanently dead on their side today
// (their own mapper only ever populates `attributes`); modeling all three as one reusable table
// with a `group` discriminator (a fixed 3-value shape taken directly from the protobuf contract
// itself, not a speculative business enum) avoids three near-identical tables while staying ready
// the moment Search Platform starts populating the other two — issue #116's own design.
//
// `attributes` keys are genuinely open-ended (a tire's "Диаметр"/"Ширина шины, мм" vs. an
// electronics item's "Тип дисплея"/"Bluetooth" — no fixed catalog on either side, per Search
// Platform) — this table's `key` column is exactly the right shape for that, not a hardcoded enum
// (AGENTS.md's own "don't hardcode business enums" rule doesn't apply here: the source itself is
// open-ended, there is no catalog to hardcode).
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

    // CharacteristicValue.raw — confirmed against the actual installed
    // @nlightn22/event-contracts@0.14.0's real toJson() output (issue #116's own runtime check),
    // not just its .d.ts.
    @Column({ type: 'varchar', nullable: true })
    rawValue!: string | null;

    // CharacteristicValue.normalized (string[]) — JSON-encoded; a real, bounded, known shape
    // (search-normalized terms), not an opaque "for later" blob.
    @Column({ type: 'text', nullable: true })
    normalizedValue!: string | null;

    // CharacteristicValue.structured_json — confirmed always null today (Search Platform's
    // attribute-mapping.ts hardcodes it), but a real contract field kept for when it isn't.
    @Column({ type: 'text', nullable: true })
    structuredJson!: string | null;
}
