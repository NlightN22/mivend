import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { Column, DataSource, Entity, EntityManager, Index, PrimaryGeneratedColumn } from 'typeorm';
import type { RequestContext, TransactionalConnection } from '@vendure/core';
import {
    createTestSchema,
    dropTestSchema,
    testDataSourceConnectionOptions,
    testSchemaOptions,
} from 'shared';
import { DocumentsService } from '../../documents.service';
import { OrganizationEventService } from '../../organization-event.service';

// Real Vendure entities need EntityIdStrategy from bootstrap() or they lack a primary column.
// So tests hand-roll tables matching prod schema and run against real Postgres, not mocks.

@Entity('document')
@Index(['counterpartyId', 'issueDate'])
class TestDocument {
    @PrimaryGeneratedColumn()
    id!: number;

    @Column({ type: 'varchar' }) type!: string;
    @Column({ type: 'varchar' }) counterpartyId!: string;
    @Column({ type: 'varchar', nullable: true }) orderId!: string | null;
    @Column({ type: 'varchar' }) number!: string;
    @Column({ type: 'timestamp' }) issueDate!: Date;
    @Column({ type: 'bigint', nullable: true }) amount!: number | null;
    @Column({ type: 'varchar', nullable: true }) currencyCode!: string | null;
    @Column({ type: 'varchar', default: 'pending' }) status!: string;
    @Column({ type: 'varchar' }) source!: string;
    @Column({ type: 'varchar', nullable: true }) assetId!: string | null;
    @Column({ type: 'varchar', nullable: true }) fileUrl!: string | null;
    @Column({ type: 'varchar', nullable: true }) erpId!: string | null;
    @Column({ type: 'simple-json', nullable: true }) metadata!: Record<string, unknown> | null;
}

@Entity('organization_requisites')
@Index(['erpId'], { unique: true })
class TestOrganizationRequisites {
    @PrimaryGeneratedColumn()
    id!: number;

    @Column({ type: 'varchar' }) erpId!: string;
    @Column({ type: 'varchar' }) legalName!: string;
    @Column({ type: 'varchar', nullable: true }) inn!: string | null;
    @Column({ type: 'varchar', nullable: true }) kpp!: string | null;
    @Column({ type: 'varchar', nullable: true }) ogrn!: string | null;
    @Column({ type: 'varchar', nullable: true }) legalAddress!: string | null;
    @Column({ type: 'varchar', nullable: true }) bankName!: string | null;
    @Column({ type: 'varchar', nullable: true }) bankAccount!: string | null;
    @Column({ type: 'varchar', nullable: true }) bankBik!: string | null;
    @Column({ type: 'varchar', nullable: true }) correspondentAccount!: string | null;
    @Column({ type: 'varchar', nullable: true }) phone!: string | null;
    @Column({ type: 'varchar', nullable: true }) signatoryName!: string | null;
    @Column({ type: 'varchar', nullable: true }) signatoryTitle!: string | null;
    @Column({ type: 'boolean', default: true }) isActive!: boolean;
}

let dataSource: DataSource;
let service: DocumentsService;
let eventService: OrganizationEventService;
const mockCtx = {} as RequestContext;
const mockCounterpartyService = { findByErpId: vi.fn() };

const { schema, extra } = testSchemaOptions('documents_service');

beforeAll(async () => {
    await createTestSchema(schema);
    dataSource = new DataSource({
        type: 'postgres',
        ...testDataSourceConnectionOptions(),
        schema,
        extra,
        entities: [TestDocument, TestOrganizationRequisites],
        synchronize: true,
    });
    await dataSource.initialize();

    const entityMap = {
        document: TestDocument,
        organization_requisites: TestOrganizationRequisites,
    };
    const connectionShim = {
        getRepository: (ctx: RequestContext, entity: { name: string } | string) => {
            const manager = (ctx as unknown as { __manager?: EntityManager }).__manager;
            if (typeof entity === 'string') {
                return { query: (sql: string, params?: unknown[]) => manager!.query(sql, params) };
            }
            const testEntity =
                entityMap[entity.name === 'Document' ? 'document' : 'organization_requisites'];
            return (manager ?? dataSource).getRepository(testEntity);
        },
        withTransaction: async (
            ctx: RequestContext,
            work: (c: RequestContext) => Promise<unknown>,
        ) =>
            (ctx as unknown as { __manager?: EntityManager }).__manager
                ? work(ctx)
                : dataSource.transaction(manager =>
                      work({ ...ctx, __manager: manager } as unknown as RequestContext),
                  ),
        rawConnection: dataSource,
    } as unknown as TransactionalConnection;

    eventService = new OrganizationEventService(connectionShim, {
        enqueue: async () => undefined,
    } as never);
    service = new DocumentsService(connectionShim, mockCounterpartyService as never);
});

