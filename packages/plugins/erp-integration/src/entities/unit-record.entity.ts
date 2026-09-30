import { DeepPartial } from '@vendure/common/lib/shared-types';
import { VendureEntity } from '@vendure/core';
import { Column, Entity, Index } from 'typeorm';

// Local cache of Integration Service's `unit` stream (UnitChanged) — see
// docs/ai/erp-streams-map.md's `unit` row for the out-of-order-arrival design.
@Entity()
export class UnitRecord extends VendureEntity {
    constructor(input?: DeepPartial<UnitRecord>) {
        super(input);
    }

    // The ERP's own unit id (UnitChanged.entityId) — never regenerated, this IS the join key
    // ProductChanged.defaultSalesUnitId points at.
    @Index({ unique: true })
    @Column({ type: 'varchar' })
    entityId!: string;

    // Null for a shared classifier unit; the owning Product's ERP id for a product-owned
    // packaging unit (UnitChanged.ownerId) — informational only, not used for the join above.
    @Column({ type: 'varchar', nullable: true })
    ownerId!: string | null;

    @Column({ type: 'varchar' })
    code!: string;

    @Column({ type: 'varchar' })
    name!: string;

    // Units-per-base-unit (e.g. pieces per box). Non-optional on the wire (proto3 plain double),
    // so an absent key means a real zero, not "unset" — see types.ts's proto3 zero-value comment.
    @Column({ type: 'float' })
    ratioToBase!: number;

    @Column({ type: 'float', nullable: true })
    weightKg!: number | null;

    @Column({ type: 'float', nullable: true })
    volumeL!: number | null;

    @Column({ type: 'boolean', default: false })
    isDeleted!: boolean;
}
