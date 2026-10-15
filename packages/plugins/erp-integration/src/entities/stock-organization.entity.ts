import { DeepPartial } from '@vendure/common/lib/shared-types';
import { VendureEntity } from '@vendure/core';
import { Column, Entity, Index } from 'typeorm';

// ERP-owned organization-level stock split (no warehouse dimension), in the product storage unit.
// Keyed by the ERP ids, not FKs: arrival order versus product/organization masters does not matter.
@Entity()
@Index(['productId', 'organizationErpId'], { unique: true })
export class StockOrganization extends VendureEntity {
    constructor(input?: DeepPartial<StockOrganization>) {
        super(input);
    }

    @Index()
    @Column({ type: 'varchar' })
    entityId!: string;

    @Column({ type: 'varchar' })
    productId!: string;

    @Column({ type: 'varchar' })
    organizationErpId!: string;

    @Column({ type: 'double precision', default: 0 })
    quantity!: number;

    @Column({ type: 'boolean', default: true })
    isActive!: boolean;
}
