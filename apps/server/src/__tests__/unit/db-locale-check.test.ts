import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const pgMock = vi.hoisted(() => ({
    connect: vi.fn(),
    query: vi.fn(),
    end: vi.fn(),
}));

vi.mock('pg', () => ({
    Client: class {
        connect = pgMock.connect;
        query = pgMock.query;
        end = pgMock.end;
    },
}));

import { assertDatabaseLocale } from '../../db-locale-check';

function mockLocale(daticulocale: string | null): void {
    pgMock.query.mockResolvedValue({ rows: [{ daticulocale }] });
}

describe('assertDatabaseLocale', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        vi.stubEnv('NODE_ENV', 'production');
        vi.stubEnv('DB_EXPECTED_LOCALE', 'ru-RU');
    });

    afterEach(() => {
        vi.unstubAllEnvs();
    });

    it('skips the check outside production without touching the database', async () => {
        vi.stubEnv('NODE_ENV', 'development');

        await expect(assertDatabaseLocale()).resolves.toBeUndefined();
        expect(pgMock.connect).not.toHaveBeenCalled();
    });

    it('refuses to boot in production when DB_EXPECTED_LOCALE is unset', async () => {
        vi.stubEnv('DB_EXPECTED_LOCALE', '');

        await expect(assertDatabaseLocale()).rejects.toThrow(/DB_EXPECTED_LOCALE must be set/);
        expect(pgMock.connect).not.toHaveBeenCalled();
    });

    it('passes when the database ICU locale matches', async () => {
        mockLocale('ru-RU');

        await expect(assertDatabaseLocale()).resolves.toBeUndefined();
        expect(pgMock.end).toHaveBeenCalledOnce();
    });

    it('refuses to boot on a mismatched locale and still closes the connection', async () => {
        mockLocale('en-US');

        await expect(assertDatabaseLocale()).rejects.toThrow(
            /ICU locale "en-US", expected "ru-RU"/,
        );
        expect(pgMock.end).toHaveBeenCalledOnce();
    });

    it('refuses to boot on a non-ICU database', async () => {
        mockLocale(null);

        await expect(assertDatabaseLocale()).rejects.toThrow(/not an ICU-locale database/);
        expect(pgMock.end).toHaveBeenCalledOnce();
    });
});
