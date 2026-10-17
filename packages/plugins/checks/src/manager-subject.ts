export const MANAGER_SUBJECT_TYPE = 'manager';

export const MANAGER_STAGES = {
    extendReservation: 'extend-reservation',
    extendCreditTerm: 'extend-credit-term',
    adjustPrice: 'adjust-price',
} as const;

// An action a manager is requesting right now; `params` are the action's own inputs.
export interface ManagerActionSubject<P extends object = Record<string, never>> {
    roleCode: string | null;
    branchId: string | null;
    params: P;
}
