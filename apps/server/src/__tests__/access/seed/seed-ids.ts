import { gqlOk } from '../harness/graphql';
import {
    BRANCHES,
    DEFAULT_BRANCH_ERP_ID,
    COUNTERPARTIES,
    CUSTOMERS,
    STAFF,
    counterpartyErpId,
    customerEmail,
    staffEmail,
    type ActorKey,
    type CounterpartyKey,
    type CustomerKey,
} from './fixture-plan';
import type { OrderSeedIds } from './orders-seed';

export interface SeedIds {
    branches: { a: string; b: string; default: string };
    admins: Record<ActorKey, string>;
    counterparties: Record<CounterpartyKey, string>;
    points: Record<CounterpartyKey, string>;
    customers: Record<CustomerKey, string>;
    ordering: OrderSeedIds;
}

export type BaseSeedIds = Omit<SeedIds, 'ordering'>;

interface Lists {
    branches: { id: string; erpId: string }[];
    administrators: { items: { id: string; emailAddress: string }[] };
    counterparties: { items: { id: string; erpId: string; tradingPoints: { id: string }[] }[] };
    customers: { items: { id: string; emailAddress: string }[] };
}

const LISTS = `{
    branches { id erpId }
    administrators(options: { take: 100 }) { items { id emailAddress } }
    counterparties(options: { take: 100 }) { items { id erpId tradingPoints { id } } }
    customers(options: { take: 100 }) { items { id emailAddress } }
}`;

function pick<K extends string, T>(keys: K[], find: (key: K) => T | undefined): Record<K, T> {
    const out = {} as Record<K, T>;
    for (const key of keys) {
        const value = find(key);
        if (value === undefined) throw new Error(`Seed row ${key} is missing`);
        out[key] = value;
    }
    return out;
}

export async function readSeedIds(baseUrl: string, superadmin: string): Promise<BaseSeedIds> {
    const lists = await gqlOk<Lists>(baseUrl, 'admin-api', LISTS, undefined, superadmin);
    const branch = (erpId: string): string => {
        const found = lists.branches.find(b => b.erpId === erpId);
        if (!found) throw new Error(`Branch ${erpId} is missing`);
        return found.id;
    };
    const cp = (key: CounterpartyKey): Lists['counterparties']['items'][number] | undefined =>
        lists.counterparties.items.find(c => c.erpId === counterpartyErpId(key));
    const cpKeys = COUNTERPARTIES.map(c => c.key);
    return {
        branches: {
            a: branch(BRANCHES.a),
            b: branch(BRANCHES.b),
            default: branch(DEFAULT_BRANCH_ERP_ID),
        },
        admins: pick(
            STAFF.map(s => s.key),
            key => lists.administrators.items.find(a => a.emailAddress === staffEmail(key))?.id,
        ),
        counterparties: pick(cpKeys, key => cp(key)?.id),
        points: pick(cpKeys, key => cp(key)?.tradingPoints[0]?.id),
        customers: pick(
            CUSTOMERS.map(c => c.key),
            key => lists.customers.items.find(c => c.emailAddress === customerEmail(key))?.id,
        ),
    };
}
