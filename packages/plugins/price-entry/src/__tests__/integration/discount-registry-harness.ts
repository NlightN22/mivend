import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';
import type { TransactionalConnection } from '@vendure/core';
import type { NumberingService } from '@mivend/plugin-numbering';

@Entity('discount_registry_entry')
export class TestRegistryEntry {
    @PrimaryGeneratedColumn() id!: number;
    @Column({ type: 'uuid', default: () => 'gen_random_uuid()' }) uuid!: string;
    @Column({ type: 'varchar', default: '1000000000' }) number!: string;
    @Column({ type: 'timestamp', default: () => 'now()' }) createdAt!: Date;
    @Column({ type: 'varchar', nullable: true }) approvalRequestId!: string | null;
    @Column({ type: 'varchar', nullable: true }) discountRuleId!: string | null;
    @Column({ type: 'varchar' }) status!: string;
    @Column({ type: 'varchar' }) priceTypeCode!: string;
    @Column({ type: 'varchar', nullable: true }) facetCode!: string | null;
    @Column({ type: 'varchar', nullable: true }) facetValueCode!: string | null;
    @Column({ type: 'int' }) percent!: number;
    @Column({ type: 'timestamp' }) validFrom!: Date;
    @Column({ type: 'timestamp' }) validTo!: Date;
    @Column({ type: 'varchar', nullable: true }) justification!: string | null;
    @Column({ type: 'simple-json', nullable: true }) counterpartyIds!: string[] | null;
    @Column({ type: 'varchar', nullable: true }) customerNamesForSearch!: string | null;
}

export function mapEntity(base: TransactionalConnection): TransactionalConnection {
    return {
        withTransaction: base.withTransaction.bind(base),
        getRepository: (ctx: never, entity: unknown) =>
            base.getRepository(
                ctx,
                (entity as { name?: string }).name === 'DiscountRegistryEntry'
                    ? (TestRegistryEntry as never)
                    : (entity as never),
            ),
    } as unknown as TransactionalConnection;
}

export function sequentialNumbering(): NumberingService {
    let n = 1000000000;
    return { next: async () => String(++n) } as unknown as NumberingService;
}
