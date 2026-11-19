import { describe, expect, it } from 'vitest';
import { CustomPermission } from '@mivend/plugin-access-control';
import { ANALYTICS_REPORTS } from '@mivend/plugin-analytics';

describe('analytics report permission', () => {
    it('every report is gated by the ReadAnalytics permission the access-control plugin defines', () => {
        expect(ANALYTICS_REPORTS.length).toBeGreaterThan(0);
        for (const report of ANALYTICS_REPORTS) {
            expect(report.permission, report.key).toBe(CustomPermission.ReadAnalytics.Permission);
        }
    });
});
