import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Column, DataSource, Entity, PrimaryGeneratedColumn } from 'typeorm';
import {
    createTestSchema,
    dropTestSchema,
    testDataSourceConnectionOptions,
    testSchemaOptions,
} from 'shared';

import { resolveRequestActor, sqlActorLookups } from '../../change-journal-actor';
import { runInChangeScope } from '../../change-journal-context';
import { ChangeJournalSubscriber } from '../../change-journal.subscriber';
import { CHANGE_JOURNAL_DDL } from './change-journal-ddl';

@Entity('actor_probe')
class ActorProbe {
    @PrimaryGeneratedColumn() id!: number;
    @Column({ type: 'varchar' }) name!: string;
}

const { schema, extra } = testSchemaOptions('change_journal_actor');
let ds: DataSource;

function scope(apiType: string, activeUserId: number, token?: string) {
    const ctx = { apiType, activeUserId };
    return {
        source: `${apiType}-api:test`,
        journaled: true,
        requestId: 'r',
        sessionId: () => null,
        resolveActor: (runner: { query(sql: string, p?: unknown[]): Promise<unknown> }) =>
            resolveRequestActor(ctx, sqlActorLookups(runner, token)),
    };
}

beforeAll(async () => {
    await createTestSchema(schema);
    // One pooled connection: a lookup on a second connection would wait forever behind the open write.
    ds = new DataSource({
        type: 'postgres',
        ...testDataSourceConnectionOptions(),
        schema,
        extra: { ...extra, max: 1 },
        entities: [ActorProbe],
        subscribers: [ChangeJournalSubscriber],
        synchronize: true,
    });
    await ds.initialize();
    await ds.query(CHANGE_JOURNAL_DDL);
    await ds.query(
        `CREATE TABLE administrator ("id" serial PRIMARY KEY, "userId" integer, "deletedAt" timestamp)`,
    );
    await ds.query(`CREATE TABLE session ("token" varchar PRIMARY KEY, "invalidated" boolean NOT NULL,
        "customFieldsActingadministratorid" varchar)`);
    await ds.query(`INSERT INTO administrator ("id", "userId") VALUES (5, 3)`);
    await ds.query(
        `INSERT INTO session VALUES ('acting-token', false, '5'), ('plain-token', false, NULL)`,
    );
}, 30_000);

afterAll(async () => {
    await ds?.destroy();
    await dropTestSchema(schema);
});

async function writeInTransaction(s: ReturnType<typeof scope>): Promise<Record<string, unknown>> {
    await runInChangeScope(s, () =>
        ds.transaction(em => em.save(em.create(ActorProbe, { name: 'x' }))),
    );
    const rows = (await ds.query(
        `SELECT "actorType", "userId", "administratorId" FROM change_journal_entry ORDER BY id DESC LIMIT 1`,
    )) as Record<string, unknown>[];
    return rows[0];
}

describe('actor lookups run on the writing connection (pool of one)', () => {
    it('an administrator write resolves the administrator without a second connection', async () => {
        expect(await writeInTransaction(scope('admin', 3))).toEqual({
            actorType: 'administrator',
            userId: '3',
            administratorId: '5',
        });
    }, 10_000);

    it('an acting write resolves the acting administrator from the session row', async () => {
        expect(await writeInTransaction(scope('shop', 9, 'acting-token'))).toEqual({
            actorType: 'acting',
            userId: '9',
            administratorId: '5',
        });
    }, 10_000);

    it('a plain customer session is the customer', async () => {
        expect(await writeInTransaction(scope('shop', 9, 'plain-token'))).toEqual({
            actorType: 'customer',
            userId: '9',
            administratorId: null,
        });
    }, 10_000);
});
