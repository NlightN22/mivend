export type ActorKey =
    | 'manager-a'
    | 'manager-b'
    | 'head-a'
    | 'head-b'
    | 'head-default'
    | 'operator-a'
    | 'director';
export type ScopeKind = 'own' | 'branch' | 'all';
export type CounterpartyKey = 'a-own' | 'a-free' | 'a-point' | 'b-own' | 'b-team' | 'none';
export type CustomerKey = 'customer-a' | 'customer-b';

export const STAFF_PASSWORD = 'access-test-password';
export const CUSTOMER_PASSWORD = 'access-test-password';

export const BRANCHES = { a: 'access-branch-a', b: 'access-branch-b' } as const;
export const DEPARTMENTS = {
    a: 'access-dept-a',
    b: 'access-dept-b',
    default: 'access-dept-default',
    root: 'access-dept-root',
};
// The server bootstraps this branch from BOOTSTRAP_BRANCH_NAMES and makes it the global default.
export const DEFAULT_BRANCH_ERP_ID = 'mivend-bootstrap:Default';

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
    {
        key: 'head-default',
        role: 'department-head',
        scope: 'branch',
        department: DEPARTMENTS.default,
    },
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

// Price types and discount grants (#263 groups 05-07): each branch lists only its own customer type.
export const PRICE_TYPES = {
    a: 'access-pt-a',
    b: 'access-pt-b',
    purchase: 'access-pt-purchase',
} as const;
export const PRICED_PRODUCT = {
    sku: 'ACCESS-PT-SKU',
    prices: { a: 120, b: 110, purchase: 80 },
    floorMultiplier: 1.5,
} as const;
export const BRANCH_PRICE_TYPE = { a: PRICE_TYPES.a, b: PRICE_TYPES.b } as const;
export const ALLOWED_PRICE_TYPES: Partial<Record<ActorKey, string[]>> = {
    'manager-a': [PRICE_TYPES.a],
    'operator-a': [PRICE_TYPES.a],
    'manager-b': [PRICE_TYPES.b],
};
export type GrantKey = 'allowed' | 'hidden' | 'confidential';
export const GRANTS: Record<GrantKey, { code: string; by: 'manager-a' | 'superadmin' }> = {
    allowed: { code: PRICE_TYPES.a, by: 'manager-a' },
    hidden: { code: PRICE_TYPES.b, by: 'superadmin' },
    confidential: { code: PRICE_TYPES.purchase, by: 'superadmin' },
};
export const grantJustification = (key: GrantKey): string => `access-grant-${key}`;

// Trading points (#263 group 18): read-time branch is the point override, else the counterparty branch.
export const VISIBLE_POINTS: Record<ActorKey, CounterpartyKey[]> = {
    'manager-a': ['a-own', 'a-point', 'b-team'],
    'manager-b': ['b-own'],
    'head-a': ['a-own', 'a-free', 'a-point'],
    'operator-a': ['a-own', 'a-free', 'a-point', 'b-own'],
    'head-b': ['a-point', 'b-own', 'b-team'],
    'head-default': ['none'],
    director: ['a-own', 'a-free', 'a-point', 'b-own', 'b-team', 'none'],
};

// Portal customers (#263 groups 21-22): a customer of the team client and of the branch-less client.
export const PORTAL_CUSTOMERS: { email: string; counterparty: CounterpartyKey }[] = [
    { email: 'customer-team@access.test', counterparty: 'b-team' },
    { email: 'customer-branchless@access.test', counterparty: 'none' },
];
export const PORTAL_ACCESS_MANAGERS: ActorKey[] = ['director'];

// The union of docs/access-control.md for this seed, spelled out instead of recomputed.
export const VISIBLE_COUNTERPARTIES: Record<ActorKey, CounterpartyKey[]> = {
    'manager-a': ['a-own', 'a-point', 'b-team'],
    'manager-b': ['b-own'],
    'head-a': ['a-own', 'a-free', 'a-point'],
    'operator-a': ['a-own', 'a-free', 'a-point', 'b-own'],
    'head-b': ['b-own', 'b-team'],
    'head-default': [],
    director: ['a-own', 'a-free', 'a-point', 'b-own', 'b-team', 'none'],
};

