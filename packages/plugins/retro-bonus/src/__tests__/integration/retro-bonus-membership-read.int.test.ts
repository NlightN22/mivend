import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { DataSource } from 'typeorm';
import type { TransactionalConnection } from '@vendure/core';
import {
    QueryTooLargeError,
    createTestConnection,
    createTestSchema,
    dropTestSchema,
    testDataSourceConnectionOptions,
    testRequestContext,
    testSchemaOptions,
} from 'shared';

import { MEMBERSHIP_BATCH_SIZE, loadProductMembers } from '../../retro-bonus-membership-read';
import { RetroBonusRuleProduct } from '../../retro-bonus-rule-membership.entity';

const { schema, extra } = testSchemaOptions('retro_bonus_membership_read');
let dataSource: DataSource;
let connection: TransactionalConnection;

beforeAll(async () => {
    await createTestSchema(schema);
    dataSource = new DataSource({
        type: 'postgres',
        ...testDataSourceConnectionOptions(),
        schema,
        extra,
        entities: [RetroBonusRuleProduct],
        synchronize: true,
    });
    await dataSource.initialize();
    connection = createTestConnection(dataSource);
});

afterAll(async () => {
    await dataSource.destroy();
    await dropTestSchema(schema);
});

const products = (n: number, prefix: string): string[] =>
    Array.from({ length: n }, (_, i) => `${prefix}-${String(i).padStart(6, '0')}`);

describe('loadProductMembers (real Postgres)', () => {
    it('returns every member of rules whose membership spans several batches', async () => {
        const big = MEMBERSHIP_BATCH_SIZE * 2 + 3;
        const repo = dataSource.getRepository(RetroBonusRuleProduct);
        for (const [ruleId, ids] of [
            [1, products(big, 'p')],
            [2, products(MEMBERSHIP_BATCH_SIZE, 'q')],
            [3, products(2, 'r')],
        ] as const) {
            await repo.insert(ids.map(productErpId => ({ ruleId, productErpId })));
        }
        const members = await loadProductMembers(connection, testRequestContext, [1, 2, 3, 4]);
        expect(members.get(1)?.size).toBe(big);
        expect(members.get(2)?.size).toBe(MEMBERSHIP_BATCH_SIZE);
        expect(members.get(3)).toEqual(new Set(['r-000000', 'r-000001']));
        expect(members.get(4)?.size).toBe(0);
        expect(members.get(1)?.has('q-000000')).toBe(false);
    });

    it('reads the same members over small batches as over one, and fails above the ceiling', async () => {
        const repo = dataSource.getRepository(RetroBonusRuleProduct);
        await repo.insert(products(25, 'z').map(productErpId => ({ ruleId: 9, productErpId })));

        const whole = await loadProductMembers(connection, testRequestContext, [9]);
        const batched = await loadProductMembers(connection, testRequestContext, [9], 4);
        expect(batched.get(9)).toEqual(whole.get(9));
        expect(batched.get(9)?.size).toBe(25);

        await expect(
            loadProductMembers(connection, testRequestContext, [9], 4, 24),
        ).rejects.toBeInstanceOf(QueryTooLargeError);
    });
});
