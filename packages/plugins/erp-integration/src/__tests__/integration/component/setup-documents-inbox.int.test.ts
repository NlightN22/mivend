import { create, toJson } from '@bufbuild/protobuf';
import { timestampFromDate } from '@bufbuild/protobuf/wkt';
import {
    DiscountSetupChangedSchema,
    RetroBonusSetupChangedSchema,
    SelectionConditionSchema,
    SourceFieldValueSchema,
} from '@nlightn22/event-contracts';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { DataSource } from 'typeorm';
import type { RequestContext, TransactionalConnection } from '@vendure/core';
import { DiscountSetupService } from '@mivend/plugin-price-entry';
import { RetroBonusRuleService } from '@mivend/plugin-retro-bonus';
import {
    createTestConnection,
    createTestSchema,
    dropTestSchema,
    testDataSourceConnectionOptions,
    testRequestContext,
    testSchemaOptions,
} from 'shared';

import { IntegrationInboxEvent } from '../../../entities/integration-inbox-event.entity';
import { DiscountSetupStreamHandler } from '../../../handlers/discount-setup.handler';
import { RetroBonusSetupStreamHandler } from '../../../handlers/retro-bonus-setup.handler';
import { IntegrationInboxService } from '../../../integration-inbox.service';
import type { InboundStream } from '../../../types';
import { makeInboxProcessor } from './inbox-processor-helpers';
import {
    TestDiscountSetup,
    TestRecipient,
    TestRetroCounterparty,
    TestRetroFilterTerm,
    TestRetroProduct,
    TestRetroRule,
    TestSetupFilterTerm,
    TestSetupProduct,
} from './setup-documents-entities';

const { schema, extra } = testSchemaOptions('erp_setup_documents');
let dataSource: DataSource;
let inbox: IntegrationInboxService;
let handlers: { discount: DiscountSetupStreamHandler; retro: RetroBonusSetupStreamHandler };
let sourceSeq = 0;
const from = timestampFromDate(new Date('2026-01-01T00:00:00Z'));

beforeAll(async () => {
    await createTestSchema(schema);
    dataSource = new DataSource({
        type: 'postgres',
        ...testDataSourceConnectionOptions(),
        schema,
        extra,
        entities: [
            IntegrationInboxEvent,
            TestDiscountSetup,
            TestRecipient,
            TestSetupProduct,
            TestRetroRule,
            TestRetroCounterparty,
            TestRetroProduct,
            TestSetupFilterTerm,
            TestRetroFilterTerm,
        ],
        synchronize: true,
    });
    await dataSource.initialize();
    const base = createTestConnection(dataSource);
    const mapped: Record<string, unknown> = {
        DiscountSetup: TestDiscountSetup,
        RetroBonusRule: TestRetroRule,
    };
    const connection = {
        withTransaction: base.withTransaction.bind(base),
        getRepository: (c: never, entity: { name?: string } | string) =>
            base.getRepository(
                c,
                ((typeof entity !== 'string' && mapped[entity.name ?? '']) || entity) as never,
            ),
    } as unknown as TransactionalConnection;
    inbox = new IntegrationInboxService(base);
    handlers = {
        discount: new DiscountSetupStreamHandler(new DiscountSetupService(connection)),
        retro: new RetroBonusSetupStreamHandler(new RetroBonusRuleService(connection)),
    };
});

beforeEach(async () => {
    await dataSource.query(
        `TRUNCATE integration_inbox_event, discount_setup, discount_setup_recipient, discount_setup_product,
                  retro_bonus_rule, retro_bonus_rule_counterparty, retro_bonus_rule_product,
                  discount_setup_filter_term, retro_bonus_rule_filter_term RESTART IDENTITY`,
    );
});

afterAll(async () => {
    await dataSource.destroy();
    await dropTestSchema(schema);
});

async function deliver(
    stream: Extract<InboundStream, 'discount-setup' | 'retro-bonus-setup'>,
    entityId: string,
    version: string,
    payload: Record<string, unknown>,
): Promise<void> {
    sourceSeq += 1;
    const handler = stream === 'discount-setup' ? handlers.discount : handlers.retro;
    await inbox.enqueue(testRequestContext, {
        stream,
        entityId,
        version,
        sourceEventId: `evt-${sourceSeq}`,
        payload,
    });
    await makeInboxProcessor(
        dataSource,
        inbox,
        vi.fn((c: RequestContext, id: string, p: Record<string, unknown>) =>
            handler.apply(c, id, p),
        ),
    ).processPendingBatch();
}

const discountMessage = (version: string, productIds: string[]): Record<string, unknown> =>
    toJson(
        DiscountSetupChangedSchema,
        create(DiscountSetupChangedSchema, {
            entityId: 'doc-d',
            version,
            effectiveFrom: from,
            isActive: true,
            percent: 5,
            productMode: 'list',
            productIds,
            recipients: [{ counterpartyId: 'cp-1' }],
        }),
    ) as Record<string, unknown>;

const retroMessage = (version: string, counterpartyIds: string[]): Record<string, unknown> =>
    toJson(
        RetroBonusSetupChangedSchema,
        create(RetroBonusSetupChangedSchema, {
            entityId: 'doc-r',
            version,
            effectiveFrom: from,
            isActive: true,
            percent: 2,
            counterpartyMode: 'list',
            productMode: 'list',
            counterpartyIds,
            productIds: ['p1'],
        }),
    ) as Record<string, unknown>;

