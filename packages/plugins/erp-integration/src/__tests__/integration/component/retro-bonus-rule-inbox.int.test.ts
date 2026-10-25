import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { Column, DataSource, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';
import type { RequestContext, TransactionalConnection } from '@vendure/core';
import { RetroBonusRuleService } from '@mivend/plugin-retro-bonus';
import {
    createTestConnection,
    createTestSchema,
    dropTestSchema,
    testDataSourceConnectionOptions,
    testRequestContext,
    testSchemaOptions,
} from 'shared';

import { IntegrationInboxEvent } from '../../../entities/integration-inbox-event.entity';
import { RetroBonusRuleStreamHandler } from '../../../handlers/retro-bonus-rule.handler';
import { IntegrationInboxService } from '../../../integration-inbox.service';
import { makeInboxProcessor } from './inbox-processor-helpers';

// Plain mirror of the rule table (VendureEntity needs a bootstrapped id strategy).
@Entity('retro_bonus_rule')
@Index(['erpId'], { unique: true })
class TestRule {
    @PrimaryGeneratedColumn() id!: number;
    @Column({ type: 'varchar' }) erpId!: string;
    @Column({ type: 'varchar' }) productErpId!: string;
    @Column({ type: 'varchar' }) counterpartyErpId!: string;
    @Column({ type: 'varchar', nullable: true }) recipientContractErpId!: string | null;
    @Column({ type: 'varchar', nullable: true }) priceTypeErpId!: string | null;
    @Column({ type: 'boolean', default: false }) isInstant!: boolean;
    @Column({ type: 'varchar', nullable: true }) accrualPeriod!: string | null;
    @Column({ type: 'int', default: 0 }) accrualDayNumber!: number;
    @Column({ type: 'varchar' }) accrualKind!: string;
    @Column({ type: 'double precision' }) percent!: number;
    @Column({ type: 'double precision', nullable: true }) limitAmount!: number | null;
    @Column({ type: 'double precision', nullable: true }) conditionAmount!: number | null;
    @Column({ type: 'double precision', nullable: true }) conditionQuantity!: number | null;
    @Column({ type: 'timestamp' }) validFrom!: Date;
    @Column({ type: 'timestamp', nullable: true }) validTo!: Date | null;
    @Column({ type: 'varchar' }) sourceVersion!: string;
}

const { schema, extra } = testSchemaOptions('erp_retro_bonus_rule');
let dataSource: DataSource;
let inbox: IntegrationInboxService;
let sourceSeq = 0;
const entityId = 'prod-1|cp-1|contract-1|';
const productionShaped = {
    percent: 3,
    isActive: true,
    productId: 'prod-1',
    accrualKind: 'По продажам',
    effectiveFrom: '2026-01-01T00:00:00Z',
    counterpartyId: 'cp-1',
    recipientContractId: 'contract-1',
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
    await dataSource.query(`TRUNCATE integration_inbox_event, retro_bonus_rule RESTART IDENTITY`);
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
    const handler = new RetroBonusRuleStreamHandler(new RetroBonusRuleService(connection));
    await inbox.enqueue(testRequestContext, {
        stream: 'retro-bonus-rule',
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

const rules = (): Promise<Array<{ accrualKind: string; conditionAmount: number | null }>> =>
    dataSource.query(`SELECT "accrualKind", "conditionAmount" FROM retro_bonus_rule`);

describe('retro-bonus-rule through the inbox (real Postgres)', () => {
    it('stores a production-shaped payload and a redelivery leaves exactly one row', async () => {
        await deliver('1', { ...productionShaped, version: '1' });
        await deliver('1', { ...productionShaped, version: '1' });

        expect(await rules()).toEqual([{ accrualKind: 'По продажам', conditionAmount: null }]);
        const events = await dataSource.getRepository(IntegrationInboxEvent).find();
        expect(events.every(e => e.status === 'processed')).toBe(true);
    });

    it('surfaces an invalid payload as a failed inbox row, not a processed noop', async () => {
        await deliver('1', { ...productionShaped, counterpartyId: '', version: '1' });

        const [event] = await dataSource.getRepository(IntegrationInboxEvent).find();
        expect(event.status).toBe('failed');
        expect(event.lastError).toContain('counterpartyId');
        expect(await rules()).toEqual([]);
    });
});
