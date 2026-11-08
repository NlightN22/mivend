// Mirrors the server executors' permissions; the menu and routes need them without loading any wizard.
export const OPERATION_PERMISSIONS: Record<string, string> = {
    'counterparty-portal-access': 'ManageCounterpartyPortalAccess',
};

export const BULK_PERMISSIONS: string[] = Object.values(OPERATION_PERMISSIONS);
