import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { DataSource } from 'typeorm';
import type { RequestContext, TransactionalConnection } from '@vendure/core';
import {
    createTestSchema,
    dropTestSchema,
    testDataSourceConnectionOptions,
    testSchemaOptions,
} from 'shared';

import { ContactPointService } from '../../contact-point.service';

const { schema, extra } = testSchemaOptions('chosen_contacts');
const ctx = {} as RequestContext;
let dataSource: DataSource;
let service: ContactPointService;

beforeAll(async () => {
    await createTestSchema(schema);
    dataSource = new DataSource({
        type: 'postgres',
        ...testDataSourceConnectionOptions(),
        schema,
        extra,
    });
    await dataSource.initialize();
    await dataSource.query(`CREATE TABLE counterparty (id int PRIMARY KEY, phone varchar,
        "officialEmail" varchar)`);
    await dataSource.query(`CREATE TABLE contact_point (id serial PRIMARY KEY, type varchar,
        "normalizedValue" varchar, "isUsable" boolean, source varchar)`);
    await dataSource.query(`CREATE TABLE counterparty_contact_point (id serial PRIMARY KEY,
        "contactPointId" int, "counterpartyId" int, "isPrimary" boolean)`);
    service = new ContactPointService({
        getRepository: () => dataSource.getRepository('counterparty'),
    } as unknown as TransactionalConnection);
}, 30_000);

afterAll(async () => {
    await dataSource.destroy();
    await dropTestSchema(schema);
});

beforeEach(async () => {
    await dataSource.query(
        'TRUNCATE counterparty, contact_point, counterparty_contact_point RESTART IDENTITY',
    );
});

async function channel(
    owner: number,
    type: string,
    value: string | null,
    opts: { usable?: boolean; primary?: boolean; source?: string } = {},
): Promise<void> {
    const [{ id }] = await dataSource.query(
        `INSERT INTO contact_point (type, "normalizedValue", "isUsable", source)
         VALUES ($1, $2, $3, $4) RETURNING id`,
        [type, value, opts.usable ?? true, opts.source ?? 'erp'],
    );
    await dataSource.query(
        `INSERT INTO counterparty_contact_point ("contactPointId", "counterpartyId", "isPrimary")
         VALUES ($1, $2, $3)`,
        [id, owner, opts.primary ?? false],
    );
}

describe('ContactPointService.chosenContacts', () => {
    it('prefers the primary usable channel, manual and ERP equally', async () => {
        await dataSource.query(`INSERT INTO counterparty VALUES (1, '+1000', 'old@example.test')`);
        await channel(1, 'email', 'first@example.test');
        await channel(1, 'email', 'primary@example.test', { primary: true, source: 'manual' });
        await channel(1, 'email', null, { usable: false, primary: true });
        await channel(1, 'phone', '+2000');
        const chosen = (await service.chosenContacts(ctx, [1])).get('1');
        expect(chosen).toEqual({ email: 'primary@example.test', phone: '+2000' });
    });

    it('falls back to the legacy columns only when the counterparty has no channel of that type', async () => {
        await dataSource.query(`INSERT INTO counterparty VALUES (1, '+1000', 'old@example.test')`);
        await dataSource.query(`INSERT INTO counterparty VALUES (2, '+1000', 'old@example.test')`);
        await dataSource.query(`INSERT INTO counterparty VALUES (3, '', NULL)`);
        await channel(2, 'phone', null, { usable: false });
        const chosen = await service.chosenContacts(ctx, [1, 2, 3]);
        expect(chosen.get('1')).toEqual({ email: 'old@example.test', phone: '+1000' });
        expect(chosen.get('2')).toEqual({ email: 'old@example.test', phone: null });
        expect(chosen.get('3')).toEqual({ email: null, phone: null });
    });
});
