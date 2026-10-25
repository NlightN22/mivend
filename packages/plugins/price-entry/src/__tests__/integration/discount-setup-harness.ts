import { Column, DataSource, Entity, Index, PrimaryColumn, PrimaryGeneratedColumn } from 'typeorm';
import type { TransactionalConnection } from '@vendure/core';

// Hand-rolled tables on real Postgres: VendureEntity's primary column needs a bootstrapped
// EntityIdStrategy, which a standalone DataSource does not provide.
@Entity('discount_setup')
@Index(['erpId'], { unique: true })
export class TestSetup {
    @PrimaryGeneratedColumn() id!: number;
    @Column({ type: 'timestamp', default: () => 'now()' }) createdAt!: Date;
    @Column({ type: 'timestamp', default: () => 'now()' }) updatedAt!: Date;
    @Column({ type: 'varchar' }) erpId!: string;
    @Column({ type: 'varchar', default: '' }) documentNumber!: string;
    @Column({ type: 'double precision' }) percent!: number;
    @Column({ type: 'varchar', default: '' }) conditionName!: string;
    @Column({ type: 'double precision', nullable: true }) conditionNumber!: number | null;
    @Column({ type: 'varchar', nullable: true }) priceTypeErpId!: string | null;
    @Column({ type: 'double precision', nullable: true }) limitPercent!: number | null;
    @Column({ type: 'timestamp' }) validFrom!: Date;
    @Column({ type: 'timestamp', nullable: true }) validTo!: Date | null;
    @Column({ type: 'boolean', default: true }) active!: boolean;
    @Column({ type: 'varchar', nullable: true }) inactiveReason!: string | null;
    @Column({ type: 'boolean', default: false }) allProducts!: boolean;
    @Column({ type: 'varchar', default: 'list' }) productMode!: string;
    @Column({ type: 'jsonb', nullable: true }) productFilter!: unknown[] | null;
    @Column({ type: 'varchar' }) sourceVersion!: string;
    @Column({ type: 'varchar', length: 64 }) contentHash!: string;
}

@Entity('discount_setup_recipient')
export class TestRecipient {
    @PrimaryColumn({ type: 'int' }) setupId!: number;
    @PrimaryColumn({ type: 'varchar', default: '' }) counterpartyErpId!: string;
    @PrimaryColumn({ type: 'varchar', default: '' }) contractErpId!: string;
}

@Entity('discount_setup_product')
export class TestProduct {
    @PrimaryColumn({ type: 'int' }) setupId!: number;
    @PrimaryColumn({ type: 'varchar' }) productErpId!: string;
}

@Entity('discount_condition_kind')
export class TestConditionKind {
    @PrimaryColumn({ type: 'varchar' }) erpName!: string;
    @Column({ type: 'varchar' }) metric!: string;
}

@Entity('price_type')
export class TestPriceType {
    @PrimaryGeneratedColumn() id!: number;
    @Column({ type: 'varchar' }) code!: string;
    @Column({ type: 'varchar', nullable: true }) externalId!: string | null;
}

export const SETUP_ENTITIES = [
    TestSetup,
    TestRecipient,
    TestProduct,
    TestConditionKind,
    TestPriceType,
];

export const QUANTITY_KIND = 'quantity-kind';
export const AMOUNT_KIND = 'amount-kind';
export const UNCONDITIONAL_KIND = 'unconditional-kind';

export function mapSetupEntities(base: TransactionalConnection): TransactionalConnection {
    return {
        withTransaction: base.withTransaction.bind(base),
        getRepository: (ctx: never, entity: unknown) =>
            base.getRepository(
                ctx,
                ((entity as { name?: string }).name === 'DiscountSetup'
                    ? TestSetup
                    : entity) as never,
            ),
    } as unknown as TransactionalConnection;
}

export async function resetSetupTables(dataSource: DataSource): Promise<void> {
    await dataSource.query(
        'TRUNCATE discount_setup, discount_setup_recipient, discount_setup_product, discount_condition_kind, price_type RESTART IDENTITY',
    );
    await dataSource.getRepository(TestConditionKind).save([
        { erpName: QUANTITY_KIND, metric: 'quantity' },
        { erpName: AMOUNT_KIND, metric: 'amount' },
        { erpName: UNCONDITIONAL_KIND, metric: 'unconditional' },
    ]);
}
