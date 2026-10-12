import { DeepPartial } from '@vendure/common/lib/shared-types';
import { VendureEntity } from '@vendure/core';
import { Column, Entity, Index } from 'typeorm';

// Business configuration, 1:1 with Branch — deliberately separate from AccessScopeService's
// RoleAccessScope (who-sees-what for RBAC); this is what a branch's client/manager portals
// default and restrict to (issue #66). branchId is a raw column (this plugin's established
// pattern for Branch/Warehouse relations — see Warehouse.branchId) rather than a TypeORM
// relation. visible*Ids are JSON arrays of ids (manager-portal-only restriction, unset = no
// restriction); the client portal only ever reads default*Id.
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

    // #219: variant multiplicity is enforced and shown only when true.
    @Column({ type: 'boolean', default: false })
    enforceMultiplicity!: boolean;

    // #222: an over-limit order may go on with the customer's acknowledgement, no manager wait.
    @Column({ type: 'boolean', default: false })
    allowExceedingCreditLimit!: boolean;

    // #222: how long a prepayment (no limit) order holds its reserve before the standard auto-cancel.
    @Column({ type: 'int', default: 3 })
    prepaymentReserveDays!: number;
}
