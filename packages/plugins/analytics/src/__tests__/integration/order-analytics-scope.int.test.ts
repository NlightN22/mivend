import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { Column, DataSource, DeleteDateColumn, Entity, PrimaryGeneratedColumn } from 'typeorm';
import type { RequestContext, TransactionalConnection } from '@vendure/core';
import { Administrator } from '@vendure/core';
import type { AccessScope, AccessScopeService } from '@mivend/plugin-access-control';
import { Counterparty, TradingPoint } from '@mivend/plugin-counterparty';
import type { CounterpartyService } from '@mivend/plugin-counterparty';
import {
    createTestSchema,
    dropTestSchema,
    testDataSourceConnectionOptions,
    testSchemaOptions,
} from 'shared';

import { OrderAnalyticsLabelsService } from '../../order-analytics/order-analytics-labels.service';
import { OrderAnalyticsScopeService } from '../../order-analytics/order-analytics-scope.service';

// Vendure's Administrator and the plugin entities need bootstrap(); mirror tables stand in, as in the team directory tests.
class TestAdminCustomFields {
    @Column({ name: 'customFieldsErpid', type: 'varchar', nullable: true })
    erpId!: string | null;

    @Column({ name: 'customFieldsDepartmentid', type: 'varchar', nullable: true })
    departmentId!: string | null;
}

@Entity('administrator')
class TestAdministrator {
    @PrimaryGeneratedColumn()
    id!: number;

    @Column({ type: 'varchar' }) firstName!: string;
    @Column({ type: 'varchar' }) lastName!: string;
    @Column({ type: 'varchar' }) emailAddress!: string;

    @DeleteDateColumn({ type: 'timestamp', nullable: true })
    deletedAt!: Date | null;

    @Column(() => TestAdminCustomFields)
    customFields!: TestAdminCustomFields;
}

@Entity('counterparty')
class TestCounterparty {
    @PrimaryGeneratedColumn()
    id!: number;

    @Column({ type: 'varchar' }) erpId!: string;
    @Column({ type: 'varchar' }) legalName!: string;
    @Column({ type: 'varchar' }) shortName!: string;
}

@Entity('trading_point')
class TestTradingPoint {
    @PrimaryGeneratedColumn()
    id!: number;

    @Column({ type: 'varchar' }) erpId!: string;
    @Column({ type: 'varchar' }) name!: string;
}

@Entity('erp_user')
class TestErpUser {
    @PrimaryGeneratedColumn()
    id!: number;

    @Column({ type: 'varchar' }) erpId!: string;
    @Column({ type: 'varchar', nullable: true }) fullName!: string | null;
}

@Entity('organization_requisites')
class TestOrganization {
    @PrimaryGeneratedColumn()
    id!: number;

    @Column({ type: 'varchar' }) erpId!: string;
    @Column({ type: 'varchar' }) legalName!: string;
}

const ctx = {} as RequestContext;
const { schema, extra } = testSchemaOptions('analytics_order_scope');
const resolveTeamVisibilityScope = vi.fn<() => Promise<AccessScope>>();
const visibleErpIds = vi.fn();
const findOneVisible = vi.fn();
let dataSource: DataSource;
let scopeService: OrderAnalyticsScopeService;
let labelsService: OrderAnalyticsLabelsService;

beforeAll(async () => {
    await createTestSchema(schema);
    dataSource = new DataSource({
        type: 'postgres',
        ...testDataSourceConnectionOptions(),
        schema,
        extra,
        entities: [
            TestAdministrator,
            TestCounterparty,
            TestTradingPoint,
            TestErpUser,
            TestOrganization,
        ],
        synchronize: true,
    });
    await dataSource.initialize();
    const byEntity = new Map<unknown, unknown>([
        [Administrator, TestAdministrator],
        [Counterparty, TestCounterparty],
        [TradingPoint, TestTradingPoint],
        ['ErpUser', TestErpUser],
        ['OrganizationRequisites', TestOrganization],
    ]);
    const connection = {
        getRepository: (_ctx: unknown, entity: unknown) =>
            dataSource.getRepository(byEntity.get(entity) as never),
    } as unknown as TransactionalConnection;
    scopeService = new OrderAnalyticsScopeService(
        { visibleErpIds, findOneVisible } as unknown as CounterpartyService,
        { resolveTeamVisibilityScope } as unknown as AccessScopeService,
        connection,
    );
    labelsService = new OrderAnalyticsLabelsService(connection);
});

afterAll(async () => {
    await dataSource.destroy();
    await dropTestSchema(schema);
});

beforeEach(async () => {
    for (const entity of [
        TestAdministrator,
        TestCounterparty,
        TestTradingPoint,
        TestErpUser,
        TestOrganization,
    ]) {
        await dataSource.getRepository(entity).createQueryBuilder().delete().execute();
    }
    resolveTeamVisibilityScope.mockReset();
});

async function seedAdministrators(): Promise<number[]> {
    const rows = await dataSource.getRepository(TestAdministrator).save([
        {
            firstName: 'A',
            lastName: 'One',
            emailAddress: 'a@example.test',
            customFields: { erpId: 'm-a', departmentId: 'dept-1' },
        },
        {
            firstName: 'B',
            lastName: 'Two',
            emailAddress: 'b@example.test',
            customFields: { erpId: 'm-b', departmentId: 'dept-1' },
        },
        {
            firstName: 'C',
            lastName: 'Three',
            emailAddress: 'c@example.test',
            customFields: { erpId: 'm-c', departmentId: 'dept-2' },
        },
        {
            firstName: 'D',
            lastName: 'Four',
            emailAddress: 'd@example.test',
            customFields: { erpId: null, departmentId: 'dept-1' },
        },
    ]);
    return rows.map(r => r.id);
}

