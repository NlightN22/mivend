import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
    Column,
    DataSource,
    DeleteDateColumn,
    Entity,
    PrimaryGeneratedColumn,
    UpdateDateColumn,
} from 'typeorm';
import {
    createTestSchema,
    dropTestSchema,
    testDataSourceConnectionOptions,
    testSchemaOptions,
} from 'shared';

import type { ChangeActor } from '../../change-journal.types';
import { runAsSystem, runInChangeScope } from '../../change-journal-context';
import { ChangeJournalSubscriber } from '../../change-journal.subscriber';
import { CHANGE_JOURNAL_DDL } from './change-journal-ddl';

@Entity('journal_probe')
class JournalProbe {
    @PrimaryGeneratedColumn() id!: number;
    @Column({ type: 'uuid', nullable: true }) uuid!: string | null;
    @Column({ type: 'varchar' }) name!: string;
    @Column({ type: 'varchar', nullable: true }) passwordHash!: string | null;
    @UpdateDateColumn() updatedAt!: Date;
    @DeleteDateColumn() deletedAt!: Date | null;
}

// Stands in for an excluded entity: only the class name decides.
@Entity('probe_session')
class Session {
    @PrimaryGeneratedColumn() id!: number;
    @Column({ type: 'varchar' }) token!: string;
}

interface Row {
    entityType: string;
    entityId: string;
    entityUuid: string | null;
    action: string;
    actorType: string;
    userId: string | null;
    administratorId: string | null;
    source: string;
    requestId: string | null;
    sessionId: string | null;
    changes: Record<string, { before?: unknown; after?: unknown; redacted?: true }>;
}

const { schema, extra } = testSchemaOptions('change_journal_subscriber');
let ds: DataSource;

const entries = (): Promise<Row[]> =>
    ds.query(`SELECT * FROM change_journal_entry ORDER BY id`) as Promise<Row[]>;

function asActor<T>(actor: ChangeActor, source: string, work: () => Promise<T>): Promise<T> {
    return runInChangeScope(
        {
            source,
            requestId: 'req-1',
            sessionId: () => 's-1',
            resolveActor: () => Promise.resolve(actor),
        },
        work,
    );
}

beforeAll(async () => {
    await createTestSchema(schema);
    ds = new DataSource({
        type: 'postgres',
        ...testDataSourceConnectionOptions(),
        schema,
        extra,
        entities: [JournalProbe, Session],
        subscribers: [ChangeJournalSubscriber],
        synchronize: true,
    });
    await ds.initialize();
    await ds.query(CHANGE_JOURNAL_DDL);
});

afterAll(async () => {
    await ds?.destroy();
    await dropTestSchema(schema);
});

beforeEach(async () => {
    await ds.query(`TRUNCATE change_journal_entry, journal_probe, probe_session`);
});

