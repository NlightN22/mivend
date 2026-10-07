import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { Column, DataSource, Entity, PrimaryGeneratedColumn } from 'typeorm';
import type { RequestContext } from '@vendure/core';
import {
    createTestSchema,
    dropTestSchema,
    testDataSourceConnectionOptions,
    testSchemaOptions,
} from 'shared';
import { TradingPointService } from '../../trading-point.service';

@Entity('counterparty')
class TestCounterparty {
    @PrimaryGeneratedColumn('increment') id!: number;
    @Column({ type: 'varchar', nullable: true }) branchId!: string | null;
}

const { schema, extra } = testSchemaOptions('trading_point_branch');
const ctx = {} as RequestContext;
let dataSource: DataSource;
let service: TradingPointService;
let defaultBranchId: string | null;

beforeAll(async () => {
    await createTestSchema(schema);
    dataSource = new DataSource({
        type: 'postgres',
        ...testDataSourceConnectionOptions(),
        schema,
        extra,
        entities: [TestCounterparty],
        synchronize: true,
    });
    await dataSource.initialize();
    service = new TradingPointService(
        { rawConnection: dataSource } as never,
        {} as never,
        {} as never,
        {} as never,
        { getGlobalDefaultBranchId: async () => defaultBranchId } as never,
    );
});

afterAll(async () => {
    await dataSource.destroy();
    await dropTestSchema(schema);
});

beforeEach(async () => {
    await dataSource.getRepository(TestCounterparty).clear();
    defaultBranchId = 'branch-default';
});

async function point(counterpartyBranch: string | null, own: string | null = null) {
    const cp = await dataSource
        .getRepository(TestCounterparty)
        .save({ branchId: counterpartyBranch });
    return { servicingBranchId: own, counterpartyId: String(cp.id) };
}

describe('TradingPointService.resolveServicingBranchId (real Postgres)', () => {
    it("the point's own branch wins over the counterparty's", async () => {
        expect(
            await service.resolveServicingBranchId(ctx, await point('branch-b', 'branch-a')),
        ).toBe('branch-a');
    });

    it("inherits the counterparty's branch when the point has none", async () => {
        expect(await service.resolveServicingBranchId(ctx, await point('branch-b'))).toBe(
            'branch-b',
        );
    });

    it('falls back to the default branch when neither has one', async () => {
        expect(await service.resolveServicingBranchId(ctx, await point(null))).toBe(
            'branch-default',
        );
    });

    it('returns null (not a wrong branch) when nothing resolves', async () => {
        defaultBranchId = null;
        expect(await service.resolveServicingBranchId(ctx, await point(null))).toBeNull();
    });

    it("never picks another counterparty's branch", async () => {
        await point('branch-other');
        expect(await service.resolveServicingBranchId(ctx, await point(null))).toBe(
            'branch-default',
        );
    });
});
