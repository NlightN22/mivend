import type { StatusBadgeVariant } from '@mivend/ui-kit';
import { i18n } from '../i18n';
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

// The server registry holds English text; the client translates it by report code and keeps the server text when a code has no entry.
export function localizeReport(report: AnalyticsReportInfo): AnalyticsReportInfo {
    const { t, te } = i18n.global;
    const text = (field: 'title' | 'description' | 'note'): string => {
        const key = `analytics.reports.${report.key}.${field}`;
        return te(key) ? t(key) : report[field];
    };
    const areaKey = `analytics.areas.${report.area}`;
    return {
        ...report,
        title: text('title'),
        description: text('description'),
        note: text('note'),
        area: te(areaKey) ? t(areaKey) : report.area,
    };
}
