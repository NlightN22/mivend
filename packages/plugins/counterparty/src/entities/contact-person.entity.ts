import { DeepPartial } from '@vendure/common/lib/shared-types';
import { Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';
import { UuidEntity } from 'shared';

import type { ContactSource } from './contact-point.entity';
import { TradingPoint } from './trading-point.entity';

// Legacy phone/email/tradingPoint columns stay until the trading point screens move to contact points (#332).
@Entity()
export class ContactPerson extends UuidEntity {
    constructor(input?: DeepPartial<ContactPerson>) {
        super(input);
    }

    @ManyToOne(() => TradingPoint, (tp: TradingPoint) => tp.contacts, {
        nullable: true,
        onDelete: 'CASCADE',
    })
    @JoinColumn()
    tradingPoint!: TradingPoint | null;

    @Column({ type: 'varchar' })
    name!: string;

    @Column({ type: 'varchar', nullable: true })
    position!: string | null;

    @Column({ type: 'varchar', nullable: true })
    phone!: string | null;

    @Column({ type: 'varchar', nullable: true })
    email!: string | null;

    @Column({ type: 'boolean', default: false })
    isPrimary!: boolean;

    @Column({ type: 'varchar', default: 'manual' })
    source!: ContactSource;

    @Index({ unique: true })
    @Column({ type: 'varchar', nullable: true })
    erpId!: string | null;

    @Column({ type: 'boolean', default: true })
    isActive!: boolean;
}
