import { DeepPartial } from '@vendure/common/lib/shared-types';
import { VendureEntity } from '@vendure/core';
import { Column, Entity, Index } from 'typeorm';

export type FiscalizationStatus = 'notRequired' | 'pending' | 'succeeded' | 'failed';

@Entity()
export class FiscalReceipt extends VendureEntity {
    constructor(input?: DeepPartial<FiscalReceipt>) {
        super(input);
    }

    @Index()
    @Column({ type: 'int' })
    paymentId!: number;

    @Column({ type: 'varchar', nullable: true })
    fiscalDocumentNumber!: string | null;

    @Column({ type: 'varchar', nullable: true })
    fiscalSign!: string | null;

    @Column({ type: 'varchar', nullable: true })
    fiscalDriveNumber!: string | null;

    @Column({ type: 'varchar', nullable: true })
    registrationNumber!: string | null;

    @Column({ type: 'varchar' })
    receiptType!: string;

    @Column({ type: 'timestamp', nullable: true })
    fiscalizedAt!: Date | null;

    @Column({ type: 'varchar', default: 'notRequired' })
    fiscalizationStatus!: FiscalizationStatus;
}
