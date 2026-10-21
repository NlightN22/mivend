import { randomUUID } from 'crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Column, DataSource, Entity, PrimaryGeneratedColumn } from 'typeorm';
import { Permission } from '@vendure/core';
import type { RequestContext, TransactionalConnection } from '@vendure/core';
import { CustomPermission } from '@mivend/plugin-access-control';
import {
    createTestSchema,
    dropTestSchema,
    testDataSourceConnectionOptions,
    testSchemaOptions,
} from 'shared';
import { DocumentPdfAccessService } from '../../document-pdf-access.service';

@Entity('document')
class TestDocument {
    @PrimaryGeneratedColumn() id!: number;
    @Column({ type: 'uuid' }) uuid!: string;
    @Column({ type: 'varchar' }) counterpartyId!: string;
    @Column({ type: 'varchar' }) source!: string;
    @Column({ type: 'varchar', default: 'ready' }) status!: string;
}

// Counterparty scope itself is CounterpartyService's own tested query; here it is the branch-a set.
const VISIBLE_TO_MANAGER = new Set(['cp-a']);
const CUSTOMER_OF_USER: Record<string, { customerId: number; counterpartyId: string }> = {
    'user-a': { customerId: 1, counterpartyId: 'cp-a' },
    'user-b': { customerId: 2, counterpartyId: 'cp-b' },
};

let dataSource: DataSource;
let service: DocumentPdfAccessService;
const docs: Record<string, string> = {};
const { schema, extra } = testSchemaOptions('document_pdf_access');

function staffCtx(permission: string): RequestContext {
    return {
        activeUserId: 'manager-a',
        userHasPermissions: (p: string[]) => p.includes(permission),
    } as unknown as RequestContext;
}

function customerCtx(userId: string | undefined): RequestContext {
    return { activeUserId: userId, userHasPermissions: () => false } as unknown as RequestContext;
}

beforeAll(async () => {
    await createTestSchema(schema);
    dataSource = new DataSource({
        type: 'postgres',
        ...testDataSourceConnectionOptions(),
        schema,
        extra,
        entities: [TestDocument],
        synchronize: true,
    });
    await dataSource.initialize();
    const repo = dataSource.getRepository(TestDocument);
    for (const [key, counterpartyId, source, status] of [
        ['a', 'cp-a', 'generated', 'ready'],
        ['b', 'cp-b', 'generated', 'ready'],
        ['erp', 'cp-a', 'erp', 'ready'],
        ['pending', 'cp-a', 'generated', 'generating'],
    ]) {
        docs[key] = (await repo.save({ uuid: randomUUID(), counterpartyId, source, status })).uuid;
    }
    const connection = {
        getRepository: () => dataSource.getRepository(TestDocument),
    } as unknown as TransactionalConnection;
    const counterparties = {
        findOneVisible: async (_: RequestContext, id: string) =>
            VISIBLE_TO_MANAGER.has(id) ? { id } : null,
        getForCustomer: async (_: RequestContext, customerId: number) => {
            const own = Object.values(CUSTOMER_OF_USER).find(c => c.customerId === customerId);
            return own ? { id: own.counterpartyId } : null;
        },
    };
    const customers = {
        findOneByUserId: async (_: RequestContext, userId: string) =>
            CUSTOMER_OF_USER[userId] ? { id: CUSTOMER_OF_USER[userId].customerId } : undefined,
    };
    service = new DocumentPdfAccessService(connection, counterparties as never, customers as never);
});

afterAll(async () => {
    await dataSource.destroy();
    await dropTestSchema(schema);
});

const allowed = async (ctx: RequestContext, uuid: string): Promise<boolean> =>
    (await service.findDownloadable(ctx, uuid)) !== null;

describe('DocumentPdfAccessService (integration, real Postgres)', () => {
    it('lets a manager download a document of a visible counterparty', async () => {
        expect(await allowed(staffCtx(Permission.ReadCustomer), docs.a)).toBe(true);
        expect(await allowed(staffCtx(CustomPermission.ReadCounterparty.Permission), docs.a)).toBe(
            true,
        );
    });

    it('hides a document of a counterparty outside the manager scope', async () => {
        expect(await allowed(staffCtx(Permission.ReadCustomer), docs.b)).toBe(false);
    });

    it('lets a customer download only the own counterparty documents', async () => {
        expect(await allowed(customerCtx('user-a'), docs.a)).toBe(true);
        expect(await allowed(customerCtx('user-a'), docs.b)).toBe(false);
        expect(await allowed(customerCtx('user-b'), docs.b)).toBe(true);
    });

    it('refuses a guest and a user without a customer', async () => {
        expect(await allowed(customerCtx(undefined), docs.a)).toBe(false);
        expect(await allowed(customerCtx('user-x'), docs.a)).toBe(false);
    });

    it('answers a missing uuid exactly like a hidden one', async () => {
        const ctx = staffCtx(Permission.ReadCustomer);
        expect(await service.findDownloadable(ctx, randomUUID())).toBeNull();
        expect(await service.findDownloadable(ctx, docs.b)).toBeNull();
        expect(await service.findDownloadable(ctx, 'not-a-uuid')).toBeNull();
        expect(await service.findDownloadable(ctx, docs.a.toUpperCase())).not.toBeNull();
    });

    it('never serves an ERP document, which has no generated file', async () => {
        expect(await allowed(staffCtx(Permission.ReadCustomer), docs.erp)).toBe(false);
    });

    it('serves only what Document.pdfUrl exposes: a generated document not yet ready is 404', async () => {
        expect(await allowed(staffCtx(Permission.ReadCustomer), docs.pending)).toBe(false);
    });
});
