import { DeepPartial } from '@vendure/common/lib/shared-types';
import { VendureEntity } from '@vendure/core';
import { Column, Entity, Index, OneToMany } from 'typeorm';

import { CustomerPriceType } from './customer-price-type.entity';

@Entity()
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

    // 1C's own GUID for this price type (PriceTypeChanged.entityId, the same value
    // PriceChanged.priceTypeId refers back to). Nullable + unique-when-present so
    // manager-created price types (never seen from 1C) coexist with ERP-originated ones.
    @Index({ unique: true })
    @Column({ type: 'varchar', nullable: true })
    externalId?: string | null;

    @OneToMany(() => CustomerPriceType, cpt => cpt.priceType)
    customerAssignments!: CustomerPriceType[];
}
