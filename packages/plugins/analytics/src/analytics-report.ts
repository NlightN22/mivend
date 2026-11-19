export type ReportStatus = 'planned' | 'available';

export interface AnalyticsReport {
    key: string;
    title: string;
    description: string;
    area: string;
    permission: string;
    status: ReportStatus;
    note: string;
}
