import { DeepPartial } from '@vendure/common/lib/shared-types';
import { VendureEntity } from '@vendure/core';
import { Column, Entity, Index } from 'typeorm';

// Not RBAC: RoleAccessScope governs access; this only sets portal defaults and restrictions.
// branchId is a raw column (not a relation) like Warehouse.branchId; client reads only default*Id.
@Entity()
export class BranchSettings extends VendureEntity {
    constructor(input?: DeepPartial<BranchSettings>) {
        super(input);
    }

    @Index({ unique: true })
    @Column({ type: 'varchar' })
    branchId!: string;

    @Column({ type: 'varchar' })
    defaultPriceTypeId!: string;

    @Column({ type: 'simple-json', nullable: true })
    visiblePriceTypeIds?: string[] | null;

    @Column({ type: 'varchar', nullable: true })
    defaultWarehouseId?: string | null;

    @Column({ type: 'simple-json', nullable: true })
    visibleWarehouseIds?: string[] | null;

    // #103/#214: when true, a variant whose default sales unit differs from the base unit is sold
    // only in that unit (docs/order-flow.md). Read by plugin-moq via resolveEffective.
    @Column({ type: 'boolean', default: false })
    packagesOnly!: boolean;

    // #222: how long a prepayment (no limit) order holds its reserve before the standard auto-cancel.
    @Column({ type: 'int', default: 3 })
    prepaymentReserveDays!: number;

    // #206: payment term of each proforma invoice version, in days after its issue date.
    @Column({ type: 'int', default: 3 })
    proformaPaymentTermDays!: number;
}
