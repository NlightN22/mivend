import { DeepPartial } from '@vendure/common/lib/shared-types';
import { VendureEntity } from '@vendure/core';
import { Column, Entity, Index, OneToMany } from 'typeorm';

import { CustomerPriceType } from './customer-price-type.entity';

export type PriceTypeVisibility = 'customer' | 'confidential';

const numericTransformer = {
    to: (value: number | null): number | null => value,
    from: (value: string | null): number | null => (value === null ? null : Number(value)),
};

@Entity()
@Index('IDX_price_type_single_purchase', ['isPurchase'], {
    unique: true,
    where: '"isPurchase" = true',
})
export class PriceType extends VendureEntity {
    constructor(input?: DeepPartial<PriceType>) {
        super(input);
    }

    @Index({ unique: true })
    @Column({ type: 'varchar' })
    code!: string;

    @Column({ type: 'varchar' })
    name!: string;

    @Column({ type: 'boolean', default: true })
    isActive!: boolean;

    @Column({ type: 'varchar', default: 'confidential' })
    visibility!: PriceTypeVisibility;

    // At most one purchase type (partial unique index in the migration); filled from the ERP stream.
    @Column({ type: 'boolean', default: false })
    isPurchase!: boolean;

    // Set on the purchase type only: floor = purchase price x this multiplier.
    @Column({
        type: 'numeric',
        precision: 12,
        scale: 6,
        nullable: true,
        transformer: numericTransformer,
    })
    ceilingMultiplier!: number | null;

    // Nullable and unique-when-present: manager-created price types never get an ERP id.
    // The value must match PriceChanged.priceTypeId, which references it.
    @Index({ unique: true })
    @Column({ type: 'varchar', nullable: true })
    externalId?: string | null;

    @OneToMany(() => CustomerPriceType, cpt => cpt.priceType)
    customerAssignments!: CustomerPriceType[];
}
