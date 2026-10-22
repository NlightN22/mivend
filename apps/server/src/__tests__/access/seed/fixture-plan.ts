export type ActorKey = 'manager-a' | 'manager-b' | 'head-a' | 'head-b' | 'operator-a' | 'director';
export type ScopeKind = 'own' | 'branch' | 'all';
export type CounterpartyKey = 'a-own' | 'a-free' | 'a-point' | 'b-own' | 'b-team' | 'none';
export type CustomerKey = 'customer-a' | 'customer-b';

export const STAFF_PASSWORD = 'access-test-password';
export const CUSTOMER_PASSWORD = 'access-test-password';

export const BRANCHES = { a: 'access-branch-a', b: 'access-branch-b' } as const;
export const DEPARTMENTS = { a: 'access-dept-a', b: 'access-dept-b', root: 'access-dept-root' };

export interface StaffPlan {
    key: ActorKey;
    role: string;
    scope: ScopeKind;
    department: string;
}

export const STAFF: StaffPlan[] = [
    { key: 'manager-a', role: 'manager', scope: 'own', department: DEPARTMENTS.a },
    { key: 'manager-b', role: 'manager', scope: 'own', department: DEPARTMENTS.b },
    { key: 'head-a', role: 'department-head', scope: 'branch', department: DEPARTMENTS.a },
    { key: 'operator-a', role: 'operator', scope: 'branch', department: DEPARTMENTS.a },
    { key: 'head-b', role: 'department-head', scope: 'branch', department: DEPARTMENTS.b },
    { key: 'director', role: 'general-director', scope: 'all', department: DEPARTMENTS.root },
];

export const staffEmail = (key: ActorKey): string => `${key}@access.test`;

export interface CounterpartyPlan {
    key: CounterpartyKey;
    department: string;
    manager: ActorKey | null;
}

// a-point's point is serviced by branch B; b-team has manager-a as a team observer.
export const COUNTERPARTIES: CounterpartyPlan[] = [
    { key: 'a-own', department: DEPARTMENTS.a, manager: 'manager-a' },
    { key: 'a-free', department: DEPARTMENTS.a, manager: null },
    { key: 'a-point', department: DEPARTMENTS.a, manager: 'manager-a' },
    { key: 'b-own', department: DEPARTMENTS.b, manager: 'manager-b' },
    { key: 'b-team', department: DEPARTMENTS.b, manager: null },
    { key: 'none', department: DEPARTMENTS.root, manager: null },
];

export const counterpartyErpId = (key: CounterpartyKey): string => `access-cp-${key}`;
export const counterpartyName = (key: CounterpartyKey): string => `Access client ${key}`;

export const TEAM_OBSERVER = { counterparty: 'b-team', actor: 'manager-a' } as const;
export const STANDING_GRANT = { grantee: 'operator-a', manager: 'manager-b' } as const;
export const POINT_OVERRIDE = { counterparty: 'a-point', branch: BRANCHES.b } as const;

export const CUSTOMERS: { key: CustomerKey; counterparty: CounterpartyKey }[] = [
    { key: 'customer-a', counterparty: 'a-own' },
    { key: 'customer-b', counterparty: 'b-own' },
];
export const customerEmail = (key: CustomerKey): string => `${key}@access.test`;

// The union of docs/access-control.md for this seed, spelled out instead of recomputed.
export const VISIBLE_COUNTERPARTIES: Record<ActorKey, CounterpartyKey[]> = {
    'manager-a': ['a-own', 'a-point', 'b-team'],
    'manager-b': ['b-own'],
    'head-a': ['a-own', 'a-free', 'a-point'],
    'operator-a': ['a-own', 'a-free', 'a-point', 'b-own'],
    'head-b': ['b-own', 'b-team'],
    director: ['a-own', 'a-free', 'a-point', 'b-own', 'b-team', 'none'],
};
