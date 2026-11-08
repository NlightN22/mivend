import { ErpMirrorEntity } from 'shared';
import { Column, Entity, Index } from 'typeorm';

// Last state of the `point-of-sale-type` stream; referenced by TradingPointErp.pointTypeIds (soft).
@Entity()
export class PointOfSaleTypeErp extends ErpMirrorEntity {
    @Index({ unique: true })
    @Column({ type: 'varchar' })
    erpId!: string;

    @Column({ type: 'varchar', nullable: true })
    name!: string | null;

    @Column({ type: 'varchar', nullable: true })
    code!: string | null;

    @Column({ type: 'boolean', default: true })
    isActive!: boolean;

    @Column({ type: 'boolean', default: false })
    isDeleted!: boolean;
}
