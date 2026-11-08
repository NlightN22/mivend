import type { Component } from 'vue';
import ActivationParametersStep from './ActivationParametersStep.vue';
import ActivationSelectStep from './ActivationSelectStep.vue';
import { BULK_PERMISSIONS } from './operationPermissions';

// What the manager portal needs to run an operation the server catalog lists: its wizard steps.
export interface OperationUi {
    selectStep: Component;
    parametersStep: Component;
    defaultParameters: Record<string, unknown>;
    recordNoun: string;
}

// Add an operation here after registering its executor on the server; the menu and catalog follow.
export const OPERATION_UI: Record<string, OperationUi> = {
    'counterparty-portal-access': {
        selectStep: ActivationSelectStep,
        parametersStep: ActivationParametersStep,
        defaultParameters: { action: 'activate' },
        recordNoun: 'counterparties',
    },
};

export function operationUi(type: string): OperationUi | null {
    return OPERATION_UI[type] ?? null;
}

export function canOpenBulkOperations(hasPermission: (name: string) => boolean): boolean {
    return BULK_PERMISSIONS.some(hasPermission);
}
