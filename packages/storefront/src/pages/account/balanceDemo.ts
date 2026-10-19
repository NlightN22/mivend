export type BalanceVariant = '' | 'green' | 'orange' | 'warning';

export interface BalanceMetric {
    key: 'available' | 'used' | 'deferral' | 'due';
    amount?: number;
    days?: number;
    percent?: number;
    date?: string;
    variant: BalanceVariant;
}

export interface BalanceContract {
    key: 'main' | 'additional';
    limit: number;
    available: number;
    deferralDays: number;
    status: 'active' | 'nearlyUsed';
    statusVariant: BalanceVariant;
}

export interface BalancePayment {
    order: string;
    note: 'partial' | 'unpaid' | 'closed';
    amount: number;
    remaining: number;
    due: string | null;
    status: 'due' | 'paid';
    statusVariant: BalanceVariant;
}

export const DEMO_LIMIT = { used: 486500, total: 906500, available: 420000, overdue: 0 };
export const DEMO_USED_PERCENT = 54;
export const DEMO_DUE = 188580;
export const DEMO_NEXT_PAYMENT = { amount: 21420, date: '2026-06-30', order: '348744' };

export const DEMO_METRICS: BalanceMetric[] = [
    { key: 'available', amount: 420000, variant: 'green' },
    { key: 'used', amount: 486500, percent: DEMO_USED_PERCENT, variant: '' },
    { key: 'deferral', days: 14, variant: '' },
    { key: 'due', amount: DEMO_DUE, date: '2026-06-30', variant: 'orange' },
];

export const DEMO_CONTRACTS: BalanceContract[] = [
    {
        key: 'main',
        limit: 800000,
        available: 377140,
        deferralDays: 14,
        status: 'active',
        statusVariant: '',
    },
    {
        key: 'additional',
        limit: 106500,
        available: 42860,
        deferralDays: 7,
        status: 'nearlyUsed',
        statusVariant: 'warning',
    },
];

export const DEMO_PAYMENTS: BalancePayment[] = [
    {
        order: '348744',
        note: 'partial',
        amount: 86420,
        remaining: 21420,
        due: '2026-06-30',
        status: 'due',
        statusVariant: 'warning',
    },
    {
        order: '347611',
        note: 'unpaid',
        amount: 124300,
        remaining: 124300,
        due: '2026-07-02',
        status: 'due',
        statusVariant: 'warning',
    },
    {
        order: '347982',
        note: 'closed',
        amount: 18730,
        remaining: 0,
        due: null,
        status: 'paid',
        statusVariant: '',
    },
];
