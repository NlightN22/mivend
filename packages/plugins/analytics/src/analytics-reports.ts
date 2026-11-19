import type { AnalyticsReport } from './analytics-report';

export function reportsFor(
    reports: readonly AnalyticsReport[],
    hasPermission: (permission: string) => boolean,
): AnalyticsReport[] {
    return reports.filter(r => hasPermission(r.permission));
}
