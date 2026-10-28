import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { DataSource } from 'typeorm';
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
    RetroBonusRuleFilterTerm,
    RetroBonusRuleProduct,
} from '../../retro-bonus-rule-membership.entity';
import { RetroBonusRuleReclassifyService } from '../../retro-bonus-rule-reclassify.service';
import { RetroBonusRuleService } from '../../retro-bonus-rule.service';
import { TestRetroBonusRule, input } from './retro-bonus-rule-harness';

const { schema, extra } = testSchemaOptions('retro_bonus_rule');
const ctx = testRequestContext;
let dataSource: DataSource;
let service: RetroBonusRuleService;
let connectionRef: TransactionalConnection;

beforeAll(async () => {
    await createTestSchema(schema);
    dataSource = new DataSource({
        type: 'postgres',
        ...testDataSourceConnectionOptions(),
        schema,
        extra,
        entities: [
            TestRetroBonusRule,
            RetroBonusRuleCounterparty,
            RetroBonusRuleProduct,
            RetroBonusRuleFilterTerm,
        ],
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
    connectionRef = connection;
    service = new RetroBonusRuleService(connection);
});

afterAll(async () => {
    await dataSource.destroy();
    await dropTestSchema(schema);
});

beforeEach(async () => {
    await dataSource.query(
        'TRUNCATE retro_bonus_rule, retro_bonus_rule_counterparty, retro_bonus_rule_product, retro_bonus_rule_filter_term RESTART IDENTITY',
    );
});

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
const termCount = async (): Promise<number> =>
    Number((await dataSource.query(`SELECT count(*) FROM retro_bonus_rule_filter_term`))[0].count);

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
        expect((await stored()).inactiveReason).toBe('counterparty-unknown-filter-field');

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

    const ref = (refId: string) => ({ refId });
    const counterpartyFilter = (comparison: string, ...ids: string[]) => [
        { field: 'Контрагент', comparison, values: ids.map(ref) },
    ];

    it('stores evaluable filters as terms and returns the rule only to a matching counterparty', async () => {
        await service.apply(
            ctx,
            input('1', [], [], {
                counterpartyMode: 'filter',
                counterpartyFilter: counterpartyFilter('ВСписке', 'c1', 'c2'),
                productMode: 'filter',
                productFilter: [
                    { field: 'Номенклатура', comparison: 'ВИерархии', values: [ref('g1')] },
                ],
            }),
        );

        expect((await stored()).inactiveReason).toBeNull();
        expect(await termCount()).toBe(2);
        expect(await service.findForCounterparty(ctx, 'c2')).toHaveLength(1);
        expect(await service.findForCounterparty(ctx, 'c3')).toHaveLength(0);
    });

    it('replaces the terms with a newer version and drops them when the filter is unsupported', async () => {
        const filtered = (comparison: string, version: string) =>
            input(version, [], [], {
                counterpartyMode: 'filter',
                counterpartyFilter: counterpartyFilter(comparison, 'c1'),
            });
        await service.apply(ctx, filtered('Равно', '1'));
        await service.apply(ctx, filtered('ВСпискеПоИерархии', '2'));

        expect(await termCount()).toBe(0);
        expect((await stored()).inactiveReason).toBe('counterparty-unsupported-comparison');
    });

    it('returns an all-counterparties rule with an unevaluable product side flagged, never as evaluated', async () => {
        await service.apply(
            ctx,
            input('1', [], [], {
                allCounterparties: true,
                productMode: 'filter',
                productFilter: [{ field: 'Поставщик', comparison: 'Равно', values: [ref('s1')] }],
            }),
        );

        const found = await service.findForCounterparty(ctx, 'anyone');

        expect(found).toHaveLength(1);
        expect(found[0].inactiveReason).toBe('product-unknown-filter-field');
        expect(await termCount()).toBe(0);
    });

    it('reclassifies legacy rows once from the stored filter and is idempotent', async () => {
        await service.apply(
            ctx,
            input('1', [], [], {
                counterpartyMode: 'filter',
                counterpartyFilter: counterpartyFilter('Равно', 'c1'),
            }),
        );
        await dataSource.query(
            `DELETE FROM retro_bonus_rule_filter_term; UPDATE retro_bonus_rule SET "inactiveReason" = 'counterparty-filter'`,
        );
        const reclassify = new RetroBonusRuleReclassifyService(
            connectionRef,
            {} as never,
            {} as never,
        );

        expect(await reclassify.reclassifyLegacy(ctx)).toBe(1);
        expect(await reclassify.reclassifyLegacy(ctx)).toBe(0);

        expect((await stored()).inactiveReason).toBeNull();
        expect(await termCount()).toBe(1);
    });
});
