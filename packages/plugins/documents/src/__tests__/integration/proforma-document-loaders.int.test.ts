import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Column, DataSource, Entity, PrimaryGeneratedColumn } from 'typeorm';
import type { RequestContext, TransactionalConnection } from '@vendure/core';
import {
    createTestSchema,
    dropTestSchema,
    queryCountingLogger,
    testDataSourceConnectionOptions,
    testSchemaOptions,
} from 'shared';

import { Document } from '../../entities/document.entity';
import { DocumentsService } from '../../documents.service';
import { ProformaDocumentLoaders } from '../../proforma-document-loaders.service';

@Entity('document')
class TestDocument {
    @PrimaryGeneratedColumn() id!: number;
    @Column({ type: 'varchar' }) type!: string;
    @Column({ type: 'varchar', nullable: true }) proformaInvoiceId!: string | null;
    @Column({ type: 'varchar' }) number!: string;
}

@Entity('organization_requisites')
class TestRequisites {
    @PrimaryGeneratedColumn() id!: number;
    @Column({ type: 'varchar' }) legalName!: string;
}

const { schema, extra } = testSchemaOptions('proforma_document_loaders');
const counter = { count: 0 };
const request = (): RequestContext => ({}) as RequestContext;
let dataSource: DataSource;
let loaders: ProformaDocumentLoaders;
let reference: DocumentsService;

beforeAll(async () => {
    await createTestSchema(schema);
    dataSource = new DataSource({
        type: 'postgres',
        ...testDataSourceConnectionOptions(),
        schema,
        extra,
        entities: [TestDocument, TestRequisites],
        synchronize: true,
        logger: queryCountingLogger(counter),
    });
    await dataSource.initialize();
    await dataSource
        .getRepository(TestRequisites)
        .save([{ legalName: 'org-a' }, { legalName: 'org-b' }]);
    for (let i = 1; i <= 20; i++) {
        if (i % 5 !== 0) {
            await dataSource
                .getRepository(TestDocument)
                .save({ type: 'proforma-invoice', proformaInvoiceId: String(i), number: `d-${i}` });
        }
    }
    await dataSource
        .getRepository(TestDocument)
        .save({ type: 'contract', proformaInvoiceId: '5', number: 'c-5' });
    const connection = {
        getRepository: (_c: unknown, entity: unknown) =>
            dataSource.getRepository(entity === Document ? TestDocument : TestRequisites),
    } as unknown as TransactionalConnection;
    loaders = new ProformaDocumentLoaders(connection);
    reference = new DocumentsService(connection, {} as never);
});

afterAll(async () => {
    await dataSource?.destroy();
    await dropTestSchema(schema);
});

describe('ProformaDocumentLoaders (integration, real Postgres)', () => {
    it('returns the same document per invoice as findForProformaInvoice, in one query for 20 rows', async () => {
        const ctx = request();
        counter.count = 0;
        const batched = await Promise.all(
            Array.from({ length: 20 }, (_, i) => loaders.document(ctx, i + 1)),
        );
        expect(counter.count).toBe(1);
        for (let i = 1; i <= 20; i++) {
            const expected = await reference.findForProformaInvoice(request(), i);
            expect(batched[i - 1]?.number ?? null).toBe(expected?.number ?? null);
        }
        expect(batched[4]).toBeNull();
    });

    it('loads each seller once however many invoices share it, and fails only a missing one', async () => {
        const ctx = request();
        counter.count = 0;
        const [a, b, missing] = await Promise.allSettled([
            loaders.seller(ctx, 1),
            loaders.seller(ctx, 2),
            loaders.seller(ctx, 999),
        ]);
        expect(counter.count).toBe(1);
        expect(a.status).toBe('fulfilled');
        expect(b.status).toBe('fulfilled');
        expect(missing.status).toBe('rejected');
        expect(await loaders.seller(ctx, 1)).toBe((a as PromiseFulfilledResult<unknown>).value);
    });
});
