import { Column, Entity, Index, PrimaryColumn } from 'typeorm';

import { bigintNumber } from './bigint-number.transformer';

// Net turnover of one counterparty per local calendar day and currency, recomputed from the
// documents under the counterparty lock; days whose documents were already retained stay.
@Entity('settlement_turnover_daily')
@Index('IDX_settlement_turnover_daily_day', ['day'])
export class SettlementTurnoverDaily {
    @PrimaryColumn({ type: 'varchar' })
    counterpartyErpId!: string;

    @PrimaryColumn({ type: 'date' })
    day!: string;

    @PrimaryColumn({ type: 'varchar' })
    currency!: string;

    @Column({ type: 'bigint', transformer: bigintNumber })
    turnoverMinor!: number;

    @Column({ type: 'int' })
    saleDocuments!: number;
}
