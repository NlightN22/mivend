import { ErpMirrorEntity, createTestConnection } from 'shared';
import type { TransactionalConnection } from '@vendure/core';
import {
    Column,
    DataSource,
    Entity,
    Index,
    JoinColumn,
    ManyToOne,
    OneToMany,
    PrimaryGeneratedColumn,
} from 'typeorm';

import { ContactPerson } from '../../entities/contact-person.entity';
import { Counterparty } from '../../entities/counterparty.entity';
import { TradingPointChange } from '../../entities/trading-point-change.entity';
import { TradingPoint } from '../../entities/trading-point.entity';

// Vendure's VendureEntity needs bootstrap() for its id column, so a bare DataSource uses these table-shaped stand-ins.
@Entity('counterparty')
export class TestCounterparty {
    @PrimaryGeneratedColumn('increment') id!: number;
    @Column({ type: 'varchar', nullable: true }) erpId!: string | null;
    @Column({ type: 'varchar', nullable: true }) branchId!: string | null;
}

@Entity('trading_point')
export class TestTradingPoint {
    @PrimaryGeneratedColumn('increment') id!: number;
    @Column({ type: 'varchar', nullable: true }) uuid!: string | null;
    @Column({ type: 'varchar', default: '' }) erpId!: string;
    @Column({ type: 'varchar' }) counterpartyId!: string;
    @Column({ type: 'boolean', default: true }) customerOwned!: boolean;
    @Column({ type: 'boolean', default: true }) isActive!: boolean;
    @Column({ type: 'varchar' }) name!: string;
    @Column({ type: 'varchar' }) address!: string;
    @Column({ type: 'varchar', nullable: true }) workingHours!: string | null;
    @Column({ type: 'float', nullable: true }) latitude!: number | null;
    @Column({ type: 'float', nullable: true }) longitude!: number | null;
    @OneToMany(() => TestContact, c => c.tradingPoint, { eager: true, cascade: true })
    contacts!: TestContact[];
}

@Entity('contact_person')
export class TestContact {
    @PrimaryGeneratedColumn('increment') id!: number;
    @ManyToOne(() => TestTradingPoint, tp => tp.contacts, { onDelete: 'CASCADE' })
    @JoinColumn()
    tradingPoint!: TestTradingPoint;
    @Column({ type: 'varchar' }) name!: string;
}

@Entity('trading_point_change')
@Index(['tradingPointId'], { unique: true, where: `"status" = 'pending'` })
export class TestTradingPointChange extends ErpMirrorEntity {
    @Column({ type: 'uuid', default: () => 'gen_random_uuid()' }) uuid!: string;
    @Column({ type: 'varchar' }) tradingPointId!: string;
    @Column({ type: 'varchar' }) counterpartyId!: string;
    @Column({ type: 'text' }) payload!: string;
    @Column({ type: 'varchar', default: 'pending' }) status!: string;
    @Column({ type: 'varchar', nullable: true }) requestedByUserId!: string | null;
    @Column({ type: 'varchar', nullable: true }) decidedByUserId!: string | null;
    @Column({ type: 'timestamptz', nullable: true }) decidedAt!: Date | null;
    @Column({ type: 'varchar', nullable: true }) comment!: string | null;
    @Column({ type: 'int', nullable: true }) version!: number | null;
}

const mirrors = new Map<unknown, unknown>([
    [TradingPoint, TestTradingPoint],
    [ContactPerson, TestContact],
    [Counterparty, TestCounterparty],
    [TradingPointChange, TestTradingPointChange],
]);

export function mirroredConnection(dataSource: DataSource): TransactionalConnection {
    const base = createTestConnection(dataSource);
    return {
        withTransaction: base.withTransaction.bind(base),
        getRepository: (c: never, entity: unknown) =>
            base.getRepository(c, (mirrors.get(entity) ?? entity) as never),
    } as unknown as TransactionalConnection;
}