afterAll(async () => {
    await dataSource.destroy();
    await dropTestSchema(schema);
});

beforeEach(async () => {
    await dataSource.getRepository(TestDocument).clear();
    await dataSource.getRepository(TestOrganizationRequisites).clear();
    mockCounterpartyService.findByErpId.mockReset();
});

describe('DocumentsService (integration, real Postgres)', () => {
    it('concurrent organization events keep one row and every provided field', async () => {
        const fields = ['inn', 'kpp', 'ogrn', 'legalAddress', 'bankName', 'phone'] as const;
        await Promise.all(
            fields.map(field =>
                eventService.upsertFromEvent(mockCtx, 'org-9', {
                    legalName: 'Acme',
                    isActive: true,
                    fields: { [field]: `v-${field}` },
                }),
            ),
        );

        const rows = await dataSource.getRepository(TestOrganizationRequisites).find();
        expect(rows).toHaveLength(1);
        for (const field of fields) expect(rows[0][field]).toBe(`v-${field}`);
    });

    it('upsertFromErp is idempotent: the same erpId never creates a second row', async () => {
        mockCounterpartyService.findByErpId.mockResolvedValue({ id: '1' });
        const record = {
            erpId: 'doc-1',
            type: 'return',
            counterpartyErpId: 'cnt-001',
            number: 'RET-1',
            issueDate: '2026-07-01T00:00:00.000Z',
            amount: 1000,
            currencyCode: 'RUB',
        };

        await service.upsertFromErp(mockCtx, record);
        await service.upsertFromErp(mockCtx, { ...record, number: 'RET-1-UPDATED' });

        const rows = await dataSource
            .getRepository(TestDocument)
            .find({ where: { erpId: 'doc-1' } });
        expect(rows).toHaveLength(1);
        expect(rows[0].number).toBe('RET-1-UPDATED');
    });

    it('findForCounterparty only returns documents for that counterparty (no cross-tenant leak)', async () => {
        mockCounterpartyService.findByErpId.mockImplementation(async (_ctx, erpId: string) => ({
            id: erpId === 'cnt-001' ? '1' : '2',
        }));

        await service.upsertFromErp(mockCtx, {
            erpId: 'doc-a',
            type: 'return',
            counterpartyErpId: 'cnt-001',
            number: 'RET-A',
            issueDate: '2026-07-01T00:00:00.000Z',
        });
        await service.upsertFromErp(mockCtx, {
            erpId: 'doc-b',
            type: 'return',
            counterpartyErpId: 'cnt-002',
            number: 'RET-B',
            issueDate: '2026-07-01T00:00:00.000Z',
        });

        const forCounterparty1 = await service.findForCounterparty(mockCtx, '1');
        expect(forCounterparty1.totalItems).toBe(1);
        expect((forCounterparty1.items[0] as unknown as TestDocument).number).toBe('RET-A');

        const forCounterparty2 = await service.findForCounterparty(mockCtx, '2');
        expect(forCounterparty2.totalItems).toBe(1);
        expect((forCounterparty2.items[0] as unknown as TestDocument).number).toBe('RET-B');
    });

    it('upsertRequisites is idempotent by erpId against the real DB', async () => {
        const record = {
            erpId: 'org-1',
            legalName: 'Demo Co',
            inn: '000000000000',
            legalAddress: '1 Demo Ave',
        };
        await service.upsertRequisites(mockCtx, record);
        await service.upsertRequisites(mockCtx, { ...record, legalName: 'Demo Co Updated' });

        const rows = await dataSource
            .getRepository(TestOrganizationRequisites)
            .find({ where: { erpId: 'org-1' } });
        expect(rows).toHaveLength(1);
        expect(rows[0].legalName).toBe('Demo Co Updated');
    });

    it('upsertFromEvent merges requisites: empty keeps stored, non-empty overwrites, one row', async () => {
        await eventService.upsertFromEvent(mockCtx, 'org-2', {
            legalName: 'Full Name',
            isActive: true,
            fields: { bankName: 'Bank A', bankBik: '044525000' },
        });
        await eventService.upsertFromEvent(mockCtx, 'org-2', {
            legalName: 'Full Name',
            isActive: true,
            fields: { bankName: '', bankBik: '044525001', kpp: '770001001' },
        });

        const rows = await dataSource
            .getRepository(TestOrganizationRequisites)
            .find({ where: { erpId: 'org-2' } });
        expect(rows).toHaveLength(1);
        expect(rows[0]).toMatchObject({
            bankName: 'Bank A',
            bankBik: '044525001',
            kpp: '770001001',
            inn: null,
        });
    });
});
