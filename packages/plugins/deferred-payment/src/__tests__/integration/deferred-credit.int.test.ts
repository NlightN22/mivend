import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { DataSource } from 'typeorm';
import { CounterpartyService, CreditLimitCheckService } from '@mivend/plugin-counterparty';
import type { Injector, Order, RequestContext } from '@vendure/core';
import {
    createTestSchema,
    dropTestSchema,
    testDataSourceConnectionOptions,
    testSchemaOptions,
} from 'shared';

import { deferredEligibilityChecker } from '../../deferred-eligibility-checker';
import { deferredPaymentHandler } from '../../deferred-payment-handler';
import { OpenDeferredExposureService } from '../../open-deferred-exposure.service';

// Real SQL (exposure sum), real CreditLimitCheckService.decide and the real handler/checker run over
// a schema-faithful replica of the Vendure tables they touch. Only CounterpartyService (another
// plugin) is replaced by its own join query, copied from counterparty.service.ts getForCustomer.
const { schema, extra } = testSchemaOptions('deferred_credit');
let dataSource: DataSource;
const ctx = {} as RequestContext;

const run = (sql: string, params: unknown[] = []): Promise<Array<Record<string, unknown>>> =>
    dataSource.query(sql, params);

const counterpartyService = {
    async getForCustomer(_ctx: RequestContext, customerId: number) {
        const rows = await run(
            `SELECT c.* FROM counterparty c
             INNER JOIN customer cu ON cu."customFieldsCounterpartyid"::text = c.id::text
             WHERE cu.id = $1`,
            [customerId],
        );
        return rows[0] ?? null;
    },
};
const providers = new Map<unknown, unknown>([
    [CounterpartyService, counterpartyService],
    [CreditLimitCheckService, new CreditLimitCheckService(null as never, null as never)],
    [
        OpenDeferredExposureService,
        new OpenDeferredExposureService({
            getRepository: () => ({ query: (sql: string, params: unknown[]) => run(sql, params) }),
        } as never),
    ],
]);
const injector = { get: (token: unknown) => providers.get(token) } as unknown as Injector;

interface Buyer {
    customerId: number;
    counterpartyId: number;
}

async function addBuyer(creditLimit: number, creditBalance = 0): Promise<Buyer> {
    const [cp] = await run(
        `INSERT INTO counterparty ("erpId", "creditLimit", "creditBalance")
         VALUES ($1, $2, $3) RETURNING id`,
        [`cnt-${Math.random()}`, creditLimit, creditBalance],
    );
    const [cu] = await run(
        `INSERT INTO customer ("customFieldsCounterpartyid") VALUES ($1) RETURNING id`,
        [String(cp.id)],
    );
    return { customerId: Number(cu.id), counterpartyId: Number(cp.id) };
}

async function addOrder(
    buyer: Buyer,
    rubles: number,
    opts: { erpStatus?: string; method?: string; paymentState?: string } = {},
): Promise<number> {
    const [o] = await run(
        `INSERT INTO "order" ("customerId", "customFieldsErpstatus") VALUES ($1, $2) RETURNING id`,
        [buyer.customerId, opts.erpStatus ?? 'PENDING'],
    );
    await run(`INSERT INTO payment ("orderId", method, state, amount) VALUES ($1, $2, $3, $4)`, [
        o.id,
        opts.method ?? 'deferred-payment',
        opts.paymentState ?? 'Authorized',
        Math.round(rubles * 100),
    ]);
    return Number(o.id);
}

async function placeDeferred(buyer: Buyer, rubles: number, orderId = 999_999) {
    const order = {
        id: orderId,
        totalWithTax: Math.round(rubles * 100),
        customer: { id: buyer.customerId },
    } as unknown as Order;
    const result = await deferredPaymentHandler.createPayment(
        ctx,
        order,
        order.totalWithTax,
        [],
        {},
        undefined as never,
    );
    const meta = result.metadata as { public?: { creditLimitExceeded?: boolean } };
    return { state: result.state, exceeded: meta.public?.creditLimitExceeded };
}

beforeAll(async () => {
    await createTestSchema(schema);
    dataSource = new DataSource({
        type: 'postgres',
        ...testDataSourceConnectionOptions(),
        schema,
        extra,
    });
    await dataSource.initialize();
    await run(`CREATE TABLE counterparty (
        id serial PRIMARY KEY, "erpId" varchar, "creditLimit" bigint NOT NULL DEFAULT 0,
        "creditBalance" bigint NOT NULL DEFAULT 0)`);
    await run(
        `CREATE TABLE customer (id serial PRIMARY KEY, "customFieldsCounterpartyid" varchar)`,
    );
    await run(`CREATE TABLE "order" (
        id serial PRIMARY KEY, "customerId" int, "customFieldsErpstatus" varchar)`);
    await run(`CREATE TABLE payment (
        id serial PRIMARY KEY, "orderId" int, method varchar, state varchar, amount int)`);
    void deferredPaymentHandler.init?.(injector);
    void deferredEligibilityChecker.init?.(injector);
});

