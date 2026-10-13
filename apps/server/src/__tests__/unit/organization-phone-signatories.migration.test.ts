import { QueryRunner } from 'typeorm';
import { describe, expect, it, vi } from 'vitest';

import { OrganizationPhoneSignatories1791497000000 } from '../../migrations/1791497000000-organization-phone-signatories';

function runner(): { qr: QueryRunner; sql: string[] } {
    const sql: string[] = [];
    const qr = { query: vi.fn(async (q: string) => void sql.push(q)) } as unknown as QueryRunner;
    return { qr, sql };
}

describe('OrganizationPhoneSignatories migration', () => {
    it('adds nullable phone and signatories columns idempotently', async () => {
        const { qr, sql } = runner();
        await new OrganizationPhoneSignatories1791497000000().up(qr);
        expect(sql.join('\n')).toMatch(/ADD COLUMN IF NOT EXISTS "phone"[\s\S]*"signatories" text/);
    });

    it('down drops both columns', async () => {
        const { qr, sql } = runner();
        await new OrganizationPhoneSignatories1791497000000().down(qr);
        expect(sql.join('\n')).toContain('DROP COLUMN IF EXISTS "signatories"');
    });
});
