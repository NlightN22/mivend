import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { Column, DataSource, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';
import type { RequestContext, TransactionalConnection } from '@vendure/core';
import { CounterpartyDiscountRuleService } from '@mivend/plugin-price-entry';
import {
    createTestConnection,
    createTestSchema,
    dropTestSchema,
    testDataSourceConnectionOptions,
    testRequestContext,
    testSchemaOptions,
} from 'shared';

import { IntegrationInboxEvent } from '../../../entities/integration-inbox-event.entity';
import { DiscountRuleStreamHandler } from '../../../handlers/discount-rule.handler';
import { IntegrationInboxService } from '../../../integration-inbox.service';
import { makeInboxProcessor } from './inbox-processor-helpers';

// Plain mirror of the columns the counterparty-rule write path touches (VendureEntity needs a bootstrapped id strategy).
@Entity('discount_rule')
@Index(['erpId'], { unique: true })
class TestRule {
    @PrimaryGeneratedColumn() id!: number;
    @Column({ type: 'varchar' }) erpId!: string;
    @Column({ type: 'varchar', nullable: true }) priceTypeCode!: string | null;
    @Column({ type: 'varchar', nullable: true }) facetCode!: string | null;
    @Column({ type: 'varchar', nullable: true }) facetValueCode!: string | null;
    @Column({ type: 'float', nullable: true }) minWeightKg!: number | null;
    @Column({ type: 'float', nullable: true }) minAmount!: number | null;
    @Column({ type: 'varchar', nullable: true }) triggerProductErpId!: string | null;
    @Column({ type: 'varchar', nullable: true }) giftProductErpId!: string | null;
    @Column({ type: 'float', nullable: true }) giftQuantity!: number | null;
    @Column({ type: 'varchar', nullable: true }) operationKind!: string | null;
    @Column({ type: 'varchar', nullable: true }) recipientType!: string | null;
    @Column({ type: 'varchar', nullable: true }) recipientErpId!: string | null;
    @Column({ type: 'varchar', nullable: true }) productErpId!: string | null;
    @Column({ type: 'varchar', nullable: true }) condition!: string | null;
    @Column({ type: 'float', nullable: true }) conditionValue!: number | null;
    @Column({ type: 'float' }) percent!: number;
    @Column({ type: 'float', nullable: true }) limitAmount!: number | null;
    @Column({ type: 'timestamp' }) validFrom!: Date;
    @Column({ type: 'timestamp', nullable: true }) validTo!: Date | null;
    @Column({ type: 'varchar', nullable: true }) sourceVersion!: string | null;
    @Column({ type: 'boolean', default: true }) active!: boolean;
}

const { schema, extra } = testSchemaOptions('erp_discount_rule');
let dataSource: DataSource;
let inbox: IntegrationInboxService;
let sourceSeq = 0;
const entityId = 'prod-1|cp-1|byQuantity|0';
// Real shape: no conditionValue (zero), no limitAmount, no effectiveTo.
const productionShaped = {
    percent: 5,
    isActive: true,
    condition: 'byQuantity',
    productId: '',
    recipientId: 'cp-1',
    recipientType: 'counterparty',
    effectiveFrom: '2026-01-01T00:00:00Z',
};

beforeAll(async () => {
    await createTestSchema(schema);
    dataSource = new DataSource({
        type: 'postgres',
        ...testDataSourceConnectionOptions(),
        schema,
        extra,
        entities: [IntegrationInboxEvent, TestRule],
        synchronize: true,
    });
    await dataSource.initialize();
    inbox = new IntegrationInboxService(createTestConnection(dataSource));
});

beforeEach(async () => {
    await dataSource.query(`TRUNCATE integration_inbox_event, discount_rule RESTART IDENTITY`);
});

afterAll(async () => {
    await dataSource.destroy();
    await dropTestSchema(schema);
});

async function deliver(version: string, payload: Record<string, unknown>): Promise<void> {
    sourceSeq += 1;
    const connection = {
        getRepository: () => dataSource.getRepository(TestRule),
    } as unknown as TransactionalConnection;
    const handler = new DiscountRuleStreamHandler(new CounterpartyDiscountRuleService(connection));
    await inbox.enqueue(testRequestContext, {
        stream: 'discount-rule',
        entityId,
        version,
        sourceEventId: `evt-${sourceSeq}`,
        payload,
    });
    await makeInboxProcessor(
        dataSource,
        inbox,
        vi.fn((c: RequestContext, id: string, p: Record<string, unknown>) =>
            handler.apply(c, id, p),
        ),
    ).processPendingBatch();
}

type Stored = {
    productErpId: string | null;
    conditionValue: number;
    validTo: Date | null;
    percent: number;
};
const rules = (): Promise<Stored[]> =>
    dataSource.query(
        `SELECT "productErpId", "conditionValue", "validTo", percent FROM discount_rule`,
    );

describe('discount-rule through the inbox (real Postgres)', () => {
    it('stores a production-shaped payload and a redelivery leaves exactly one row', async () => {
        await deliver('1', { ...productionShaped, version: '1' });
        await deliver('1', { ...productionShaped, version: '1' });

        expect(await rules()).toEqual([
            { productErpId: null, conditionValue: 0, validTo: null, percent: 5 },
        ]);
        const events = await dataSource.getRepository(IntegrationInboxEvent).find();
        expect(events.every(e => e.status === 'processed')).toBe(true);
    });

    it('stores a negative percent (markup) as is', async () => {
        await deliver('1', { ...productionShaped, percent: -5, version: '1' });

        expect((await rules())[0].percent).toBe(-5);
    });

    it('surfaces an invalid payload as a failed inbox row, not a processed noop', async () => {
        await deliver('1', { ...productionShaped, recipientId: '', version: '1' });

        const [event] = await dataSource.getRepository(IntegrationInboxEvent).find();
        expect(event.status).toBe('failed');
        expect(event.lastError).toContain('recipientId');
        expect(await rules()).toEqual([]);
    });
});
