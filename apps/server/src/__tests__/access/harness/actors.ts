import { inject } from 'vitest';

import {
    CUSTOMER_PASSWORD,
    STAFF,
    STAFF_PASSWORD,
    customerEmail,
    staffEmail,
    type ActorKey,
    type CustomerKey,
    type StaffPlan,
} from '../seed/fixture-plan';
import { SUPERADMIN } from '../seed/run-seed';
import type { SeedIds } from '../seed/seed-ids';
import { gql, login, type GqlResult } from './graphql';

const tokens = new Map<string, string>();

export const seed = (): SeedIds => inject('accessSeed');

export function staff(key: ActorKey): StaffPlan {
    const found = STAFF.find(s => s.key === key);
    if (!found) throw new Error(`Unknown actor ${key}`);
    return found;
}

async function cached(key: string, open: () => Promise<string>): Promise<string> {
    const known = tokens.get(key);
    if (known) return known;
    const token = await open();
    tokens.set(key, token);
    return token;
}

export function staffToken(key: ActorKey | 'superadmin'): Promise<string> {
    const [username, password] =
        key === 'superadmin'
            ? [SUPERADMIN.username, SUPERADMIN.password]
            : [staffEmail(key), STAFF_PASSWORD];
    return cached(`admin:${key}`, () =>
        login(inject('accessBaseUrl'), 'admin-api', username, password),
    );
}

export function customerToken(key: CustomerKey): Promise<string> {
    return cached(`shop:${key}`, () =>
        login(inject('accessBaseUrl'), 'shop-api', customerEmail(key), CUSTOMER_PASSWORD),
    );
}

export function admin<T = Record<string, unknown>>(
    token: string,
    query: string,
    variables?: Record<string, unknown>,
): Promise<GqlResult<T>> {
    return gql<T>(inject('accessBaseUrl'), 'admin-api', query, variables, token);
}

export function shop<T = Record<string, unknown>>(
    token: string,
    query: string,
    variables?: Record<string, unknown>,
): Promise<GqlResult<T>> {
    return gql<T>(inject('accessBaseUrl'), 'shop-api', query, variables, token);
}

export const DENIED = /not currently authorized/i;
