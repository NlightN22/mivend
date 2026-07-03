import { DeepPartial } from '@vendure/common/lib/shared-types';
import { VendureEntity } from '@vendure/core';
import { Column, Entity, Index } from 'typeorm';

@Entity()
@Index(['erpId'], { unique: true })
export class DiscountRule extends VendureEntity {
    constructor(input?: DeepPartial<DiscountRule>) {
        super(input);
    }

    @Column({ type: 'varchar' })
    erpId!: string;

    @Column({ type: 'varchar' })
    priceTypeCode!: string;

    @Column({ type: 'varchar', nullable: true })
    facetCode!: string | null;

    @Column({ type: 'varchar', nullable: true })
    facetValueCode!: string | null;

    @Column({ type: 'int' })
    percent!: number;

    @Column({ type: 'timestamp' })
    validFrom!: Date;

    @Column({ type: 'timestamp' })
    validTo!: Date;

    @Column({ type: 'float', nullable: true })
    minWeightKg!: number | null;

    // Base price (in the smallest currency unit, e.g. kopecks) that must be spent on
    // this rule's facet within the order to reach this tier. Mutually exclusive with
    // minWeightKg — a rule uses one metric or the other, never both.
    @Column({ type: 'bigint', nullable: true })
    minAmount!: number | null;
}
