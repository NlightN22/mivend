import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { Column, DataSource, Entity, PrimaryGeneratedColumn } from 'typeorm';
import type { RequestContext, TransactionalConnection } from '@vendure/core';
import type { AccessScopeService } from '@mivend/plugin-access-control';
import {
    QueryTooLargeError,
    createTestSchema,
    dropTestSchema,
    testDataSourceConnectionOptions,
    testSchemaOptions,
} from 'shared';

import { CounterpartyService } from '../../counterparty.service';

// VendureEntity needs bootstrap()'s EntityIdStrategy for its primary column, so a hand-rolled table
// with the production int primary key stands in (raw SQL casts ids to int[]).
@Entity('counterparty')
class TestCounterparty {
    @PrimaryGeneratedColumn()
    id!: number;

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
    @Column({ type: 'varchar', nullable: true }) erpGroupLabel!: string | null;
    @Column({ type: 'int', default: 0 }) version!: number;
}

// Required by the EXISTS subquery in the mocked applyOwnCounterpartyFilter; must be a real table
// even though no rows are inserted here.
@Entity('counterparty_team_member')
class TestCounterpartyTeamMember {
    @PrimaryGeneratedColumn('uuid')
    id!: string;

    @Column({ type: 'varchar' }) counterpartyId!: string;
    @Column({ type: 'varchar' }) administratorId!: string;
    @Column({ type: 'varchar' }) role!: string;
}

let dataSource: DataSource;
let service: CounterpartyService;
const mockCtx = {} as RequestContext;
const mockAccessScopeService = {
    resolveCounterpartyScope: vi.fn(),
    assertCounterpartyWritableInScope: vi.fn(),
    managerClause: vi.fn(() => null),
    // Real implementation (mirrors AccessScopeService.applyOwnCounterpartyFilter) so these real-
    // Postgres tests exercise the actual EXISTS-subquery SQL, not a no-op.
    applyOwnCounterpartyFilter: vi.fn(
        (
            qb: { andWhere: (sql: string, params: Record<string, unknown>) => unknown },
            alias: string,
            scope: { administratorId?: string },
        ) =>
            qb.andWhere(
                `(${alias}."assignedManagerId" = :ownScopeAdminId OR EXISTS (
                SELECT 1 FROM counterparty_team_member ctm
                WHERE ctm."counterpartyId" = ${alias}.id::text
                AND ctm."administratorId" = :ownScopeAdminId
            ))`,
                { ownScopeAdminId: scope.administratorId ?? null },
            ),
    ),
};

const { schema, extra } = testSchemaOptions('counterparty_access_scope');

beforeAll(async () => {
    await createTestSchema(schema);
    dataSource = new DataSource({
        type: 'postgres',
        ...testDataSourceConnectionOptions(),
        schema,
        extra,
        entities: [TestCounterparty, TestCounterpartyTeamMember],
        synchronize: true,
    });
    await dataSource.initialize();

    const connectionShim = {
        getRepository: () => dataSource.getRepository(TestCounterparty),
    } as unknown as TransactionalConnection;

    service = new CounterpartyService(
        connectionShim,
        { update: vi.fn() } as never,
        { assignCustomerPriceTypeByCode: vi.fn() } as never,
        mockAccessScopeService as unknown as AccessScopeService,
        { publish: vi.fn() } as never,
    );
});

afterAll(async () => {
    await dataSource.destroy();
    await dropTestSchema(schema);
});

