export interface BulkOperation {
    key: string;
    title: string;
    description: string;
    path: string;
    permission: string;
}

// Add an operation here and give it its own route; the index page and the nav item follow the registry.
export const BULK_OPERATIONS: BulkOperation[] = [
    {
        key: 'activate-customers',
        title: 'Activate customers',
        description:
            'Grant or revoke portal access for many counterparties at once: filter, select rows, review, save as one batch.',
        path: '/bulk-operations/activate-customers',
        permission: 'ManageCounterpartyPortalAccess',
    },
];

export function availableBulkOperations(hasPermission: (name: string) => boolean): BulkOperation[] {
    return BULK_OPERATIONS.filter(operation => hasPermission(operation.permission));
}