const outcomes = async (): Promise<Array<{ status: string; outcome: string | null }>> =>
    dataSource.query(`SELECT status, outcome FROM integration_inbox_event ORDER BY id`);

describe('discount-setup through the inbox (real Postgres)', () => {
    it('stores a document and a redelivery of the same event leaves exactly one rule and one member set', async () => {
        await deliver('discount-setup', 'doc-d', '1', discountMessage('1', ['p1', 'p2']));
        await deliver('discount-setup', 'doc-d', '1', discountMessage('1', ['p1', 'p2']));

        expect(await dataSource.query(`SELECT count(*)::int AS n FROM discount_setup`)).toEqual([
            { n: 1 },
        ]);
        expect(
            await dataSource.query(`SELECT count(*)::int AS n FROM discount_setup_product`),
        ).toEqual([{ n: 2 }]);
        expect((await outcomes()).every(o => o.status === 'processed')).toBe(true);
    });

    it('replaces the member set with a newer version and settles a reposted identical one as a noop', async () => {
        await deliver('discount-setup', 'doc-d', '1', discountMessage('1', ['p1', 'p2']));
        await deliver('discount-setup', 'doc-d', '2', discountMessage('2', ['p2', 'p3']));
        await deliver('discount-setup', 'doc-d', '3', discountMessage('3', ['p3', 'p2']));

        expect(
            await dataSource.query(`SELECT "productErpId" FROM discount_setup_product ORDER BY 1`),
        ).toEqual([{ productErpId: 'p2' }, { productErpId: 'p3' }]);
        expect((await outcomes()).map(o => o.outcome)).toEqual(['applied', 'applied', 'noop']);
    });

    it('deactivates on a tombstone and surfaces an invalid payload as a failed inbox row', async () => {
        await deliver('discount-setup', 'doc-d', '1', discountMessage('1', ['p1']));
        await deliver(
            'discount-setup',
            'doc-d',
            '2',
            toJson(
                DiscountSetupChangedSchema,
                create(DiscountSetupChangedSchema, {
                    entityId: 'doc-d',
                    version: '2',
                    isDeleted: true,
                }),
            ) as Record<string, unknown>,
        );
        await deliver('discount-setup', 'doc-bad', '1', {
            ...discountMessage('1', ['p1']),
            productMode: '',
        });

        expect(
            await dataSource.query(`SELECT active FROM discount_setup WHERE "erpId" = 'doc-d'`),
        ).toEqual([{ active: false }]);
        const bad = await dataSource
            .getRepository(IntegrationInboxEvent)
            .findOneByOrFail({ entityId: 'doc-bad' });
        expect(bad.status).toBe('failed');
        expect(bad.lastError).toContain('productMode');
    });
});

describe('replaying a filter-mode discount document (real Postgres)', () => {
    const filterMessage = (): Record<string, unknown> =>
        toJson(
            DiscountSetupChangedSchema,
            create(DiscountSetupChangedSchema, {
                entityId: 'doc-f',
                version: '7',
                effectiveFrom: from,
                isActive: true,
                percent: 5,
                productMode: 'filter',
                productFilter: [
                    create(SelectionConditionSchema, {
                        field: 'Номенклатура',
                        comparison: 'ВИерархии',
                        values: [
                            create(SourceFieldValueSchema, {
                                value: { case: 'refId', value: 'g-1' },
                            }),
                        ],
                    }),
                ],
                recipients: [{ counterpartyId: 'cp-1' }],
            }),
        ) as Record<string, unknown>;

    it('re-runs the handler for the same version under a new event id and activates an awaiting-redelivery row', async () => {
        await deliver('discount-setup', 'doc-f', '7', filterMessage());
        await dataSource.query(
            `UPDATE discount_setup SET active = false, "inactiveReason" = 'awaiting-redelivery',
                    "sourceVersion" = '0', "contentHash" = ''; DELETE FROM discount_setup_recipient`,
        );

        await deliver('discount-setup', 'doc-f', '7', filterMessage());

        expect(
            await dataSource.query(
                `SELECT active, "inactiveReason", "sourceVersion" FROM discount_setup`,
            ),
        ).toEqual([{ active: true, inactiveReason: null, sourceVersion: '7' }]);
        expect(
            await dataSource.query(`SELECT count(*)::int AS n FROM discount_setup_recipient`),
        ).toEqual([{ n: 1 }]);
        expect((await outcomes()).map(o => o.outcome)).toEqual(['applied', 'applied']);
    });
});

describe('retro-bonus-setup through the inbox (real Postgres)', () => {
    it('stores a document, replaces its counterparty list and ignores a redelivery', async () => {
        await deliver('retro-bonus-setup', 'doc-r', '1', retroMessage('1', ['cp-1', 'cp-2']));
        await deliver('retro-bonus-setup', 'doc-r', '1', retroMessage('1', ['cp-1', 'cp-2']));
        await deliver('retro-bonus-setup', 'doc-r', '2', retroMessage('2', ['cp-3']));

        expect(await dataSource.query(`SELECT count(*)::int AS n FROM retro_bonus_rule`)).toEqual([
            { n: 1 },
        ]);
        expect(
            await dataSource.query(`SELECT "counterpartyErpId" FROM retro_bonus_rule_counterparty`),
        ).toEqual([{ counterpartyErpId: 'cp-3' }]);
    });
});