// Orders, proformas and payments (#263 groups 13-16, 19, 20); every order goes through the Shop API checkout.
export type OrderKey = 'a-own' | 'a-own-paid' | 'a-point' | 'none' | 'b-own';
export type OrderCustomerKey = CustomerKey | 'customer-a-point' | 'customer-branchless';
export type PaymentKey = 'a-own-paid' | 'b-own';

// Portal customers of the a-point and branch-less clients; customer-branchless is also a PORTAL_CUSTOMERS row.
export const ORDER_CUSTOMERS: { key: OrderCustomerKey; counterparty: CounterpartyKey }[] = [
    { key: 'customer-a-point', counterparty: 'a-point' },
    { key: 'customer-branchless', counterparty: 'none' },
];
export const orderCustomerEmail = (key: OrderCustomerKey): string => `${key}@access.test`;

export const PRODUCT = { sku: 'ACCESS-SKU-1', price: 1000, stock: 1000 } as const;
export const WAREHOUSE_PREFIX = 'access-wh-';

export interface OrderPlan {
    key: OrderKey;
    customer: OrderCustomerKey;
    counterparty: CounterpartyKey;
    // issued-cancelled: one withdrawn and one current issued proforma; paid: one paid proforma with a refund.
    proformas: 'none' | 'issued-cancelled' | 'paid';
}

export const ORDERS: OrderPlan[] = [
    { key: 'a-own', customer: 'customer-a', counterparty: 'a-own', proformas: 'issued-cancelled' },
    { key: 'a-own-paid', customer: 'customer-a', counterparty: 'a-own', proformas: 'paid' },
    { key: 'a-point', customer: 'customer-a-point', counterparty: 'a-point', proformas: 'none' },
    { key: 'none', customer: 'customer-branchless', counterparty: 'none', proformas: 'none' },
    { key: 'b-own', customer: 'customer-b', counterparty: 'b-own', proformas: 'paid' },
];

// Customer (sale) contracts listed by myContracts, next to every counterparty's main contract.
export const CUSTOMER_CONTRACTS: Partial<Record<CounterpartyKey, string>> = {
    'a-own': 'access-cp-a-own-sale',
    'b-own': 'access-cp-b-own-sale',
};
export const saleContractName = (key: CounterpartyKey): string => `Sale contract ${key}`;
// What orderContracts lists for an order: the client's main contract and its sale contract.
export const orderContractErpIds = (key: CounterpartyKey): string[] =>
    [`${counterpartyErpId(key)}-contract`, CUSTOMER_CONTRACTS[key]]
        .filter((c): c is string => c !== undefined)
        .sort();

// Read-time order branch: point override, else counterparty branch (docs/access-control.md).
// Branch scope sees its branch's orders plus own, team and granted clients' orders anywhere.
export const VISIBLE_ORDERS: Record<ActorKey, OrderKey[]> = {
    'manager-a': ['a-own', 'a-own-paid', 'a-point'],
    'manager-b': ['b-own'],
    'head-a': ['a-own', 'a-own-paid'],
    'operator-a': ['a-own', 'a-own-paid', 'b-own'],
    'head-b': ['a-point', 'b-own'],
    'head-default': ['none'],
    director: ['a-own', 'a-own-paid', 'a-point', 'none', 'b-own'],
};

// The a-own proformas follow their orders' point: home in branch A, moved when the point is serviced by B.
export const VISIBLE_A_OWN_PROFORMAS: Record<'home' | 'moved', ActorKey[]> = {
    home: ['manager-a', 'head-a', 'operator-a', 'director'],
    moved: ['manager-a', 'head-b', 'director'],
};

// A payment follows its proforma, which follows its order.
export const VISIBLE_PAYMENTS: Record<ActorKey, PaymentKey[]> = {
    'manager-a': ['a-own-paid'],
    'manager-b': ['b-own'],
    'head-a': ['a-own-paid'],
    'operator-a': ['a-own-paid', 'b-own'],
    'head-b': ['b-own'],
    'head-default': [],
    director: ['a-own-paid', 'b-own'],
};
