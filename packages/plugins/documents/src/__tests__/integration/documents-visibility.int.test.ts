import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { Column, DataSource, Entity, PrimaryGeneratedColumn } from 'typeorm';
import type { RequestContext, TransactionalConnection } from '@vendure/core';
import type { AccessScopeService } from '@mivend/plugin-access-control';
import { CounterpartyService } from '@mivend/plugin-counterparty';
import {
    createTestSchema,
    dropTestSchema,
    testDataSourceConnectionOptions,
    testSchemaOptions,
} from 'shared';
import { DocumentsService } from '../../documents.service';

@Entity('counterparty')
class TestCounterparty {
    @PrimaryGeneratedColumn() id!: number;
    @Column({ type: 'varchar' }) erpId!: string;
    @Column({ type: 'varchar' }) shortName!: string;
    @Column({ type: 'varchar', nullable: true }) branchId!: string | null;
}

@Entity('document')
class TestDocument {
    @PrimaryGeneratedColumn() id!: number;
    @Column({ type: 'varchar' }) type!: string;
    @Column({ type: 'varchar' }) counterpartyId!: string;
    @Column({ type: 'varchar', nullable: true }) orderId!: string | null;
    @Column({ type: 'varchar' }) number!: string;
    @Column({ type: 'timestamp' }) issueDate!: Date;
    @Column({ type: 'varchar', default: 'pending' }) status!: string;
}

let dataSource: DataSource;
let service: DocumentsService;
let counterpartyService: CounterpartyService;
let ids: Record<'a1' | 'a2' | 'b1', string>;
const mockCtx = {} as RequestContext;
const scope = vi.fn(async () => ({ kind: 'all' }) as Record<string, unknown>);
const accessScope = { resolveCounterpartyScope: scope, managerClause: vi.fn(() => null) };
const { schema, extra } = testSchemaOptions('documents_visibility');

const numbers = (page: { items: unknown[] }): string[] =>
    (page.items as TestDocument[]).map(d => d.number);

beforeAll(async () => {
    await createTestSchema(schema);
    dataSource = new DataSource({
        type: 'postgres',
        ...testDataSourceConnectionOptions(),
        schema,
        extra,
        entities: [TestCounterparty, TestDocument],
        synchronize: true,
    });
    await dataSource.initialize();
    const connectionShim = {
        getRepository: (_ctx: RequestContext, entity: { name: string }) =>
            dataSource.getRepository(entity.name === 'Document' ? TestDocument : TestCounterparty),
    } as unknown as TransactionalConnection;
    counterpartyService = new CounterpartyService(
        connectionShim,
        { update: vi.fn() } as never,
        { assignCustomerPriceTypeByCode: vi.fn() } as never,
        accessScope as unknown as AccessScopeService,
        { publish: vi.fn() } as never,
    );
    service = new DocumentsService(connectionShim, counterpartyService);
});

afterAll(async () => {
    await dataSource.destroy();
    await dropTestSchema(schema);
});

beforeEach(async () => {
    scope.mockResolvedValue({ kind: 'all' });
    await dataSource.query('TRUNCATE document, counterparty RESTART IDENTITY');
    const cps = await dataSource.getRepository(TestCounterparty).save([
        { erpId: 'a1', shortName: 'Alpha 1', branchId: 'branch-a' },
        { erpId: 'a2', shortName: 'Alpha 2', branchId: 'branch-a' },
        { erpId: 'b1', shortName: 'Beta 1', branchId: 'branch-b' },
    ]);
    ids = { a1: String(cps[0].id), a2: String(cps[1].id), b1: String(cps[2].id) };
    const doc = (counterpartyId: string, number: string, type: string, day: number) => ({
        counterpartyId,
        number,
        type,
        issueDate: new Date(Date.UTC(2026, 0, day)),
    });
    await dataSource
        .getRepository(TestDocument)
        .save([
            doc(ids.a1, 'A1-1', 'invoice', 1),
            doc(ids.a2, 'A2-1', 'waybill', 2),
            doc(ids.b1, 'B1-1', 'contract', 3),
        ]);
});

const asBranchA = (): void =>
    void scope.mockResolvedValue({ kind: 'department', branchId: 'branch-a' });

describe('DocumentsService visibility via counterparty subquery (real Postgres)', () => {
    it('scope all sees every document, newest first', async () => {
        const page = await service.findVisible(mockCtx);
        expect(numbers(page)).toEqual(['B1-1', 'A2-1', 'A1-1']);
        expect(page.totalItems).toBe(3);
    });

    it('a limited scope sees only documents of visible counterparties', async () => {
        asBranchA();
        const page = await service.findVisible(mockCtx);
        expect(numbers(page)).toEqual(['A2-1', 'A1-1']);
        expect(page.totalItems).toBe(2);
    });

    it('a counterpartyId outside the scope yields an empty result, inside it narrows', async () => {
        asBranchA();
        expect(await service.findVisible(mockCtx, undefined, ids.b1)).toEqual({
            items: [],
            totalItems: 0,
        });
        expect(numbers(await service.findVisible(mockCtx, undefined, ids.a2))).toEqual(['A2-1']);
    });

    it('a non-numeric counterpartyId is bound as a parameter and matches nothing', async () => {
        const page = await service.findVisible(mockCtx, undefined, "1' OR '1'='1");
        expect(page.totalItems).toBe(0);
    });

    it('keeps take, skip and the take<=0 count path', async () => {
        asBranchA();
        expect(numbers(await service.findVisible(mockCtx, { take: 1, skip: 1 }))).toEqual(['A1-1']);
        expect(await service.findVisible(mockCtx, { take: 0 })).toEqual({
            items: [],
            totalItems: 2,
        });
    });

    it('combines scope with type, status and number filters', async () => {
        asBranchA();
        expect(numbers(await service.findVisible(mockCtx, { type: 'WAY' }))).toEqual(['A2-1']);
        expect(numbers(await service.findVisible(mockCtx, { types: ['contract'] }))).toEqual([]);
        expect(numbers(await service.findVisible(mockCtx, { search: 'a1' }))).toEqual(['A1-1']);
    });

    it('findVisibleTypes returns distinct sorted types within the scope only', async () => {
        asBranchA();
        expect(await service.findVisibleTypes(mockCtx)).toEqual(['invoice', 'waybill']);
        expect(await service.findVisibleTypes(mockCtx, ids.b1)).toEqual([]);
        scope.mockResolvedValue({ kind: 'all' });
        expect(await service.findVisibleTypes(mockCtx)).toEqual(['contract', 'invoice', 'waybill']);
    });

    it('never materializes the visible counterparties', async () => {
        const spy = vi.spyOn(counterpartyService, 'findVisible');
        asBranchA();
        await service.findVisible(mockCtx);
        await service.findVisibleTypes(mockCtx);
        expect(spy).not.toHaveBeenCalled();
        spy.mockRestore();
    });
});
