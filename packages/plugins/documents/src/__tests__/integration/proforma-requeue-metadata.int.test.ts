import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { DataSource } from 'typeorm';
import type { RequestContext, TransactionalConnection } from '@vendure/core';
import {
    createTestSchema,
    dropTestSchema,
    testDataSourceConnectionOptions,
    testSchemaOptions,
} from 'shared';
import { Document } from '../../entities/document.entity';
import { ProformaRequeueService } from '../../proforma-requeue.service';
import { unconfirmedVatError } from '../../pdf/proforma-invoice-vat';

const { schema, extra } = testSchemaOptions('proforma_requeue_metadata');
let dataSource: DataSource;
const ctx = {} as RequestContext;
const enqueue = vi.fn();

beforeAll(async () => {
    await createTestSchema(schema);
    dataSource = new DataSource({
        ...testDataSourceConnectionOptions(schema),
        entities: [Document],
        synchronize: true,
        ...extra,
    } as never);
    await dataSource.initialize();
});

afterAll(async () => {
    await dataSource?.destroy();
    await dropTestSchema(schema);
});

describe('ProformaRequeueService.requeueForUnconfirmedVat', () => {
    it('matches a failed proforma on simple-json metadata (text column) and requeues it', async () => {
        const repo = dataSource.getRepository(Document);
        const error = unconfirmedVatError('VAT-20');
        await repo.insert({
            type: 'proforma-invoice',
            status: 'failed',
            metadata: { error },
        } as never);
        const connection = { getRepository: () => dataSource.getRepository(Document) };
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
