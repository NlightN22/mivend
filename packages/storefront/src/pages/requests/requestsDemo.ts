export type RequestStatus = 'new' | 'in-progress' | 'awaiting' | 'resolved' | 'closed';
export type RequestAction = 'open' | 'reply' | 'order' | 'documents' | 'payments' | 'repeat';

export interface DemoRequest {
    id: string;
    status: RequestStatus;
    assignee: 'sales' | 'accounting' | 'finance' | 'service';
    icon: string;
    iconVariant: 'blue' | 'green' | 'orange';
    hasMessage: boolean;
    actions: RequestAction[];
}

export const REQUEST_STATUS_COUNTS: { key: 'all' | RequestStatus; count: number }[] = [
    { key: 'all', count: 12 },
    { key: 'new', count: 2 },
    { key: 'in-progress', count: 4 },
    { key: 'awaiting', count: 2 },
    { key: 'resolved', count: 3 },
    { key: 'closed', count: 1 },
];

export const REQUEST_TOPICS = ['order', 'payment', 'documents', 'return', 'delivery'] as const;
export const QUICK_TOPICS = ['order', 'payment', 'documents', 'return'] as const;

export const DEMO_REQUESTS: DemoRequest[] = [
    {
        id: '1048',
        status: 'awaiting',
        assignee: 'sales',
        icon: '📦',
        iconVariant: 'orange',
        hasMessage: true,
        actions: ['open', 'reply', 'order'],
    },
    {
        id: '1042',
        status: 'in-progress',
        assignee: 'accounting',
        icon: '🧾',
        iconVariant: 'blue',
        hasMessage: true,
        actions: ['open', 'documents'],
    },
    {
        id: '1037',
        status: 'resolved',
        assignee: 'finance',
        icon: '₽',
        iconVariant: 'green',
        hasMessage: true,
        actions: ['open', 'payments'],
    },
    {
        id: '1029',
        status: 'closed',
        assignee: 'service',
        icon: '↩',
        iconVariant: 'orange',
        hasMessage: false,
        actions: ['open', 'documents', 'repeat'],
    },
];
