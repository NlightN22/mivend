import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { Column, DataSource, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';
import type { RequestContext, TransactionalConnection } from '@vendure/core';
import {
    createTestSchema,
    dropTestSchema,
    testDataSourceConnectionOptions,
    testSchemaOptions,
} from 'shared';
import { DocumentsService } from '../../documents.service';

// Vendure's VendureEntity relies on an EntityIdStrategy registered during
// bootstrap() to generate its primary column — using the real Document/
// OrganizationRequisites classes against a standalone DataSource fails with
// "Entity does not have a primary column" (confirmed empirically). This repo's
// one existing integration test (packages/plugins/sync/src/__tests__/integration/
// sync-cycle.test.ts) works around the same constraint with hand-rolled tables
// matching production schema instead of the real Vendure entity classes — same
// approach here, against real Postgres, no DB mocking.

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
class TestOrganizationRequisites {
    @PrimaryGeneratedColumn()
    id!: number;

    @Column({ type: 'varchar' }) erpId!: string;
    @Column({ type: 'varchar' }) legalName!: string;
    @Column({ type: 'varchar' }) inn!: string;
    @Column({ type: 'varchar', nullable: true }) kpp!: string | null;
    @Column({ type: 'varchar', nullable: true }) ogrn!: string | null;
    @Column({ type: 'varchar' }) legalAddress!: string;
    @Column({ type: 'varchar', nullable: true }) bankName!: string | null;
    @Column({ type: 'varchar', nullable: true }) bankAccount!: string | null;
    @Column({ type: 'varchar', nullable: true }) bankBik!: string | null;
    @Column({ type: 'varchar', nullable: true }) correspondentAccount!: string | null;
    @Column({ type: 'varchar', nullable: true }) signatoryName!: string | null;
    @Column({ type: 'varchar', nullable: true }) signatoryTitle!: string | null;
    @Column({ type: 'boolean', default: true }) isActive!: boolean;
}

let dataSource: DataSource;
let service: DocumentsService;
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
        getRepository: (_ctx: RequestContext, entity: { name: string }) => {
            const testEntity =
                entityMap[entity.name === 'Document' ? 'document' : 'organization_requisites'];
            return dataSource.getRepository(testEntity);
        },
        rawConnection: dataSource,
    } as unknown as TransactionalConnection;

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
});
