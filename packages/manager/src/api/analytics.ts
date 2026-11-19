import type { StatusBadgeVariant } from '@mivend/ui-kit';
import { adminApi } from './client';
import { AnalyticsReportsDocument } from './generated/graphql';

export interface AnalyticsReportInfo {
    key: string;
    title: string;
    description: string;
    area: string;
    status: string;
    note: string;
}

export const REPORT_STATUS_VARIANT: Record<string, StatusBadgeVariant> = {
    planned: 'neutral',
    available: 'success',
};

export function fetchAnalyticsReports(): Promise<AnalyticsReportInfo[]> {
    return adminApi(AnalyticsReportsDocument).then(r => r.analyticsReports);
}
