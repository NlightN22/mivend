import type { AnalyticsReport } from '../analytics-report';
import { CUSTOMER_REPORTS } from './customers';
import { SALES_REPORTS } from './sales';

export const ANALYTICS_REPORTS: AnalyticsReport[] = [...CUSTOMER_REPORTS, ...SALES_REPORTS];