beforeEach(async () => {
    await dataSource.getRepository(TestCounterparty).clear();
    mockAccessScopeService.resolveCounterpartyScope.mockReset();
    mockAccessScopeService.assertCounterpartyWritableInScope.mockReset();
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

    // departmentId must never gate Counterparty visibility; branchId is the real gate for
    // 'department'-kind scope, so a branch-scoped caller sees only its own branch's counterparties.
    it('"department" scope sees only counterparties in its own branch, not another branch', async () => {
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

    // Unassigned Counterparty.branchId must stay hidden from all branch-scoped roles, so no
    // `OR branchId IS NULL` carve-out, unlike Order/ProformaInvoice's denormalized-branch filter.
    it('"department" scope never sees a Counterparty with no branchId assigned', async () => {
        await dataSource.getRepository(TestCounterparty).save([
            {
                erpId: 'cp-unassigned',
                legalName: 'Unassigned LLC',
                shortName: 'Unassigned',
                assignedManagerId: null,
                departmentId: null,
                branchId: null,
            },
        ]);
        mockAccessScopeService.resolveCounterpartyScope.mockResolvedValue({
            kind: 'department',
            departmentId: 'dept-1',
            branchId: 'branch-a',
        });

        const result = await service.findVisible(mockCtx);

        expect(result.map(c => c.erpId)).not.toContain('cp-unassigned');
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

// applyVisibilityScope's SQL (andWhere, ILIKE, aggregates) can't be meaningfully verified
// with a mocked repository, so this runs against real Postgres.
describe('CounterpartyService.findVisiblePage/findOneVisible/getSummary/findHighUsage (integration, real Postgres)', () => {
    beforeEach(() => {
        mockAccessScopeService.resolveCounterpartyScope.mockResolvedValue({ kind: 'all' });
    });

    it('findVisiblePage paginates with take/skip and reports totalItems independent of page size', async () => {
        await seedCounterparties();

        const page1 = await service.findVisiblePage(mockCtx, { take: 2, skip: 0 });
        const page2 = await service.findVisiblePage(mockCtx, { take: 2, skip: 2 });

        expect(page1.totalItems).toBe(3);
        expect(page2.totalItems).toBe(3);
        expect(page1.items).toHaveLength(2);
        expect(page2.items).toHaveLength(1);
    });

    it('findVisiblePage search filters by shortName/legalName/inn substring', async () => {
        await seedCounterparties();

        const result = await service.findVisiblePage(mockCtx, { search: 'Own Mine' });

        expect(result.items.map(c => c.erpId)).toEqual(['cp-own-mine']);
    });

    it('findVisiblePage erpIds returns only the listed ids and stays inside the scope', async () => {
        await seedCounterparties();
        mockAccessScopeService.resolveCounterpartyScope.mockResolvedValue({
            kind: 'own',
            administratorId: 'admin-1',
        });

        const result = await service.findVisiblePage(mockCtx, {
            erpIds: ['cp-own-mine', 'cp-own-other'],
        });

        expect(result.items.map(c => c.erpId)).toEqual(['cp-own-mine']);
        expect((await service.findVisiblePage(mockCtx, { erpIds: [] })).items).toEqual([]);
    });

    it('findVisiblePage still respects scope (own sees only their own row)', async () => {
        await seedCounterparties();
        mockAccessScopeService.resolveCounterpartyScope.mockResolvedValue({
            kind: 'own',
            administratorId: 'admin-2',
        });

        const result = await service.findVisiblePage(mockCtx, {});

        expect(result.items.map(c => c.erpId)).toEqual(['cp-own-other']);
        expect(result.totalItems).toBe(1);
    });

    // 'department'-kind scope filters by branchId: a caller is in scope only for counterparties
    // whose branchId matches its own.
    it('findOneVisible returns the entity when in scope, null when outside scope', async () => {
        await seedCounterparties();
        const all = await dataSource.getRepository(TestCounterparty).find();
        const ownMine = all.find(c => c.erpId === 'cp-own-mine')!;
        const otherDept = all.find(c => c.erpId === 'cp-other-dept')!;
        mockAccessScopeService.resolveCounterpartyScope.mockResolvedValue({
            kind: 'department',
            departmentId: 'dept-1',
            branchId: 'branch-a',
        });

        const inScope = await service.findOneVisible(mockCtx, ownMine.id);
        const outOfScope = await service.findOneVisible(mockCtx, otherDept.id);

        expect(inScope?.erpId).toBe('cp-own-mine');
        expect(outOfScope).toBeNull();
    });

    it('getSummary computes real SQL aggregates (count/active/creditBalance/highUsage), not a full-list reduce', async () => {
        await dataSource.getRepository(TestCounterparty).save([
            {
                erpId: 'cp-a',
                legalName: 'A',
                shortName: 'A',
                isActive: true,
                creditLimit: 1000,
                creditBalance: 900,
            },
            {
                erpId: 'cp-b',
                legalName: 'B',
                shortName: 'B',
                isActive: true,
                creditLimit: 1000,
                creditBalance: 100,
            },
            {
                erpId: 'cp-c',
                legalName: 'C',
                shortName: 'C',
                isActive: false,
                creditLimit: 0,
                creditBalance: 0,
            },
        ]);

        const summary = await service.getSummary(mockCtx);

        expect(summary.totalCount).toBe(3);
        expect(summary.activeCount).toBe(2);
        expect(summary.totalCreditBalance).toBe(1000);
        expect(summary.highUsageCount).toBe(1); // only cp-a is >= 80% (900/1000)
    });

    it('findHighUsage returns only counterparties at/above 80% usage, ordered, limited', async () => {
        await dataSource.getRepository(TestCounterparty).save([
            {
                erpId: 'cp-low',
                legalName: 'Low',
                shortName: 'Low',
                creditLimit: 1000,
                creditBalance: 100,
            },
            {
                erpId: 'cp-high',
                legalName: 'High',
                shortName: 'High',
                creditLimit: 1000,
                creditBalance: 950,
            },
            {
                erpId: 'cp-mid-high',
                legalName: 'MidHigh',
                shortName: 'MidHigh',
                creditLimit: 1000,
                creditBalance: 800,
            },
        ]);

        const result = await service.findHighUsage(mockCtx, 5);

        expect(result.map(c => c.erpId)).toEqual(['cp-high', 'cp-mid-high']);
    });

    it('findVisiblePage filters by groupLabel (exact match)', async () => {
        await dataSource.getRepository(TestCounterparty).save([
            { erpId: 'cp-acct-1', legalName: 'A1', shortName: 'A1', erpGroupLabel: 'Accounting' },
            { erpId: 'cp-acct-2', legalName: 'A2', shortName: 'A2', erpGroupLabel: 'Accounting' },
            { erpId: 'cp-sales-1', legalName: 'S1', shortName: 'S1', erpGroupLabel: 'Sales' },
        ]);

        const result = await service.findVisiblePage(mockCtx, { groupLabel: 'Accounting' });

        expect(result.items.map(c => c.erpId).sort()).toEqual(['cp-acct-1', 'cp-acct-2']);
        expect(result.totalItems).toBe(2);
    });

    it('findVisiblePage groupLabel filter with no matches returns an empty page', async () => {
        await seedCounterparties();

        const result = await service.findVisiblePage(mockCtx, { groupLabel: 'Nonexistent' });

        expect(result.items).toEqual([]);
        expect(result.totalItems).toBe(0);
    });

    it('findVisiblePage sorts by a requested real column, descending', async () => {
        await dataSource.getRepository(TestCounterparty).save([
            { erpId: 'cp-alpha', legalName: 'Alpha', shortName: 'Alpha' },
            { erpId: 'cp-charlie', legalName: 'Charlie', shortName: 'Charlie' },
            { erpId: 'cp-bravo', legalName: 'Bravo', shortName: 'Bravo' },
        ]);

        const result = await service.findVisiblePage(mockCtx, { sort: { shortName: 'DESC' } });

        expect(result.items.map(c => c.shortName)).toEqual(['Charlie', 'Bravo', 'Alpha']);
    });

    it('findVisiblePage falls back to shortName ASC when no sort is requested', async () => {
        await dataSource.getRepository(TestCounterparty).save([
            { erpId: 'cp-alpha', legalName: 'Alpha', shortName: 'Alpha' },
            { erpId: 'cp-charlie', legalName: 'Charlie', shortName: 'Charlie' },
            { erpId: 'cp-bravo', legalName: 'Bravo', shortName: 'Bravo' },
        ]);

        const result = await service.findVisiblePage(mockCtx, {});

        expect(result.items.map(c => c.shortName)).toEqual(['Alpha', 'Bravo', 'Charlie']);
    });

    it('findVisiblePage unassignedOnly returns only counterparties with no assigned manager', async () => {
        await dataSource.getRepository(TestCounterparty).save([
            { erpId: 'cp-assigned', legalName: 'X', shortName: 'X', assignedManagerId: 'admin-1' },
            { erpId: 'cp-orphan-1', legalName: 'Y', shortName: 'Y', assignedManagerId: null },
            { erpId: 'cp-orphan-2', legalName: 'Z', shortName: 'Z', assignedManagerId: null },
        ]);

        const result = await service.findVisiblePage(mockCtx, { unassignedOnly: true });

        expect(result.items.map(c => c.erpId).sort()).toEqual(['cp-orphan-1', 'cp-orphan-2']);
        expect(result.totalItems).toBe(2);
    });

    // unassignedOnly must still apply the branchId scope gate, as any listing does;
    // departmentId never gates Counterparty visibility.
    it('findVisiblePage unassignedOnly still respects the access scope (department sees only its own branch orphans)', async () => {
        await dataSource.getRepository(TestCounterparty).save([
            {
                erpId: 'cp-orphan-dept1',
                legalName: 'D1',
                shortName: 'D1',
                assignedManagerId: null,
                departmentId: 'dept-1',
                branchId: 'branch-a',
            },
            {
                erpId: 'cp-orphan-dept2',
                legalName: 'D2',
                shortName: 'D2',
                assignedManagerId: null,
                departmentId: 'dept-2',
                branchId: 'branch-b',
            },
        ]);
        mockAccessScopeService.resolveCounterpartyScope.mockResolvedValue({
            kind: 'department',
            departmentId: 'dept-1',
            branchId: 'branch-a',
        });

        const result = await service.findVisiblePage(mockCtx, { unassignedOnly: true });

        expect(result.items.map(c => c.erpId)).toEqual(['cp-orphan-dept1']);
    });

    it("countUnassigned counts real orphan rows within the caller's access scope", async () => {
        await dataSource.getRepository(TestCounterparty).save([
            { erpId: 'cp-assigned', legalName: 'X', shortName: 'X', assignedManagerId: 'admin-1' },
            { erpId: 'cp-orphan-1', legalName: 'Y', shortName: 'Y', assignedManagerId: null },
            { erpId: 'cp-orphan-2', legalName: 'Z', shortName: 'Z', assignedManagerId: null },
        ]);

        const count = await service.countUnassigned(mockCtx);

        expect(count).toBe(2);
    });
});

describe('CounterpartyService.visibleErpIds (integration, real Postgres)', () => {
    it('"own" scope lists only the caller\'s counterparties', async () => {
        await seedCounterparties();
        mockAccessScopeService.resolveCounterpartyScope.mockResolvedValue({
            kind: 'own',
            administratorId: 'admin-1',
        });

        expect(await service.visibleErpIds(mockCtx, 100)).toEqual(['cp-own-mine']);
    });

    it('"department" scope lists its branch\'s counterparties in a stable order', async () => {
        await seedCounterparties();
        mockAccessScopeService.resolveCounterpartyScope.mockResolvedValue({
            kind: 'department',
            departmentId: 'dept-1',
            branchId: 'branch-a',
        });

        expect(await service.visibleErpIds(mockCtx, 100)).toEqual(['cp-own-mine', 'cp-own-other']);
    });

    it('"all" scope returns null: no restriction to pass on', async () => {
        await seedCounterparties();
        mockAccessScopeService.resolveCounterpartyScope.mockResolvedValue({ kind: 'all' });

        expect(await service.visibleErpIds(mockCtx, 100)).toBeNull();
    });

    it('fails above the ceiling instead of returning a partial list', async () => {
        await seedCounterparties();
        mockAccessScopeService.resolveCounterpartyScope.mockResolvedValue({
            kind: 'department',
            departmentId: 'dept-1',
            branchId: 'branch-a',
        });

        await expect(service.visibleErpIds(mockCtx, 1)).rejects.toBeInstanceOf(QueryTooLargeError);
    });
});
