import { postBatch, type ImportTarget } from './erp-import-seed';
import { counterpartyErpId, type ActorKey, type CounterpartyKey } from './fixture-plan';

export type SetupKey =
    | 'own-a'
    | 'own-b'
    | 'own-none'
    | 'wide'
    | 'everyone-no-rows'
    | 'everyone-empty'
    | 'inactive-a';

// A recipient of '' is an empty counterparty row (applies to everyone); [] is no recipient rows at all.
export const SETUPS: Record<
    SetupKey,
    { recipients: (CounterpartyKey | '')[]; percent: number; inactiveReason?: string }
> = {
    'own-a': { recipients: ['a-own'], percent: 10 },
    'own-b': { recipients: ['b-own'], percent: 5 },
    'own-none': { recipients: ['none'], percent: 6 },
    wide: { recipients: ['a-own', 'b-own'], percent: 7 },
    'everyone-no-rows': { recipients: [], percent: 3 },
    'everyone-empty': { recipients: [''], percent: -4 },
    // The ERP service stores no recipients for an inactive document, so only scope 'all' sees it.
    'inactive-a': { recipients: [], percent: 1, inactiveReason: 'cancelled' },
};

export const setupErpId = (key: SetupKey): string => `access-setup-${key}`;
export const setupNumber = (key: SetupKey): string =>
    String(9100 + Object.keys(SETUPS).indexOf(key));

// Spelled out, not recomputed: a setup is visible when it applies to everyone or names a visible client.
export const VISIBLE_SETUPS: Record<ActorKey, SetupKey[]> = {
    'manager-a': ['own-a', 'wide', 'everyone-no-rows', 'everyone-empty'],
    'manager-b': ['own-b', 'wide', 'everyone-no-rows', 'everyone-empty'],
    'head-a': ['own-a', 'wide', 'everyone-no-rows', 'everyone-empty'],
    'operator-a': ['own-a', 'own-b', 'wide', 'everyone-no-rows', 'everyone-empty'],
    'head-b': ['own-b', 'wide', 'everyone-no-rows', 'everyone-empty'],
    'head-default': ['everyone-no-rows', 'everyone-empty'],
    director: [
        'own-a',
        'own-b',
        'own-none',
        'wide',
        'everyone-no-rows',
        'everyone-empty',
        'inactive-a',
    ],
};

// The product names nothing in the catalog, so these setups never change a price in another test.
export async function seedDiscountSetups(target: ImportTarget): Promise<void> {
    const validFrom = new Date(Date.now() - 30 * 24 * 3600 * 1000).toISOString();
    const records = (Object.keys(SETUPS) as SetupKey[]).map(key => ({
        erpId: setupErpId(key),
        documentNumber: setupNumber(key),
        counterpartyErpIds: SETUPS[key].recipients.map(r => (r ? counterpartyErpId(r) : '')),
        productErpId: 'access-setup-no-such-product',
        condition: 'БезУсловий',
        conditionValue: 0,
        percent: SETUPS[key].percent,
        validFrom,
        validTo: null,
        inactiveReason: SETUPS[key].inactiveReason ?? null,
    }));
    await postBatch(target, 'counterpartyDiscountRule', records, 'discount-setups');
}
