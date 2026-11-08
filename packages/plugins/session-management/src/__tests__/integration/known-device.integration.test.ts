import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { DataSource } from 'typeorm';
import type { EventBus, RequestContext, User } from '@vendure/core';
import {
    createTestConnection,
    createTestSchema,
    dropTestSchema,
    testDataSourceConnectionOptions,
    testSchemaOptions,
} from 'shared';

import { KnownDeviceService } from '../../known-device.service';

const { schema, extra } = testSchemaOptions('known_device');
let dataSource: DataSource;
let publish: ReturnType<typeof vi.fn>;

const CHROME = 'Mozilla/5.0 (Windows NT 10.0) Chrome/120.0 Safari/537.36';

function signIn(cookie: string | undefined, userId = 1): Promise<boolean> {
    const req = {
        headers: { cookie: cookie ? `mv_device=${cookie}` : undefined, 'user-agent': CHROME },
    };
    const ctx = { req } as unknown as RequestContext;
    const service = new KnownDeviceService(createTestConnection(dataSource), {
        publish,
    } as unknown as EventBus);
    return service.recordSignIn(ctx, { id: userId } as User, ctx);
}

beforeAll(async () => {
    await createTestSchema(schema);
    dataSource = new DataSource({ type: 'postgres', ...testDataSourceConnectionOptions(), extra });
    await dataSource.initialize();
    await dataSource.query(`CREATE TABLE known_device (
        id serial PRIMARY KEY, uuid uuid NOT NULL, "userId" varchar NOT NULL, "deviceHash" varchar NOT NULL,
        label varchar NOT NULL, "lastSeenAt" timestamptz NOT NULL,
        "createdAt" timestamp NOT NULL DEFAULT now(), "updatedAt" timestamp NOT NULL DEFAULT now(),
        UNIQUE ("userId", "deviceHash")
    )`);
    await dataSource.query(
        'CREATE TABLE "user" (id integer PRIMARY KEY, "customFieldsNewdeviceemailenabled" boolean NOT NULL DEFAULT true)',
    );
});

afterAll(async () => {
    await dataSource.destroy();
    await dropTestSchema(schema);
});

beforeEach(async () => {
    await dataSource.query('TRUNCATE known_device');
    await dataSource.query('TRUNCATE "user"');
    await dataSource.query('INSERT INTO "user" (id) VALUES (1), (2)');
    publish = vi.fn();
});

describe('KnownDeviceService (integration, real Postgres)', () => {
    it('does not notify on the first sign-in ever of an account', async () => {
        expect(await signIn('device-a')).toBe(false);
        expect(publish).not.toHaveBeenCalled();
    });

    it('does not notify for a known device, notifies for an unknown one', async () => {
        await signIn('device-a');

        expect(await signIn('device-a')).toBe(false);
        expect(await signIn('device-b')).toBe(true);
        expect(await signIn('device-b')).toBe(false);
        expect(publish).toHaveBeenCalledTimes(1);
    });

    it('keeps devices per account', async () => {
        await signIn('device-a', 1);
        await signIn('device-b', 2);

        expect(await signIn('device-a', 2)).toBe(true);
    });

    it('registers but stays silent when the owner switched the e-mail off', async () => {
        await signIn('device-a');
        await dataSource.query(
            'UPDATE "user" SET "customFieldsNewdeviceemailenabled" = false WHERE id = 1',
        );

        expect(await signIn('device-b')).toBe(false);
        expect(await signIn('device-b')).toBe(false);
        expect(publish).not.toHaveBeenCalled();
    });

    it('notifies once when the same new device signs in twice in parallel', async () => {
        await signIn('device-a');

        const results = await Promise.all([signIn('device-b'), signIn('device-b')]);

        expect(results.filter(Boolean)).toHaveLength(1);
        expect(publish).toHaveBeenCalledTimes(1);
    });
});
