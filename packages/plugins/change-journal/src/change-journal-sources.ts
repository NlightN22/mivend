// Changes that arrive from the ERP integration are not journaled (owner decision 2026-11-10).
const INTEGRATION_TASK_PREFIXES = ['erp-integration-', 'sync-'];
const INTEGRATION_TASKS = new Set(['external-order-counterparty-reconcile']);
// erp-import, ERP callbacks and order status (sync), Kafka status (erp-integration).
const INTEGRATION_ROUTE_PREFIX = '/erp/';

export function isIntegrationTask(taskId: string): boolean {
    return (
        INTEGRATION_TASKS.has(taskId) || INTEGRATION_TASK_PREFIXES.some(p => taskId.startsWith(p))
    );
}

export function isIntegrationRoute(path: string | undefined): boolean {
    return !!path && `${path}/`.startsWith(INTEGRATION_ROUTE_PREFIX);
}
