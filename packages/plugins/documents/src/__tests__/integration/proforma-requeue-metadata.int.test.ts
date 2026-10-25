import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { Column, DataSource, Entity, PrimaryGeneratedColumn } from 'typeorm';
import type { RequestContext, TransactionalConnection } from '@vendure/core';
import {
    createTestSchema,
    dropTestSchema,
    testDataSourceConnectionOptions,
    testSchemaOptions,
} from 'shared';
import { ProformaRequeueService } from '../../proforma-requeue.service';
import { unconfirmedVatError } from '../../pdf/proforma-invoice-vat';

@Entity('document')
class TestDocument {
    @PrimaryGeneratedColumn() id!: number;
    @Column({ type: 'varchar' }) type!: string;
    @Column({ type: 'varchar' }) status!: string;
    @Column({ type: 'simple-json', nullable: true }) metadata!: { error?: string } | null;
}

const { schema, extra } = testSchemaOptions('proforma_requeue_metadata');
let dataSource: DataSource;
const ctx = {} as RequestContext;
const enqueue = vi.fn();

beforeAll(async () => {
    await createTestSchema(schema);
    dataSource = new DataSource({
        type: 'postgres',
        ...testDataSourceConnectionOptions(),
        schema,
        entities: [TestDocument],
        synchronize: true,
        extra,
    });
    await dataSource.initialize();
});

afterAll(async () => {
    await dataSource?.destroy();
    await dropTestSchema(schema);
});

describe('ProformaRequeueService.requeueForUnconfirmedVat', () => {
    it('matches a failed proforma on simple-json metadata (text column) and requeues it', async () => {
        const repo = dataSource.getRepository(TestDocument);
        const error = unconfirmedVatError('VAT-20');
        await repo.insert({
            type: 'proforma-invoice',
            status: 'failed',
            metadata: { error },
        } as never);
        const connection = { getRepository: () => dataSource.getRepository(TestDocument) };
        const service = new ProformaRequeueService(
            connection as unknown as TransactionalConnection,
            { enqueue } as never,
        );

        await service.requeueForUnconfirmedVat(ctx, 'VAT-20');

        expect(enqueue).toHaveBeenCalledOnce();
        const row = await repo.findOneByOrFail({ type: 'proforma-invoice' });
        expect(row.status).toBe('pending');
    });
});
