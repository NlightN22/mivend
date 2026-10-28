import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { Column, DataSource, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';
import type { TransactionalConnection } from '@vendure/core';
import {
    createTestConnection,
    createTestSchema,
    dropTestSchema,
    testDataSourceConnectionOptions,
    testRequestContext,
    testSchemaOptions,
} from 'shared';

import {
    RetroBonusRuleCounterparty,
    RetroBonusRuleProduct,
} from '../../retro-bonus-rule-membership.entity';
import { RetroBonusRuleService } from '../../retro-bonus-rule.service';
import type { RetroBonusSetupInput } from '../../retro-bonus-rule.service';

// VendureEntity's primary column needs a bootstrapped EntityIdStrategy, so the rule table is hand-rolled.
@Entity('retro_bonus_rule')
@Index(['erpId'], { unique: true })
class TestRetroBonusRule {
    @PrimaryGeneratedColumn() id!: number;
    @Column({ type: 'timestamp', default: () => 'now()' }) createdAt!: Date;
    @Column({ type: 'timestamp', default: () => 'now()' }) updatedAt!: Date;
    @Column({ type: 'varchar' }) erpId!: string;
    @Column({ type: 'varchar', default: '' }) documentNumber!: string;
    @Column({ type: 'boolean', default: false }) isInstant!: boolean;
    @Column({ type: 'varchar', nullable: true }) accrualPeriod!: string | null;
    @Column({ type: 'int', default: 0 }) accrualDayNumber!: number;
    @Column({ type: 'varchar', default: '' }) accrualKind!: string;
    @Column({ type: 'double precision' }) percent!: number;
    @Column({ type: 'double precision', nullable: true }) conditionAmount!: number | null;
    @Column({ type: 'double precision', nullable: true }) conditionQuantity!: number | null;
    @Column({ type: 'varchar', nullable: true }) priceTypeErpId!: string | null;
    @Column({ type: 'varchar', nullable: true }) organizationErpId!: string | null;
    @Column({ type: 'varchar', nullable: true }) recipientCounterpartyErpId!: string | null;
    @Column({ type: 'varchar', nullable: true }) recipientContractErpId!: string | null;
    @Column({ type: 'timestamp' }) validFrom!: Date;
    @Column({ type: 'timestamp', nullable: true }) validTo!: Date | null;
    @Column({ type: 'boolean', default: true }) active!: boolean;
    @Column({ type: 'boolean', default: false }) allCounterparties!: boolean;
    @Column({ type: 'boolean', default: false }) allProducts!: boolean;
    @Column({ type: 'varchar', default: 'list' }) counterpartyMode!: string;
    @Column({ type: 'varchar', default: 'list' }) productMode!: string;
    @Column({ type: 'jsonb', nullable: true }) counterpartyFilter!: unknown[] | null;
    @Column({ type: 'jsonb', nullable: true }) productFilter!: unknown[] | null;
    @Column({ type: 'varchar' }) sourceVersion!: string;
    @Column({ type: 'varchar', length: 64 }) contentHash!: string;
}

const { schema, extra } = testSchemaOptions('retro_bonus_rule');
const ctx = testRequestContext;
let dataSource: DataSource;
let service: RetroBonusRuleService;

beforeAll(async () => {
    await createTestSchema(schema);
    dataSource = new DataSource({
        type: 'postgres',
        ...testDataSourceConnectionOptions(),
        schema,
        extra,
        entities: [TestRetroBonusRule, RetroBonusRuleCounterparty, RetroBonusRuleProduct],
        synchronize: true,
    });
    await dataSource.initialize();
    const base = createTestConnection(dataSource);
    const connection = {
        withTransaction: base.withTransaction.bind(base),
        getRepository: (c: never, entity: { name?: string } | string) =>
            base.getRepository(
                c,
                (typeof entity !== 'string' && entity.name === 'RetroBonusRule'
                    ? TestRetroBonusRule
                    : entity) as never,
            ),
    } as unknown as TransactionalConnection;
    service = new RetroBonusRuleService(connection);
});

afterAll(async () => {
    await dataSource.destroy();
    await dropTestSchema(schema);
});

beforeEach(async () => {
    await dataSource.query(
        'TRUNCATE retro_bonus_rule, retro_bonus_rule_counterparty, retro_bonus_rule_product RESTART IDENTITY',
    );
});

function input(
    version: string,
    counterpartyErpIds: string[],
    productErpIds: string[] = ['p1'],
    overrides: Partial<RetroBonusSetupInput['rule']> = {},
    erpId = 'doc-1',
): RetroBonusSetupInput {
    return {
        rule: {
            erpId,
            documentNumber: '1',
            isInstant: false,
            accrualPeriod: null,
            accrualDayNumber: 0,
            accrualKind: 'by-sale',
            percent: 2,
            conditionAmount: null,
            conditionQuantity: null,
            priceTypeErpId: null,
            organizationErpId: null,
            recipientCounterpartyErpId: null,
            recipientContractErpId: null,
            validFrom: new Date('2026-01-01T00:00:00Z'),
            validTo: null,
            allCounterparties: false,
            allProducts: false,
            counterpartyMode: 'list',
            productMode: 'list',
            counterpartyFilter: null,
            productFilter: null,
            sourceVersion: version,
            ...overrides,
        },
        counterpartyErpIds,
        productErpIds,
    };
}

const counterparties = async (): Promise<string[]> =>
    (
        await dataSource.query(
            `SELECT "counterpartyErpId" FROM retro_bonus_rule_counterparty ORDER BY 1`,
        )
    ).map((r: { counterpartyErpId: string }) => r.counterpartyErpId);
const stored = async (): Promise<{
    active: boolean;
    sourceVersion: string;
    inactiveReason: string | null;
}> =>
    (
        await dataSource.query(
            `SELECT active, "sourceVersion", "inactiveReason" FROM retro_bonus_rule`,
        )
    )[0];

describe('RetroBonusRuleService.apply (real Postgres)', () => {
    it('replaces both lists as a unit with a newer version', async () => {
        await service.apply(ctx, input('1', ['a', 'b'], ['p1', 'p2']));

        expect(await service.apply(ctx, input('2', ['b', 'c'], ['p3']))).toBe('applied');

        expect(await counterparties()).toEqual(['b', 'c']);
        expect(
            await dataSource.query(`SELECT "productErpId" FROM retro_bonus_rule_product`),
        ).toEqual([{ productErpId: 'p3' }]);
    });

    it('ignores an equal or older version and treats reordered equal content as unchanged', async () => {
        await service.apply(ctx, input('3', ['a', 'b']));

        expect(await service.apply(ctx, input('3', ['x']))).toBe('stale');
        expect(await service.apply(ctx, input('2', ['x']))).toBe('stale');
        expect(await service.apply(ctx, input('4', ['b', 'a']))).toBe('unchanged');

        expect(await counterparties()).toEqual(['a', 'b']);
        expect((await stored()).sourceVersion).toBe('4');
    });

    it('keeps no list rows behind an all flag, and filter-mode rules have no members', async () => {
        await service.apply(
            ctx,
            input('1', ['a'], ['p1'], { allCounterparties: true, allProducts: true }),
        );
        expect(await counterparties()).toEqual([]);

        await service.apply(
            ctx,
            input('2', [], [], {
                counterpartyMode: 'filter',
                counterpartyFilter: [{ field: 'Parent', comparison: 'Equal', values: [] }],
            }),
        );
        expect(await counterparties()).toEqual([]);
        expect((await stored()).inactiveReason).toBe('counterparty-filter');

        await service.apply(ctx, input('3', ['a']));
        expect((await stored()).inactiveReason).toBeNull();
    });

    it('deactivates on a tombstone and is reactivated only by a strictly newer version', async () => {
        await service.apply(ctx, input('3', ['a']));

        expect(await service.deactivate(ctx, 'doc-1', '5')).toBe('deactivated');
        expect(await service.apply(ctx, input('5', ['a']))).toBe('stale');
        expect((await stored()).active).toBe(false);

        expect(await service.apply(ctx, input('6', ['a']))).toBe('applied');
        expect((await stored()).active).toBe(true);
        expect(await counterparties()).toEqual(['a']);
        expect(await service.deactivate(ctx, 'ghost', '1')).toBe('unknown');
    });

    it('ignores a replayed older tombstone after a newer active version', async () => {
        await service.apply(ctx, input('5', ['a']));

        expect(await service.deactivate(ctx, 'doc-1', '3')).toBe('stale');
        expect((await stored()).active).toBe(true);
        expect(await counterparties()).toEqual(['a']);
    });

    it('applies an equal-version tombstone only while the rule is still active', async () => {
        await service.apply(ctx, input('5', ['a']));

        expect(await service.deactivate(ctx, 'doc-1', '5')).toBe('deactivated');
        expect(await service.deactivate(ctx, 'doc-1', '5')).toBe('stale');
    });

    it('serializes concurrent replaces: the highest version wins with exactly its own lists', async () => {
        const versions = ['1', '2', '3', '4', '5', '6'];

        await Promise.all(
            versions.map(v => service.apply(ctx, input(v, [`cp-${v}-a`, `cp-${v}-b`]))),
        );

        expect((await stored()).sourceVersion).toBe('6');
        expect(await counterparties()).toEqual(['cp-6-a', 'cp-6-b']);
    });

    it('replaces a large list and shrinks it back', async () => {
        const big = Array.from({ length: 50_000 }, (_, i) => `cp-${i}`);
        await service.apply(ctx, input('1', big));
        expect(
            await dataSource.query(`SELECT count(*)::int AS n FROM retro_bonus_rule_counterparty`),
        ).toEqual([{ n: 50_000 }]);

        await service.apply(ctx, input('2', big.slice(0, 5)));
        expect(await counterparties()).toHaveLength(5);
    }, 60_000);
});

describe('RetroBonusRuleService.findForCounterparty (real Postgres)', () => {
    it('finds rules by list membership, recipient or the all flag, and skips inactive ones', async () => {
        await service.apply(ctx, input('1', ['cp-1'], ['p1'], {}, 'listed'));
        await service.apply(
            ctx,
            input('1', [], [], { recipientCounterpartyErpId: 'cp-1' }, 'recipient'),
        );
        await service.apply(ctx, input('1', [], [], { allCounterparties: true }, 'everyone'));
        await service.apply(ctx, input('1', ['cp-2'], ['p1'], {}, 'other'));
        await service.apply(ctx, input('1', ['cp-1'], ['p1'], {}, 'cancelled'));
        await service.deactivate(ctx, 'cancelled', '2');

        const found = await service.findForCounterparty(ctx, 'cp-1');

        expect(found.map(r => r.erpId).sort()).toEqual(['everyone', 'listed', 'recipient']);
    });

    it('narrows to the contract when one is given, keeping rules without a contract', async () => {
        await service.apply(ctx, input('1', ['cp-1'], [], { recipientContractErpId: 'k-1' }, 'k1'));
        await service.apply(ctx, input('1', ['cp-1'], [], { recipientContractErpId: 'k-2' }, 'k2'));
        await service.apply(ctx, input('1', ['cp-1'], [], {}, 'any'));

        const found = await service.findForCounterparty(ctx, 'cp-1', 'k-1');

        expect(found.map(r => r.erpId).sort()).toEqual(['any', 'k1']);
    });
});
