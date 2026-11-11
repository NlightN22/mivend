import { OrderStatusReference, seedTestOrderStatuses } from '@mivend/plugin-erp-order';
import { afterAll, beforeAll, beforeEach } from 'vitest';
import { DataSource } from 'typeorm';
import {
    CheckPolicy,
    CheckPolicyService,
    CheckRegistry,
    ChecksService,
} from '@mivend/plugin-checks';
import { CreditLimitCheckService } from '@mivend/plugin-counterparty';
import type { Order, RequestContext } from '@vendure/core';
import {
    createTestSchema,
    dropTestSchema,
    testDataSourceConnectionOptions,
    testSchemaOptions,
    type PaymentForm,
} from 'shared';

import { CreditPlacementService, type PlacementResult } from '../../credit-placement.service';
import { DeferredCreditAssessmentService } from '../../deferred-credit-assessment.service';
import { OpenDeferredExposureService } from '../../open-deferred-exposure.service';
import { PlacementConfirmationCheckRegistrar } from '../../placement-confirmation-check.registrar';

export interface Buyer {
    customerId: number;
    counterpartyId: number;
}

interface TxCtx {
    qr?: ReturnType<DataSource['createQueryRunner']>;
}

// Only other plugins' services are stubbed; advisory lock needs a real transaction held to commit
// Schema replica must mirror Vendure tables exactly, or the SQL under test diverges.
export function useCreditPlacementHarness(schemaName: string) {
    const { schema, extra } = testSchemaOptions(schemaName);
    let dataSource: DataSource;
    const state = { maxAgeDays: 7 as number | null, allowExceeding: false, reserveDays: 3 };
    const ctx = {} as RequestContext;

    const run = (sql: string, params: unknown[] = []): Promise<Array<Record<string, unknown>>> =>
        dataSource.query(sql, params);
    const runIn = (c: unknown, sql: string, params: unknown[] = []) =>
        ((c as TxCtx).qr ?? dataSource).query(sql, params) as Promise<
            Array<Record<string, unknown>>
        >;

    const connection = {
        async withTransaction<T>(c: TxCtx, work: (tx: TxCtx) => Promise<T>): Promise<T> {
            if (c.qr) return work(c);
            const qr = dataSource.createQueryRunner();
            await qr.connect();
            await qr.startTransaction();
            try {
                const result = await work({ qr });
                await qr.commitTransaction();
                return result;
            } catch (error) {
                await qr.rollbackTransaction();
                throw error;
            } finally {
                await qr.release();
            }
        },
        getRepository: (c: TxCtx, entity?: unknown) =>
            entity && typeof entity !== 'string'
                ? ((c.qr ?? dataSource).manager as DataSource['manager']).getRepository(
                      entity as never,
                  )
                : { query: (sql: string, p: unknown[]) => runIn(c, sql, p) },
    };
    const counterpartyService = {
        async getForCustomer(_ctx: unknown, customerId: number) {
            const rows = await run(
                `SELECT c.* FROM counterparty c
                 INNER JOIN customer cu ON cu."customFieldsCounterpartyid"::text = c.id::text
                 WHERE cu.id = $1`,
                [customerId],
            );
            return rows[0] ?? null;
        },
    };
    const exposureService = new OpenDeferredExposureService(
        connection as never,
        {
            getSettings: async () => ({
                customFields: { deferredOrderMaxAgeDays: state.maxAgeDays },
            }),
        } as never,
    );
    const assessment = new DeferredCreditAssessmentService(
        counterpartyService as never,
        new CreditLimitCheckService(null as never, null as never),
        exposureService,
        {
            resolveEffective: async () => ({ prepaymentReserveDays: state.reserveDays }),
        } as never,
        { getPreferredForCustomer: async () => null } as never,
        {
            resolve: async () => ({
                enabled: true,
                consequence: state.allowExceeding ? 'warn' : 'hold',
            }),
        } as never,
    );
    const registry = new CheckRegistry();
    registry.registerSubjectType({
        type: 'order',
        stages: ['placement'],
        allowedConsequences: ['info', 'warn', 'hold'],
        ephemeral: true,
        branchId: (subject: { branchId: string | null }) => subject.branchId,
    });
    new PlacementConfirmationCheckRegistrar(registry).onModuleInit();
    const checks = new ChecksService(
        connection as never,
        registry,
        new CheckPolicyService(connection as never, registry, null as never, null as never),
    );
    const placement = new CreditPlacementService(
        connection as never,
        counterpartyService as never,
        assessment,
        { getEligiblePaymentMethods: async () => [] } as never,
        checks,
    );

    async function setCasePolicy(
        checkCode: string,
        consequence: string,
        enabled = true,
        branchId: string | null = null,
    ): Promise<void> {
        await run(
            `INSERT INTO check_policy ("uuid", "checkCode", stage, "branchId", consequence, enabled)
             VALUES (gen_random_uuid(), $1, 'placement', $2, $3, $4)`,
            [checkCode, branchId, consequence, enabled],
        );
    }

    async function addShippingLine(orderId: number, methodCode: string): Promise<void> {
        const [m] = await run(`INSERT INTO shipping_method (code) VALUES ($1) RETURNING id`, [
            methodCode,
        ]);
        await run(`INSERT INTO shipping_line ("orderId", "shippingMethodId") VALUES ($1, $2)`, [
            orderId,
            m.id,
        ]);
    }

    async function addBuyer(
        creditLimit: number,
        creditBalance = 0,
        delayDays = 14,
    ): Promise<Buyer> {
        const [cp] = await run(
            `INSERT INTO counterparty ("erpId", "creditLimit", "creditBalance", "paymentDelayDays")
             VALUES ($1, $2, $3, $4) RETURNING id`,
            [`cnt-${Math.random()}`, creditLimit, creditBalance, delayDays],
        );
        const [cu] = await run(
            `INSERT INTO customer ("customFieldsCounterpartyid") VALUES ($1) RETURNING id`,
            [String(cp.id)],
        );
        return { customerId: Number(cu.id), counterpartyId: Number(cp.id) };
    }

    async function addPayment(
        orderId: number,
        method: string,
        paymentState: string,
        kopecks: number,
        metadata: object = {},
    ): Promise<void> {
        await run(
            `INSERT INTO payment ("orderId", method, state, amount, metadata) VALUES ($1, $2, $3, $4, $5)`,
            [orderId, method, paymentState, kopecks, JSON.stringify(metadata)],
        );
    }

    async function addOrderRow(
        buyer: Buyer,
        rubles: number,
        placedDaysAgo = 0,
        erpStatus = 'PENDING',
        state = 'PaymentAuthorized',
    ): Promise<number> {
        const [o] = await run(
            `INSERT INTO "order" ("customerId", "customFieldsErpstatus", state, "orderPlacedAt", "subTotalWithTax")
             VALUES ($1, $2, $3, now() - make_interval(days => $4::int), $5) RETURNING id`,
            [buyer.customerId, erpStatus, state, placedDaysAgo, Math.round(rubles * 100)],
        );
        return Number(o.id);
    }

    async function addOrder(
        buyer: Buyer,
        rubles: number,
        opts: {
            erpStatus?: string;
            method?: string;
            paymentState?: string;
            state?: string;
            placedDaysAgo?: number;
            metadata?: object;
        } = {},
    ): Promise<number> {
        const id = await addOrderRow(buyer, rubles, opts.placedDaysAgo, opts.erpStatus, opts.state);
        await addPayment(
            id,
            opts.method ?? 'cash',
            opts.paymentState ?? 'Authorized',
            Math.round(rubles * 100),
            opts.metadata,
        );
        return id;
    }

    const orderOf = (buyer: Buyer, rubles: number, id = 999_999): Order =>
        ({
            id,
            totalWithTax: Math.round(rubles * 100),
            customer: { id: buyer.customerId },
        }) as unknown as Order;

    async function place(
        buyer: Buyer,
        rubles: number,
        form: PaymentForm = 'cash',
        orderId = 999_999,
        metadata: Record<string, unknown> = {},
    ): Promise<PlacementResult> {
        return placement.place(ctx, orderOf(buyer, rubles, orderId), form, metadata);
    }

    beforeAll(async () => {
        await createTestSchema(schema);
        dataSource = new DataSource({
            type: 'postgres',
            ...testDataSourceConnectionOptions(),
            schema,
            extra,
            entities: [OrderStatusReference, CheckPolicy],
        });
        await dataSource.initialize();
        await dataSource.synchronize();
        await seedTestOrderStatuses((sql, params) => dataSource.query(sql, params));
        await run(`CREATE TABLE counterparty (
            id serial PRIMARY KEY, "erpId" varchar, "creditLimit" bigint NOT NULL DEFAULT 0,
            "creditBalance" bigint NOT NULL DEFAULT 0, "paymentDelayDays" integer NOT NULL DEFAULT 0)`);
        await run(
            `CREATE TABLE customer (id serial PRIMARY KEY, "customFieldsCounterpartyid" varchar)`,
        );
        await run(`CREATE TABLE "order" (
            id serial PRIMARY KEY, "customerId" int, "customFieldsErpstatus" varchar,
            state varchar, "orderPlacedAt" timestamp,
            "subTotalWithTax" int NOT NULL DEFAULT 0, "shippingWithTax" int NOT NULL DEFAULT 0)`);
        await run(`CREATE TABLE shipping_method (id serial PRIMARY KEY, code varchar NOT NULL)`);
        await run(
            `CREATE TABLE shipping_line (id serial PRIMARY KEY, "orderId" int, "shippingMethodId" int)`,
        );
        await run(`CREATE TABLE payment (
            id serial PRIMARY KEY, "orderId" int, method varchar, state varchar, amount int,
            metadata text NOT NULL DEFAULT '{}', "createdAt" timestamp NOT NULL DEFAULT now())`);
    });

    afterAll(async () => {
        await dataSource.destroy();
        await dropTestSchema(schema);
    });

    beforeEach(async () => {
        state.maxAgeDays = 7;
        state.allowExceeding = false;
        state.reserveDays = 3;
        await run(
            `TRUNCATE shipping_line, shipping_method, check_policy, payment, "order", customer, counterparty RESTART IDENTITY`,
        );
    });

    return {
        state,
        run,
        addBuyer,
        addOrder,
        addOrderRow,
        addPayment,
        place,
        setCasePolicy,
        addShippingLine,
        connection,
        placement,
        ctx,
        get dataSource() {
            return dataSource;
        },
    };
}
