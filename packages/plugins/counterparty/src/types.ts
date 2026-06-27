export const loggerCtx = 'CounterpartyPlugin';

export const PORTAL_ROLES = ['client_admin', 'buyer', 'accountant', 'observer'] as const;
export type PortalRole = (typeof PORTAL_ROLES)[number];

export interface CounterpartyUpsertPayload {
    erpId: string;
    legalName: string;
    shortName: string;
    inn?: string | null;
    creditLimit: number;
    creditBalance: number;
    paymentDelayDays: number;
    priceType: string;
    isActive: boolean;
}
