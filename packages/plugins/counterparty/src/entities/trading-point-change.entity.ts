import { DeepPartial } from '@vendure/common/lib/shared-types';
import { UuidEntity } from 'shared';
import { Column, Entity, Index } from 'typeorm';

export type TradingPointChangeStatus = 'pending' | 'accepted' | 'rejected';

// A customer edit of an ERP-confirmed point waits here until a manager accepts it; payload is JSON.
@Entity()
@Index(['tradingPointId'], { unique: true, where: `"status" = 'pending'` })
export class TradingPointChange extends UuidEntity {
    constructor(input?: DeepPartial<TradingPointChange>) {
        super(input);
    }

    @Column({ type: 'varchar' })
    tradingPointId!: string;

    @Column({ type: 'varchar' })
    counterpartyId!: string;

    @Column({ type: 'text' })
    payload!: string;

    @Column({ type: 'varchar', default: 'pending' })
    status!: TradingPointChangeStatus;

    @Column({ type: 'varchar', nullable: true })
    requestedByUserId!: string | null;

    @Column({ type: 'varchar', nullable: true })
    decidedByUserId!: string | null;

    @Column({ type: 'timestamptz', nullable: true })
    decidedAt!: Date | null;

    @Column({ type: 'varchar', nullable: true })
    comment!: string | null;

    // Per-point sequence set on acceptance; the ERP side dedupes on point uuid + version.
    @Column({ type: 'int', nullable: true })
    version!: number | null;
}
