import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { DataSource } from 'typeorm';
import type { RequestContext, TransactionalConnection } from '@vendure/core';
import {
    createTestSchema,
    dropTestSchema,
    testDataSourceConnectionOptions,
    testSchemaOptions,
} from 'shared';

import { NumberingService } from '../../numbering.service';

const mockCtx = {} as unknown as RequestContext;

let dataSource: DataSource;
let service: NumberingService;

const { schema, extra } = testSchemaOptions('numbering_service');

beforeAll(async () => {
    await createTestSchema(schema);
    dataSource = new DataSource({
        type: 'postgres',
        ...testDataSourceConnectionOptions(),
        schema,
        extra,
        entities: [],
    });
    await dataSource.initialize();
    await dataSource.query(`CREATE SEQUENCE IF NOT EXISTS mivend_number_seq_order START 1`);

    const connectionShim = {
        rawConnection: dataSource,
    } as unknown as TransactionalConnection;

    service = new NumberingService(connectionShim, { instanceNumberCode: '100' });
});

afterAll(async () => {
    await dataSource.destroy();
    await dropTestSchema(schema);
});

describe('NumberingService (integration, real Postgres)', () => {
    it('gives every concurrent caller a unique number for the same documentType', async () => {
        const results = await Promise.all(
            Array.from({ length: 20 }, () => service.next(mockCtx, 'order')),
        );
        expect(new Set(results).size).toBe(20);
    });
});
