import { DeepPartial } from '@vendure/common/lib/shared-types';
import { VendureEntity } from '@vendure/core';
import { Column, Entity, Index } from 'typeorm';

// Issue #106: append-only feed of retro bonuses the ERP actually credited. operationKind is
// opaque display text — a polymorphic 1C classifier with no fixed value set, never mapped.
@Entity()
@Index(['erpId'], { unique: true })
@Index(['recipientCounterpartyErpId'])
export class GrantedRetroBonus extends VendureEntity {
    constructor(input?: DeepPartial<GrantedRetroBonus>) {
        super(input);
    }

    @Column({ type: 'varchar' })
    erpId!: string;

    @Column({ type: 'varchar' })
    sourceDocumentErpId!: string;

    @Column({ type: 'varchar' })
    sourceCounterpartyErpId!: string;

    // Who the bonus is credited to — can differ from the source counterparty (holding group).
    @Column({ type: 'varchar' })
    recipientCounterpartyErpId!: string;

    @Column({ type: 'varchar' })
    productErpId!: string;

    @Column({ type: 'varchar', nullable: true })
    discountDocumentErpId!: string | null;

    @Column({ type: 'varchar', nullable: true })
    operationKind!: string | null;

    // Raw closed 1C enum, same set as RetroBonusRule.accrualKind; null when the ERP omits it.
    @Column({ type: 'varchar', nullable: true })
    accrualKind!: string | null;

    @Column({ type: 'double precision' })
    percent!: number;

    @Column({ type: 'double precision' })
    quantity!: number;

    @Column({ type: 'double precision' })
    amount!: number;

    @Column({ type: 'varchar', nullable: true })
    orderErpId!: string | null;

    @Column({ type: 'varchar' })
    sourceVersion!: string;
}
