import { readFileSync } from 'fs';
import path from 'path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { DataSource } from 'typeorm';
import {
    createTestSchema,
    dropTestSchema,
    testDataSourceConnectionOptions,
    testSchemaOptions,
} from 'shared';

const { schema, extra } = testSchemaOptions('renumber_documents_207');
const INSTANCE_CODE = '100';

let dataSource: DataSource;

function loadScript(): string {
    const raw = readFileSync(
        path.resolve(
            __dirname,
            '../../../../../../infrastructure/scripts/renumber-documents-207.sql',
        ),
        'utf-8',
    );
    return raw
        .split('\n')
        .filter(line => !line.trimStart().startsWith('\\set'))
        .join('\n')
        .split(':instance_code_lit')
        .join(`'${INSTANCE_CODE}'`);
}

async function runScript(): Promise<void> {
    await dataSource.query(loadScript());
}

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

    await dataSource.query(`
        CREATE TABLE "order" (id SERIAL PRIMARY KEY, code VARCHAR NOT NULL, "createdAt" TIMESTAMP NOT NULL DEFAULT now());
        CREATE TABLE invoice (id SERIAL PRIMARY KEY, "orderId" INT NOT NULL, number VARCHAR NOT NULL, "createdAt" TIMESTAMP NOT NULL DEFAULT now());
        CREATE TABLE payment_attempt (id SERIAL PRIMARY KEY, number VARCHAR NOT NULL, "createdAt" TIMESTAMP NOT NULL DEFAULT now());
        CREATE TABLE payment_refund (id SERIAL PRIMARY KEY, number VARCHAR NOT NULL, "createdAt" TIMESTAMP NOT NULL DEFAULT now());
        CREATE TABLE discount_grant (id SERIAL PRIMARY KEY, number VARCHAR NOT NULL, "createdAt" TIMESTAMP NOT NULL DEFAULT now());
    `);
});

afterAll(async () => {
    await dataSource.destroy();
    await dropTestSchema(schema);
});

describe('renumber-documents-207.sql', () => {
    it('renumbers legacy-format rows and leaves already-new-format rows untouched', async () => {
        await dataSource.query(`
            INSERT INTO "order" (code, "createdAt") VALUES
                ('ORD-202501-AAAAAAAA', now() - interval '2 days'),
                ('ORD-202501-BBBBBBBB', now() - interval '1 days');
            INSERT INTO invoice ("orderId", number) VALUES (1, 'INV-202501-CCCCCCCC'), (1, 'INV-202501-DDDDDDDD'), (2, 'INV-202501-EEEEEEEE');
            INSERT INTO payment_attempt (number) VALUES ('PAY-202501-FFFFFFFF');
            INSERT INTO payment_refund (number) VALUES ('12345'), ('1000000099');
            INSERT INTO discount_grant (number) VALUES ('DSC-202501-GGGGGGGG');
        `);

        await runScript();

        const orders: Array<{ id: number; code: string }> = await dataSource.query(
            `SELECT id, code FROM "order" ORDER BY id`,
        );
        expect(orders.map(o => o.code)).toEqual(['1000000001', '1000000002']);

        const invoices: Array<{ id: number; orderId: number; number: string }> =
            await dataSource.query(`SELECT id, "orderId", number FROM invoice ORDER BY id`);
        expect(invoices.map(i => i.number)).toEqual([
            '1000000001-01',
            '1000000001-02',
            '1000000002-01',
        ]);

        const payments: Array<{ number: string }> = await dataSource.query(
            `SELECT number FROM payment_attempt ORDER BY id`,
        );
        expect(payments[0].number).toBe('1000000001');

        const refunds: Array<{ number: string }> = await dataSource.query(
            `SELECT number FROM payment_refund ORDER BY id`,
        );
        expect(refunds[0].number).toBe('1000000001');
        // Already matches the new format (instance code + 7 digits) — left untouched.
        expect(refunds[1].number).toBe('1000000099');

        const grants: Array<{ number: string }> = await dataSource.query(
            `SELECT number FROM discount_grant ORDER BY id`,
        );
        expect(grants[0].number).toBe('1000000001');

        const snapshot = async (): Promise<Record<string, unknown[]>> => ({
            orders: await dataSource.query(`SELECT code FROM "order" ORDER BY id`),
            invoices: await dataSource.query(`SELECT number FROM invoice ORDER BY id`),
            payments: await dataSource.query(`SELECT number FROM payment_attempt ORDER BY id`),
            refunds: await dataSource.query(`SELECT number FROM payment_refund ORDER BY id`),
            grants: await dataSource.query(`SELECT number FROM discount_grant ORDER BY id`),
        });
        const beforeRerun = await snapshot();
        await runScript();
        expect(await snapshot()).toEqual(beforeRerun);
    });
});
