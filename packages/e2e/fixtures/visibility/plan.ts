export type ActorKey = 'manager-a' | 'manager-b' | 'head-a' | 'operator-a' | 'head-b' | 'director';
export type ClientKey = 'a-own' | 'a-free' | 'a-point' | 'b-own' | 'b-team' | 'none';
export type CustomerKey = 'customer-a' | 'customer-b' | 'customer-a-point';

export const VIS_PASSWORD = 'E2eTest123!';

export const VIS_BRANCHES = { a: 'e2e-vis-branch-a', b: 'e2e-vis-branch-b' } as const;
export const VIS_DEPARTMENTS = {
    root: 'e2e-vis-dept-root',
    a: 'e2e-vis-dept-a',
    b: 'e2e-vis-dept-b',
} as const;

export interface ActorPlan {
    key: ActorKey;
    role: string;
    department: string;
}

export const ACTORS: ActorPlan[] = [
    { key: 'manager-a', role: 'manager', department: VIS_DEPARTMENTS.a },
    { key: 'manager-b', role: 'manager', department: VIS_DEPARTMENTS.b },
    { key: 'head-a', role: 'department-head', department: VIS_DEPARTMENTS.a },
    { key: 'operator-a', role: 'operator', department: VIS_DEPARTMENTS.a },
    { key: 'head-b', role: 'department-head', department: VIS_DEPARTMENTS.b },
    { key: 'director', role: 'general-director', department: VIS_DEPARTMENTS.root },
];

export const actorEmail = (key: ActorKey): string => `e2e-vis-${key}@test.example`;

export const VIS_PRICE_TYPES = {
    a: 'e2e-vis-pt-a',
    b: 'e2e-vis-pt-b',
    confidential: 'e2e-vis-pt-confidential',
} as const;

export interface ClientPlan {
    key: ClientKey;
    department: string;
    manager: ActorKey | null;
    priceType: string;
}

// a-point's point is serviced by branch B; b-team has manager-a as an observer; none has no branch.
export const CLIENTS: ClientPlan[] = [
    {
        key: 'a-own',
        department: VIS_DEPARTMENTS.a,
        manager: 'manager-a',
        priceType: VIS_PRICE_TYPES.a,
    },
    { key: 'a-free', department: VIS_DEPARTMENTS.a, manager: null, priceType: VIS_PRICE_TYPES.a },
    {
        key: 'a-point',
        department: VIS_DEPARTMENTS.a,
        manager: 'manager-a',
        priceType: VIS_PRICE_TYPES.a,
    },
    {
        key: 'b-own',
        department: VIS_DEPARTMENTS.b,
        manager: 'manager-b',
        priceType: VIS_PRICE_TYPES.b,
    },
    { key: 'b-team', department: VIS_DEPARTMENTS.b, manager: null, priceType: VIS_PRICE_TYPES.b },
    { key: 'none', department: VIS_DEPARTMENTS.root, manager: null, priceType: VIS_PRICE_TYPES.a },
];

export const clientErpId = (key: ClientKey): string => `e2e-vis-cp-${key}`;
export const clientName = (key: ClientKey): string => `E2E Vis ${key}`;
export const pointName = (key: ClientKey): string => `E2E Vis point ${key}`;
export const documentNumber = (key: ClientKey): string =>
    `${8800 + CLIENTS.findIndex(c => c.key === key)}`;

export const TEAM_OBSERVER = { client: 'b-team', actor: 'manager-a' } as const;
export const STANDING_GRANT = { grantee: 'operator-a', manager: 'manager-b' } as const;
export const POINT_OVERRIDE = { client: 'a-point', branch: 'b' } as const;

export const CUSTOMERS: { key: CustomerKey; client: ClientKey }[] = [
    { key: 'customer-a', client: 'a-own' },
    { key: 'customer-b', client: 'b-own' },
    { key: 'customer-a-point', client: 'a-point' },
];
export const customerEmail = (key: CustomerKey): string => `e2e-vis-${key}@test.example`;

// The union of docs/access-control.md for this seed, spelled out instead of recomputed.
export const VISIBLE_CLIENTS: Record<ActorKey, ClientKey[]> = {
    'manager-a': ['a-own', 'a-point', 'b-team'],
    'manager-b': ['b-own'],
    'head-a': ['a-own', 'a-free', 'a-point'],
    'operator-a': ['a-own', 'a-free', 'a-point', 'b-own'],
    'head-b': ['b-own', 'b-team'],
    director: ['a-own', 'a-free', 'a-point', 'b-own', 'b-team', 'none'],
};

// Read-time order branch: the point override, else the client's branch.
export const VISIBLE_ORDERS: Record<ActorKey, CustomerKey[]> = {
    'manager-a': ['customer-a', 'customer-a-point'],
    'manager-b': ['customer-b'],
    'head-a': ['customer-a'],
    'operator-a': ['customer-a', 'customer-b'],
    'head-b': ['customer-a-point', 'customer-b'],
    director: ['customer-a', 'customer-a-point', 'customer-b'],
};

export const ALLOWED_PRICE_TYPES = { a: [VIS_PRICE_TYPES.a], b: [VIS_PRICE_TYPES.b] } as const;

export const PRODUCT = {
    sku: 'E2E-VIS-001',
    slug: 'e2e-vis-product',
    name: 'E2E Vis product',
    stock: 1000,
    prices: { a: 1230, b: 1170, confidential: 860 },
} as const;

export type GrantKey = 'allowed' | 'hidden' | 'confidential';
export const GRANTS: Record<GrantKey, { code: string; by: 'manager-a' | 'superadmin' }> = {
    allowed: { code: VIS_PRICE_TYPES.a, by: 'manager-a' },
    hidden: { code: VIS_PRICE_TYPES.b, by: 'superadmin' },
    confidential: { code: VIS_PRICE_TYPES.confidential, by: 'superadmin' },
};
export const grantJustification = (key: GrantKey): string => `e2e-vis-grant-${key}`;