afterAll(async () => {
    await dataSource.destroy();
    await dropTestSchema(schema);
});

beforeEach(async () => {
    await run(`TRUNCATE payment, "order", customer, counterparty RESTART IDENTITY`);
});

describe('deferred eligibility (real counterparty join)', () => {
    it('shows deferred to a buyer with a credit limit and hides it from a prepayment buyer', async () => {
        const limited = await addBuyer(100_000);
        const prepay = await addBuyer(0);
        const check = (b: Buyer) =>
            deferredEligibilityChecker.check(
                ctx,
                { customer: { id: b.customerId } } as unknown as Order,
                [],
                {} as never,
            );
        expect(await check(limited)).toBe(true);
        expect(await check(prepay)).toBe(false);
    });
});

describe('deferred credit check over open orders (real SQL + decide)', () => {
    it('authorizes within the limit and does not flag it', async () => {
        const buyer = await addBuyer(100_000);
        expect(await placeDeferred(buyer, 40_000)).toEqual({
            state: 'Authorized',
            exceeded: false,
        });
    });

    it('still authorizes a single order over the limit but flags it', async () => {
        const buyer = await addBuyer(100_000);
        expect(await placeDeferred(buyer, 100_000.01)).toEqual({
            state: 'Authorized',
            exceeded: true,
        });
    });

    it('lands exactly on the limit without flagging, one kopeck more flags', async () => {
        const buyer = await addBuyer(100_000, 40_000);
        expect((await placeDeferred(buyer, 60_000)).exceeded).toBe(false);
        expect((await placeDeferred(buyer, 60_000.01)).exceeded).toBe(true);
    });

    it('sums several open unconfirmed deferred orders before the new one', async () => {
        const buyer = await addBuyer(100_000);
        await addOrder(buyer, 30_000, { erpStatus: 'PENDING' });
        await addOrder(buyer, 30_000, { erpStatus: 'SENT_TO_ERP' });
        expect((await placeDeferred(buyer, 20_000)).exceeded).toBe(false); // 80k
        await addOrder(buyer, 30_000, { erpStatus: 'RESERVED' });
        expect((await placeDeferred(buyer, 20_000)).exceeded).toBe(true); // 110k
        expect((await placeDeferred(buyer, 10_000)).exceeded).toBe(false); // exactly 100k
    });

    it('adds the open orders on top of the ERP credit balance', async () => {
        const buyer = await addBuyer(100_000, 50_000);
        await addOrder(buyer, 30_000);
        expect((await placeDeferred(buyer, 20_000)).exceeded).toBe(false);
        expect((await placeDeferred(buyer, 20_000.01)).exceeded).toBe(true);
    });

    it('ignores orders ERP already confirmed (they are in the balance), other methods and dead payments', async () => {
        const buyer = await addBuyer(100_000);
        await addOrder(buyer, 90_000, { erpStatus: 'CONFIRMED' });
        await addOrder(buyer, 90_000, { erpStatus: 'SHIPPED' });
        await addOrder(buyer, 90_000, { erpStatus: 'CANCELLED' });
        await addOrder(buyer, 90_000, { method: 'offline-terms' });
        await addOrder(buyer, 90_000, { paymentState: 'Declined' });
        expect((await placeDeferred(buyer, 90_000)).exceeded).toBe(false);
    });

    it('does not count another counterparty’s open orders (data isolation)', async () => {
        const buyer = await addBuyer(100_000);
        const other = await addBuyer(100_000);
        await addOrder(other, 95_000);
        expect((await placeDeferred(buyer, 90_000)).exceeded).toBe(false);
    });

    it('does not count the order being paid itself (idempotent re-run)', async () => {
        const buyer = await addBuyer(100_000);
        const orderId = await addOrder(buyer, 70_000);
        expect((await placeDeferred(buyer, 70_000, orderId)).exceeded).toBe(false);
        expect((await placeDeferred(buyer, 70_000, orderId)).exceeded).toBe(false);
    });

    it('declines a customer without a counterparty', async () => {
        const [cu] = await run(`INSERT INTO customer DEFAULT VALUES RETURNING id`);
        const result = await placeDeferred({ customerId: Number(cu.id), counterpartyId: 0 }, 1);
        expect(result.state).toBe('Declined');
    });
});