describe('OrderAnalyticsScopeService.visibleManagerErpIds (real Postgres)', () => {
    it('returns null for a viewer who sees the whole team', async () => {
        await seedAdministrators();
        resolveTeamVisibilityScope.mockResolvedValue({ kind: 'all' });

        expect(await scopeService.visibleManagerErpIds(ctx)).toBeNull();
    });

    it('"own" sees only the viewer\'s own ERP id', async () => {
        const [, idB] = await seedAdministrators();
        resolveTeamVisibilityScope.mockResolvedValue({ kind: 'own', administratorId: idB });

        expect(await scopeService.visibleManagerErpIds(ctx)).toEqual(['m-b']);
    });

    it('"department" sees its own department\'s managers with an ERP id, not another department', async () => {
        await seedAdministrators();
        resolveTeamVisibilityScope.mockResolvedValue({
            kind: 'department',
            departmentId: 'dept-1',
        });

        expect((await scopeService.visibleManagerErpIds(ctx))?.sort()).toEqual(['m-a', 'm-b']);
    });

    it('"department" adds the granted managers outside the department', async () => {
        const [, , idC] = await seedAdministrators();
        resolveTeamVisibilityScope.mockResolvedValue({
            kind: 'department',
            departmentId: 'dept-1',
            grantedManagerIds: [String(idC)],
        });

        expect((await scopeService.visibleManagerErpIds(ctx))?.sort()).toEqual([
            'm-a',
            'm-b',
            'm-c',
        ]);
    });

    it('never lists a soft-deleted manager', async () => {
        const [idA] = await seedAdministrators();
        await dataSource.getRepository(TestAdministrator).softDelete(idA);
        resolveTeamVisibilityScope.mockResolvedValue({
            kind: 'department',
            departmentId: 'dept-1',
        });

        expect(await scopeService.visibleManagerErpIds(ctx)).toEqual(['m-b']);
    });
});

describe('OrderAnalyticsScopeService pinned entities', () => {
    it("finds a manager's ERP id and none for an unlinked or missing manager", async () => {
        const [idA, , , idD] = await seedAdministrators();

        expect(await scopeService.managerErpIdFor(ctx, String(idA))).toBe('m-a');
        expect(await scopeService.managerErpIdFor(ctx, String(idD))).toBeNull();
        expect(await scopeService.managerErpIdFor(ctx, '999999')).toBeNull();
    });

    it("finds a visible customer's ERP id and none for a hidden one", async () => {
        findOneVisible.mockResolvedValueOnce({ erpId: 'c1' }).mockResolvedValueOnce(null);

        expect(await scopeService.customerErpIdFor(ctx, '1')).toBe('c1');
        expect(await scopeService.customerErpIdFor(ctx, '2')).toBeNull();
    });
});

describe('OrderAnalyticsScopeService.visibleCustomerErpIds', () => {
    it("asks the counterparty service for the viewer's visible ERP ids with the ceiling", async () => {
        visibleErpIds.mockResolvedValue(['c1']);

        expect(await scopeService.visibleCustomerErpIds(ctx)).toEqual(['c1']);
        expect(visibleErpIds).toHaveBeenCalledWith(ctx, 20_000);
    });
});

describe('OrderAnalyticsLabelsService (real Postgres)', () => {
    it('resolves a name per dimension by ERP id', async () => {
        await dataSource
            .getRepository(TestCounterparty)
            .save({ erpId: 'c1', legalName: 'Legal One LLC', shortName: 'One' });
        await dataSource
            .getRepository(TestCounterparty)
            .save({ erpId: 'c2', legalName: 'Legal Two LLC', shortName: '' });
        await dataSource.getRepository(TestTradingPoint).save({ erpId: 'p1', name: 'Point One' });
        await dataSource.getRepository(TestErpUser).save({ erpId: 'm1', fullName: 'Manager One' });
        await dataSource
            .getRepository(TestOrganization)
            .save({ erpId: 'o1', legalName: 'Org One' });

        expect(await labelsService.labelsFor(ctx, 'CUSTOMER', ['c1', 'c2', 'unknown'])).toEqual(
            new Map([
                ['c1', 'One'],
                ['c2', 'Legal Two LLC'],
            ]),
        );
        expect(await labelsService.labelsFor(ctx, 'POINT_OF_SALE', ['p1'])).toEqual(
            new Map([['p1', 'Point One']]),
        );
        expect(await labelsService.labelsFor(ctx, 'MANAGER', ['m1'])).toEqual(
            new Map([['m1', 'Manager One']]),
        );
        expect(await labelsService.labelsFor(ctx, 'ORGANIZATION', ['o1'])).toEqual(
            new Map([['o1', 'Org One']]),
        );
    });

    it('returns no labels for no dimension or no ids', async () => {
        expect((await labelsService.labelsFor(ctx, 'NONE', ['x'])).size).toBe(0);
        expect((await labelsService.labelsFor(ctx, 'CUSTOMER', [])).size).toBe(0);
    });
});
