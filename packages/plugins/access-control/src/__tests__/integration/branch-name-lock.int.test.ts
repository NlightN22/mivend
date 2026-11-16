import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { DataSource } from 'typeorm';
import { AutoIncrementIdStrategy } from '@vendure/core';
import { setEntityIdStrategy } from '@vendure/core/dist/entity/set-entity-id-strategy';
import {
    createTestConnection,
    createTestSchema,
    dropTestSchema,
    testDataSourceConnectionOptions,
    testRequestContext,
    testSchemaOptions,
} from 'shared';

import { BranchService } from '../../branch.service';
import { Branch } from '../../entities/branch.entity';

const { schema, extra } = testSchemaOptions('branch_name_lock');
let dataSource: DataSource;
let service: BranchService;

beforeAll(async () => {
    // A real VendureEntity gets its primary column from the id strategy that bootstrap() sets.
    setEntityIdStrategy(new AutoIncrementIdStrategy(), [Branch]);
    await createTestSchema(schema);
    dataSource = new DataSource({
        type: 'postgres',
        ...testDataSourceConnectionOptions(),
        schema,
        extra,
        entities: [Branch],
        synchronize: true,
    });
    await dataSource.initialize();
    service = new BranchService(
        createTestConnection(dataSource),
        {} as never,
        {} as never,
        {} as never,
    );
});

afterAll(async () => {
    await dataSource.destroy();
    await dropTestSchema(schema);
});

beforeEach(async () => {
    await dataSource.query('TRUNCATE branch RESTART IDENTITY');
});

const names = async (): Promise<string[]> =>
    (await dataSource.getRepository(Branch).find({ order: { id: 'ASC' } })).map(b => b.name);

describe('BranchService name uniqueness (real Postgres, #286)', () => {
    it('lets exactly one of many parallel creates with the same name win, ignoring case', async () => {
        const attempts = ['Alpha', 'alpha', 'ALPHA', ' Alpha ', 'aLpHa', 'Alpha'];
        const results = await Promise.allSettled(
            attempts.map(name => service.createManual(testRequestContext, name)),
        );
        expect(results.filter(r => r.status === 'fulfilled')).toHaveLength(1);
        expect(await names()).toHaveLength(1);
    });

    it('lets exactly one of two parallel renames to the same name win', async () => {
        const a = await service.createManual(testRequestContext, 'Branch A');
        const b = await service.createManual(testRequestContext, 'Branch B');
        const results = await Promise.allSettled([
            service.rename(testRequestContext, String(a.id), 'North'),
            service.rename(testRequestContext, String(b.id), 'NORTH'),
        ]);
        expect(results.filter(r => r.status === 'fulfilled')).toHaveLength(1);
        const taken = (await names()).filter(n => n.toLowerCase() === 'north');
        expect(taken).toHaveLength(1);
    });

    it('a create and a rename racing for one name leave exactly one holder', async () => {
        const a = await service.createManual(testRequestContext, 'Branch A');
        const results = await Promise.allSettled([
            service.createManual(testRequestContext, 'Target'),
            service.rename(testRequestContext, String(a.id), 'target'),
        ]);
        expect(results.filter(r => r.status === 'fulfilled')).toHaveLength(1);
        expect((await names()).filter(n => n.toLowerCase() === 'target')).toHaveLength(1);
    });

    it('lets a branch keep or re-case its own name', async () => {
        const a = await service.createManual(testRequestContext, 'Branch A');
        await service.createManual(testRequestContext, 'Branch B');
        await service.rename(testRequestContext, String(a.id), 'BRANCH A');
        expect(await names()).toEqual(['BRANCH A', 'Branch B']);
    });
});
