import { describe, expect, it, vi } from 'vitest';

import { MIVEND_ORDER_STATUSES } from '../../mivend-order-statuses';
import { provisionMivendOrderStatuses } from '../../order-status-provisioning.service';

describe('mivend order statuses provisioning', () => {
    it('upserts every status with its current name and description, overwriting existing rows', async () => {
        const query = vi.fn().mockResolvedValue(undefined);
        await provisionMivendOrderStatuses(query);

        expect(query).toHaveBeenCalledTimes(MIVEND_ORDER_STATUSES.length);
        const sql = String(query.mock.calls[0][0]);
        expect(sql).toContain('ON CONFLICT ("code") DO UPDATE');
        expect(sql).toContain('"name" = EXCLUDED."name"');
        expect(sql).toContain('"description" = EXCLUDED."description"');
        for (const [i, s] of MIVEND_ORDER_STATUSES.entries()) {
            expect(query.mock.calls[i][1]).toEqual(expect.arrayContaining([s.name, s.description]));
        }
    });

    it('keeps badge-sized names', () => {
        for (const s of MIVEND_ORDER_STATUSES) expect(s.name.length).toBeLessThanOrEqual(20);
    });
});
