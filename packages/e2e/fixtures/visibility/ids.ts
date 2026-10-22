import { adminGql } from '../../helpers/api';
import { formatDocumentNumber } from '../../helpers/e2e-order';
import {
    ACTORS,
    CLIENTS,
    CUSTOMERS,
    VIS_BRANCHES,
    actorEmail,
    clientErpId,
    customerEmail,
    type ActorKey,
    type ClientKey,
    type CustomerKey,
} from './plan';

export interface VisIds {
    branches: { a: string; b: string };
    admins: Record<ActorKey, string>;
    clients: Record<ClientKey, string>;
    points: Record<ClientKey, string>;
    customers: Record<CustomerKey, string>;
}

interface Lists {
    branches: { id: string; erpId: string }[];
    administrators: { items: { id: string; emailAddress: string }[] };
    counterparties: { items: { id: string; erpId: string; tradingPoints: { id: string }[] }[] };
    customers: { items: { id: string; emailAddress: string }[] };
}

const LISTS = `{
    branches { id erpId }
    administrators(options: { take: 100, filter: { emailAddress: { contains: "e2e-vis-" } } }) {
        items { id emailAddress } }
    counterparties(options: { take: 100, search: "E2E Vis" }) {
        items { id erpId tradingPoints { id } } }
    customers(options: { take: 100, filter: { emailAddress: { contains: "e2e-vis-" } } }) {
        items { id emailAddress } }
}`;

function pick<K extends string>(
    keys: K[],
    find: (key: K) => string | undefined,
): Record<K, string> {
    const out = {} as Record<K, string>;
    for (const key of keys) {
        const value = find(key);
        if (value === undefined) throw new Error(`Visibility seed row ${key} is missing`);
        out[key] = value;
    }
    return out;
}

export async function readVisIds(superadmin: string): Promise<VisIds> {
    const { data } = await adminGql<Lists>(LISTS, undefined, superadmin);
    const branch = (erpId: string): string | undefined =>
        data.branches.find(b => b.erpId === erpId)?.id;
    const client = (key: ClientKey): Lists['counterparties']['items'][number] | undefined =>
        data.counterparties.items.find(c => c.erpId === clientErpId(key));
    const clientKeys = CLIENTS.map(c => c.key);
    return {
        branches: pick(['a', 'b'], key => branch(VIS_BRANCHES[key])),
        admins: pick(
            ACTORS.map(a => a.key),
            key => data.administrators.items.find(a => a.emailAddress === actorEmail(key))?.id,
        ),
        clients: pick(clientKeys, key => client(key)?.id),
        points: pick(clientKeys, key => client(key)?.tradingPoints[0]?.id),
        customers: pick(
            CUSTOMERS.map(c => c.key),
            key => data.customers.items.find(c => c.emailAddress === customerEmail(key))?.id,
        ),
    };
}

export interface VisOrder {
    id: string;
    code: string;
    displayCode: string;
    proforma: { id: string; number: string };
}

// The newest placed order of each customer and its current proforma (see orders.ts).
export async function readVisOrders(
    superadmin: string,
    ids: VisIds,
): Promise<Record<CustomerKey, VisOrder>> {
    const out = {} as Record<CustomerKey, VisOrder>;
    for (const { key } of CUSTOMERS) {
        const { data } = await adminGql<{
            customer: { orders: { items: { id: string; code: string }[] } };
        }>(
            `query($id: ID!) { customer(id: $id) { orders(options: { take: 1, sort: { orderPlacedAt: DESC },
                filter: { state: { notEq: "Cancelled" }, active: { eq: false } } }) { items { id code } } } }`,
            { id: ids.customers[key] },
            superadmin,
        );
        const order = data.customer.orders.items[0];
        if (!order) throw new Error(`Visibility seed order of ${key} is missing`);
        const proformas = await adminGql<{
            proformaInvoicesForOrder: { id: string; number: string; status: string }[];
        }>(
            `query($o: ID!) { proformaInvoicesForOrder(orderId: $o) { id number status } }`,
            { o: order.id },
            superadmin,
        );
        const proforma = proformas.data.proformaInvoicesForOrder.find(p => p.status === 'paid');
        if (!proforma) throw new Error(`Visibility seed proforma of ${key} is missing`);
        out[key] = {
            ...order,
            displayCode: formatDocumentNumber(order.code),
            proforma: { id: proforma.id, number: proforma.number },
        };
    }
    return out;
}
