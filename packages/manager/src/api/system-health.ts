import { adminApi } from './client';
import {
    buildSystemHealthChecklist,
    type SystemHealthCheckItem,
    type SystemHealthQueryResult,
} from 'shared';

export type { SystemHealthCheckItem, SystemHealthQueryResult };
export { buildSystemHealthChecklist };

export async function fetchSystemHealthData(): Promise<SystemHealthQueryResult> {
    return adminApi<SystemHealthQueryResult>(
        `query SystemHealthCheckData {
            zones(options: { take: 1 }) { totalItems }
            taxCategories(options: { take: 1 }) { totalItems }
            taxRates(options: { take: 100 }) { items { enabled } }
            activeChannel { defaultTaxZone { id } }
            shippingMethods(options: { take: 1 }) { totalItems }
            paymentMethods(options: { take: 100 }) { items { enabled } }
        }`,
    );
}
