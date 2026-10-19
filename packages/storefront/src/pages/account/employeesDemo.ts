export type EmployeeStatus = 'active' | 'invited' | 'disabled';
export type EmployeeRole = 'admin' | 'purchaser' | 'accountant' | 'observer';
export type EmployeePermission =
    | 'orders'
    | 'payments'
    | 'documents'
    | 'employees'
    | 'catalog'
    | 'favorites'
    | 'balance'
    | 'viewOrders'
    | 'viewDocuments';
export type EmployeeContactNote = 'primaryContact' | 'invitationSent' | 'accessDisabled';
export type EmployeeActivity =
    | { kind: 'today' | 'yesterday'; time: string }
    | { kind: 'date'; date: string }
    | { kind: 'until'; date: string };

export type DemoPerson =
    | 'ivanPetrov'
    | 'alexeySmirnov'
    | 'elenaMorozova'
    | 'kirillNikitin'
    | 'sergeyIvanov';
export type DemoPoint = 'main' | 'north' | 'warehouse';

export interface Employee {
    id: string;
    person: DemoPerson;
    email: string;
    phone: string | null;
    contactNote: EmployeeContactNote | null;
    role: EmployeeRole;
    points: DemoPoint[] | null;
    status: EmployeeStatus;
    activity: EmployeeActivity;
    permissions: EmployeePermission[];
}

export const ROLES: EmployeeRole[] = ['admin', 'purchaser', 'accountant', 'observer'];

export const DEMO_TRADING_POINTS: DemoPoint[] = ['main', 'north', 'warehouse'];

export const DEMO_EMPLOYEES: Employee[] = [
    {
        id: '1',
        person: 'ivanPetrov',
        email: 'ivan.petrov@example.com',
        phone: '+7 913 100 0001',
        contactNote: 'primaryContact',
        role: 'admin',
        points: null,
        status: 'active',
        activity: { kind: 'today', time: '13:48' },
        permissions: ['orders', 'payments', 'documents', 'employees'],
    },
    {
        id: '2',
        person: 'alexeySmirnov',
        email: 'alexey.smirnov@example.com',
        phone: '+7 913 200 0002',
        contactNote: null,
        role: 'purchaser',
        points: ['main', 'north'],
        status: 'active',
        activity: { kind: 'yesterday', time: '18:22' },
        permissions: ['catalog', 'orders', 'favorites'],
    },
    {
        id: '3',
        person: 'elenaMorozova',
        email: 'elena.morozova@example.com',
        phone: '+7 913 300 0003',
        contactNote: null,
        role: 'accountant',
        points: null,
        status: 'active',
        activity: { kind: 'date', date: '2026-06-24' },
        permissions: ['documents', 'balance', 'payments'],
    },
    {
        id: '4',
        person: 'kirillNikitin',
        email: 'kirill.nikitin@example.com',
        phone: null,
        contactNote: 'invitationSent',
        role: 'observer',
        points: ['main'],
        status: 'invited',
        activity: { kind: 'until', date: '2026-06-30' },
        permissions: ['viewOrders', 'viewDocuments'],
    },
    {
        id: '5',
        person: 'sergeyIvanov',
        email: 'sergey.ivanov@example.com',
        phone: null,
        contactNote: 'accessDisabled',
        role: 'purchaser',
        points: ['warehouse'],
        status: 'disabled',
        activity: { kind: 'date', date: '2026-06-20' },
        permissions: [],
    },
];
