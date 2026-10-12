import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
    Column,
    DataSource,
    Entity,
    Index,
    JoinColumn,
    OneToOne,
    PrimaryColumn,
    PrimaryGeneratedColumn,
} from 'typeorm';
import {
    createTestSchema,
    dropTestSchema,
    testDataSourceConnectionOptions,
    testSchemaOptions,
} from 'shared';

import { migrateOrderLineIdentity } from '../../order-line-identity.migration-sql';

// Pre-#221 shape of the Vendure tables the migration touches, against real Postgres.
@Entity('order_line')
class LegacyOrderLine {
    @PrimaryGeneratedColumn() id!: number;
}

// Same decorators as OrderLineIdentity, pointed at the stand-in order_line (Vendure's OrderLine
// needs a bootstrapped app), to prove the migration DDL is what synchronize expects.
@Entity('order_line_identity')
class MirrorOrderLineIdentity {
    @PrimaryColumn({ type: 'integer' }) orderLineId!: number;
    @OneToOne(() => LegacyOrderLine, { onDelete: 'CASCADE' })
    @JoinColumn({ name: 'orderLineId' })
    orderLine?: LegacyOrderLine;
    @Index({ unique: true }) @Column({ type: 'uuid' }) uuid!: string;
}

const { schema, extra } = testSchemaOptions('order_line_identity_migration');
let ds: DataSource;
const migrate = (): Promise<{ mergedLines: number }> =>
    migrateOrderLineIdentity(sql => ds.query(sql));

const U = (n: number): string => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;

async function seed(): Promise<void> {
    await ds.query(`DROP TABLE IF EXISTS "order_line_identity", "order_line", "order"`);
    await ds.query(`CREATE TABLE "order" ("id" integer PRIMARY KEY, "state" varchar NOT NULL)`);
    await ds.query(`CREATE TABLE "order_line" (
        "id" serial PRIMARY KEY, "orderId" integer REFERENCES "order"("id"), "productVariantId" integer NOT NULL,
        "quantity" integer NOT NULL, "listPrice" integer NOT NULL, "adjustments" text NOT NULL DEFAULT '[]',
        "createdAt" timestamp NOT NULL, "customFieldsOrganizationid" integer, "customFieldsManualunitprice" integer,
        "customFieldsManualpricereason" varchar(255), "customFieldsUuid" varchar(255) UNIQUE)`);
    await ds.query(`INSERT INTO "order" VALUES (1, 'AddingItems'), (2, 'PaymentSettled')`);
    // id, order, variant, qty, price, adjustments, minute, organization
    const lines: Array<[number, number, number, number, number, string, number, number | null]> = [
        [1, 1, 10, 2, 500, '[]', 2, null], // merged into line 2 (older)
        [2, 1, 10, 3, 500, '[]', 1, null],
        [3, 1, 10, 4, 500, '[]', 3, 9], // other organization: own line
        [4, 1, 11, 1, 500, '[]', 1, null], // different list prices: left alone
        [5, 1, 11, 1, 600, '[]', 2, null],
        [6, 2, 10, 1, 500, '[]', 1, null], // placed order: left alone
        [7, 2, 10, 1, 500, '[]', 2, null],
    ];
    for (const [id, orderId, variant, qty, price, adj, minute, org] of lines) {
        await ds.query(
            `INSERT INTO "order_line" VALUES ($1, $2, $3, $4, $5, $6, timestamp '2026-01-01' + $7 * interval '1 minute', $8, NULL, NULL, $9)`,
            [id, orderId, variant, qty, price, adj, minute, org, U(id)],
        );
    }
}

beforeAll(async () => {
    await createTestSchema(schema);
    ds = new DataSource({
        type: 'postgres',
        ...testDataSourceConnectionOptions(),
        schema,
        extra,
        entities: [LegacyOrderLine, MirrorOrderLineIdentity],
    });
    await ds.initialize();
});

afterAll(async () => {
    await ds.destroy();
    await dropTestSchema(schema);
});

beforeEach(seed);

const identities = async (): Promise<Record<number, string>> =>
    Object.fromEntries(
        (await ds.query(`SELECT "orderLineId", "uuid" FROM "order_line_identity"`)).map(
            (r: { orderLineId: number; uuid: string }) => [r.orderLineId, r.uuid],
        ),
    );

describe('order_line_identity migration', () => {
    it('keeps every surviving line uuid and merges only safe cart duplicates', async () => {
        expect(await migrate()).toEqual({ mergedLines: 1 });

        const lines = await ds.query(`SELECT "id", "quantity" FROM "order_line" ORDER BY "id"`);
        expect(lines).toEqual([
            { id: 2, quantity: 5 },
            { id: 3, quantity: 4 },
            { id: 4, quantity: 1 },
            { id: 5, quantity: 1 },
            { id: 6, quantity: 1 },
            { id: 7, quantity: 1 },
        ]);
        expect(await identities()).toEqual({
            2: U(2),
            3: U(3),
            4: U(4),
            5: U(5),
            6: U(6),
            7: U(7),
        });
    });

    it('is a no-op when run again', async () => {
        await migrate();
        const before = await identities();

        expect(await migrate()).toEqual({ mergedLines: 0 });
        expect(await identities()).toEqual(before);
    });

    it('removes the identity row with its line', async () => {
        await migrate();
        await ds.query(`DELETE FROM "order_line" WHERE "id" = 3`);

        expect((await identities())[3]).toBeUndefined();
    });

    it('creates the table exactly as TypeORM synchronize would', async () => {
        await migrate();

        const pending = await ds.driver.createSchemaBuilder().log();
        const identityChanges = pending.upQueries
            .map(q => q.query)
            .filter(q => q.includes('order_line_identity'));
        expect(identityChanges).toEqual([]);
    });
});
