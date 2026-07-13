import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { Column, DataSource, Entity, PrimaryGeneratedColumn } from 'typeorm';
import type { RequestContext, TransactionalConnection } from '@vendure/core';
import type { AccessScopeService } from '@mivend/plugin-access-control';

import { CounterpartyService } from '../../counterparty.service';

// Vendure's VendureEntity relies on an EntityIdStrategy registered during bootstrap() to
// generate its primary column — using the real Counterparty class against a standalone
// DataSource fails with "Entity does not have a primary column" (see documents/sync
// integration tests for the same constraint). Hand-rolled table matching production schema
// instead, against real Postgres, no DB mocking.
@Entity('counterparty')
class TestCounterparty {
    @PrimaryGeneratedColumn('uuid')
    id!: string;

    @Column({ type: 'varchar' }) erpId!: string;
    @Column({ type: 'varchar' }) legalName!: string;
    @Column({ type: 'varchar' }) shortName!: string;
    @Column({ type: 'varchar', nullable: true }) inn!: string | null;
    @Column({ type: 'bigint', default: 0 }) creditLimit!: number;
    @Column({ type: 'bigint', default: 0 }) creditBalance!: number;
    @Column({ type: 'int', default: 0 }) paymentDelayDays!: number;
    @Column({ type: 'varchar', default: 'retail' }) priceType!: string;
    @Column({ type: 'boolean', default: true }) isActive!: boolean;
    @Column({ type: 'varchar', nullable: true }) assignedManagerId!: string | null;
    @Column({ type: 'varchar', nullable: true }) departmentId!: string | null;
    @Column({ type: 'varchar', nullable: true }) branchId!: string | null;
}

let dataSource: DataSource;
let service: CounterpartyService;
const mockCtx = {} as RequestContext;
const mockAccessScopeService = { resolveCounterpartyScope: vi.fn() };

beforeAll(async () => {
    dataSource = new DataSource({
        type: 'postgres',
        host: process.env['TEST_DB_HOST'] ?? 'localhost',
        port: Number(process.env['TEST_DB_PORT'] ?? 5432),
        username: process.env['TEST_DB_USER'] ?? 'postgres',
        password: process.env['TEST_DB_PASSWORD'] ?? 'postgres',
        database: process.env['TEST_DB_NAME'] ?? 'mivend_test',
        entities: [TestCounterparty],
        synchronize: true,
        dropSchema: true,
    });
    await dataSource.initialize();

    const connectionShim = {
        getRepository: () => dataSource.getRepository(TestCounterparty),
        rawConnection: dataSource,
    } as unknown as TransactionalConnection;

    service = new CounterpartyService(
        connectionShim,
        { update: vi.fn() } as never,
        { assignCustomerPriceTypeByCode: vi.fn() } as never,
        mockAccessScopeService as unknown as AccessScopeService,
        { findOne: vi.fn() } as never,
        { recordChange: vi.fn() } as never,
    );
});

afterAll(async () => {
    await dataSource.destroy();
});

beforeEach(async () => {
    await dataSource.getRepository(TestCounterparty).clear();
    mockAccessScopeService.resolveCounterpartyScope.mockReset();
});

async function seedCounterparties(): Promise<void> {
    await dataSource.getRepository(TestCounterparty).save([
        {
            erpId: 'cp-own-mine',
            legalName: 'Own Mine LLC',
            shortName: 'Own Mine',
            assignedManagerId: 'admin-1',
            departmentId: 'dept-1',
            branchId: 'branch-a',
        },
        {
            erpId: 'cp-own-other',
            legalName: 'Own Other LLC',
            shortName: 'Own Other',
            assignedManagerId: 'admin-2',
            departmentId: 'dept-1',
            branchId: 'branch-a',
        },
        {
            erpId: 'cp-other-dept',
            legalName: 'Other Dept LLC',
            shortName: 'Other Dept',
            assignedManagerId: 'admin-3',
            departmentId: 'dept-2',
            branchId: 'branch-b',
        },
    ]);
}

describe('CounterpartyService.findVisible (integration, real Postgres)', () => {
    it('"own" scope sees only the caller\'s assigned counterparty, not another manager\'s', async () => {
        await seedCounterparties();
        mockAccessScopeService.resolveCounterpartyScope.mockResolvedValue({
            kind: 'own',
            administratorId: 'admin-1',
        });

        const result = await service.findVisible(mockCtx);

        expect(result.map(c => c.erpId)).toEqual(['cp-own-mine']);
        expect(result.map(c => c.erpId)).not.toContain('cp-own-other');
    });

    it('"department" scope sees all counterparties in the department/branch, not other departments', async () => {
        await seedCounterparties();
        mockAccessScopeService.resolveCounterpartyScope.mockResolvedValue({
            kind: 'department',
            departmentId: 'dept-1',
            branchId: 'branch-a',
        });

        const result = await service.findVisible(mockCtx);

        expect(result.map(c => c.erpId).sort()).toEqual(['cp-own-mine', 'cp-own-other']);
        expect(result.map(c => c.erpId)).not.toContain('cp-other-dept');
    });

    it('"all" scope sees every counterparty across departments', async () => {
        await seedCounterparties();
        mockAccessScopeService.resolveCounterpartyScope.mockResolvedValue({ kind: 'all' });

        const result = await service.findVisible(mockCtx);

        expect(result.map(c => c.erpId).sort()).toEqual([
            'cp-other-dept',
            'cp-own-mine',
            'cp-own-other',
        ]);
    });
});
