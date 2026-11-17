import type { Component } from 'vue';
import ActivationParametersStep from './ActivationParametersStep.vue';
import ActivationSelectStep from './ActivationSelectStep.vue';
import ManagerReassignParametersStep from './ManagerReassignParametersStep.vue';
import ManagerRemoveParametersStep from './ManagerRemoveParametersStep.vue';
import PasswordResetParametersStep from './PasswordResetParametersStep.vue';
import { BULK_PERMISSIONS } from './operationPermissions';

// What the manager portal needs to run an operation the server catalog lists: its wizard steps.
export interface OperationUi {
    selectStep: Component;
    parametersStep: Component;
    defaultParameters: Record<string, unknown>;
    recordNoun: string;
    // A parameter the next step cannot start without, and the label key that says so.
    required?: { name: string; hintKey: string };
}

// Add an operation here after registering its executor on the server; the menu and catalog follow.
export const OPERATION_UI: Record<string, OperationUi> = {
    'counterparty-portal-access': {
        selectStep: ActivationSelectStep,
        parametersStep: ActivationParametersStep,
        defaultParameters: { action: 'activate' },
        recordNoun: 'counterparties',
    },
    'counterparty-password-reset': {
        selectStep: ActivationSelectStep,
        parametersStep: PasswordResetParametersStep,
        defaultParameters: {},
        recordNoun: 'counterparties',
    },
    'counterparty-manager-reassign': {
        selectStep: ActivationSelectStep,
        parametersStep: ManagerReassignParametersStep,
        defaultParameters: { administratorId: '' },
        recordNoun: 'counterparties',
        required: { name: 'administratorId', hintKey: 'bulkOperations.managerReassign.choose' },
    },
    'counterparty-manager-remove': {
        selectStep: ActivationSelectStep,
        parametersStep: ManagerRemoveParametersStep,
        defaultParameters: { confirmed: false },
        recordNoun: 'counterparties',
        required: { name: 'confirmed', hintKey: 'bulkOperations.managerRemove.mustConfirm' },
    },
};

export function operationUi(type: string): OperationUi | null {
    return OPERATION_UI[type] ?? null;
}

export function canOpenBulkOperations(hasPermission: (name: string) => boolean): boolean {
    return BULK_PERMISSIONS.some(hasPermission);
}