describe('change journal subscriber (real Postgres)', () => {
    it('insert, update and remove each write one entry with the right action and values', async () => {
        const repo = ds.getRepository(JournalProbe);
        const probe = await repo.save(
            repo.create({ name: 'a', uuid: '00000000-0000-4000-8000-000000000001' }),
        );
        probe.name = 'b';
        await repo.save(probe);
        const id = probe.id;
        await repo.remove(probe);
        const rows = await entries();
        expect(rows.map(r => [r.action, r.entityType, r.entityId])).toEqual([
            ['insert', 'JournalProbe', String(id)],
            ['update', 'JournalProbe', String(id)],
            ['remove', 'JournalProbe', String(id)],
        ]);
        expect(rows[0].entityUuid).toBe('00000000-0000-4000-8000-000000000001');
        expect(rows[0].changes.name).toEqual({ after: 'a' });
        expect(rows[1].changes).toEqual({ name: { before: 'a', after: 'b' } });
        expect(rows[2].changes.name).toEqual({ before: 'b' });
    });

    it('soft remove and recover are journaled', async () => {
        const repo = ds.getRepository(JournalProbe);
        const probe = await repo.save(repo.create({ name: 'a' }));
        await repo.softRemove(probe);
        await repo.recover(probe);
        expect((await entries()).map(r => r.action)).toEqual(['insert', 'soft-remove', 'recover']);
    });

    it('a save with no changed column writes no entry', async () => {
        const repo = ds.getRepository(JournalProbe);
        const probe = await repo.save(repo.create({ name: 'a' }));
        await repo.save(probe);
        expect(await entries()).toHaveLength(1);
    });

    it('the entry rolls back with the change it records', async () => {
        await expect(
            ds.transaction(async em => {
                await em.save(em.create(JournalProbe, { name: 'doomed' }));
                expect(
                    await em.query(`SELECT count(*)::int AS n FROM change_journal_entry`),
                ).toEqual([{ n: 1 }]);
                throw new Error('abort');
            }),
        ).rejects.toThrow('abort');
        expect(await entries()).toEqual([]);
        expect(await ds.getRepository(JournalProbe).count()).toBe(0);
    });

    it('a failing journal write fails the change itself', async () => {
        await ds.query(`ALTER TABLE change_journal_entry RENAME TO change_journal_entry_off`);
        try {
            await expect(
                ds.getRepository(JournalProbe).save({ name: 'x' } as JournalProbe),
            ).rejects.toThrow();
            expect(await ds.getRepository(JournalProbe).count()).toBe(0);
        } finally {
            await ds.query(`ALTER TABLE change_journal_entry_off RENAME TO change_journal_entry`);
        }
    });

    it('never stores a secret value, only that it changed', async () => {
        const repo = ds.getRepository(JournalProbe);
        const probe = await repo.save(repo.create({ name: 'a', passwordHash: 'hash-one' }));
        probe.passwordHash = 'hash-two';
        await repo.save(probe);
        const raw = (await ds.query(`SELECT changes::text AS c FROM change_journal_entry`)) as {
            c: string;
        }[];
        expect(raw.map(r => r.c).join()).not.toMatch(/hash-one|hash-two/);
        const rows = await entries();
        expect(rows[0].changes.passwordHash).toEqual({ redacted: true });
        expect(rows[1].changes).toEqual({ passwordHash: { redacted: true } });
    });

    it('excluded entities are not journaled', async () => {
        await ds.getRepository(Session).save({ token: 't' });
        expect(await entries()).toEqual([]);
    });

    it.each([
        [{ actorType: 'administrator', userId: '3', administratorId: '5' }, 'admin-api:updateX'],
        [{ actorType: 'customer', userId: '9', administratorId: null }, 'shop-api:updateX'],
        [{ actorType: 'acting', userId: '9', administratorId: '4' }, 'shop-api:updateX'],
    ] as const)('records the scope actor %o', async (actor, source) => {
        await asActor(actor, source, () =>
            ds.getRepository(JournalProbe).save({ name: 'a' } as JournalProbe),
        );
        const [row] = await entries();
        expect(row).toMatchObject({ ...actor, source, requestId: 'req-1', sessionId: 's-1' });
    });

    it('a write in a labelled task is a system entry with that source', async () => {
        await runAsSystem('scheduled-task:erp-integration-inbox-bulk', () =>
            ds.getRepository(JournalProbe).save({ name: 'erp' } as JournalProbe),
        );
        const [row] = await entries();
        expect(row).toMatchObject({
            actorType: 'system',
            userId: null,
            administratorId: null,
            source: 'scheduled-task:erp-integration-inbox-bulk',
        });
    });

    it('a write outside any scope is still recorded, as a background system entry', async () => {
        await ds.getRepository(JournalProbe).save({ name: 'bg' } as JournalProbe);
        expect((await entries())[0]).toMatchObject({ actorType: 'system', source: 'background' });
    });

    it('documented gap: query-builder bulk updates and raw SQL are not journaled', async () => {
        const probe = await ds.getRepository(JournalProbe).save({ name: 'a' } as JournalProbe);
        await ds.getRepository(JournalProbe).update({ id: probe.id }, { name: 'b' });
        await ds.query(`UPDATE journal_probe SET name = 'c' WHERE id = $1`, [probe.id]);
        expect((await entries()).map(r => r.action)).toEqual(['insert']);
    });

    it('concurrent writers on one row each get their own entry with a consistent before/after chain', async () => {
        const probe = await ds.getRepository(JournalProbe).save({ name: '0' } as JournalProbe);
        await Promise.all(
            Array.from({ length: 8 }, () =>
                ds.transaction(async em => {
                    const row = await em.findOneOrFail(JournalProbe, {
                        where: { id: probe.id },
                        lock: { mode: 'pessimistic_write' },
                    });
                    row.name = String(Number(row.name) + 1);
                    await em.save(row);
                }),
            ),
        );
        const updates = (await entries()).filter(r => r.action === 'update');
        expect(updates).toHaveLength(8);
        expect(updates.map(u => [u.changes.name.before, u.changes.name.after])).toEqual(
            Array.from({ length: 8 }, (_, i) => [String(i), String(i + 1)]),
        );
    });
});
