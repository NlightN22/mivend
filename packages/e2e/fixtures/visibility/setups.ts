import { postBatch, waitForRun } from '../../helpers/api';
import { clientErpId, type ActorKey, type ClientKey } from './plan';

export type SetupKey =
    | 'own-a-running'
    | 'own-b-expiring'
    | 'own-b-expired'
    | 'own-a-inactive'
    | 'wide-a-b'
    | 'everyone-no-rows'
    | 'everyone-empty';

const day = 24 * 3600 * 1000;

// A recipient of '' is an empty counterparty row (applies to everyone); [] is no recipient rows at all.
export const SETUPS: Record<
    SetupKey,
    {
        recipients: (ClientKey | '')[];
        percent: number;
        validTo: number | null;
        inactiveReason?: string;
    }
> = {
    'own-a-running': { recipients: ['a-own'], percent: 10, validTo: 90 },
    'own-b-expiring': { recipients: ['b-own'], percent: 5, validTo: 5 },
    'own-b-expired': { recipients: ['b-own'], percent: 2, validTo: -3 },
    'own-a-inactive': {
        recipients: ['a-own'],
        percent: 1,
        validTo: null,
        inactiveReason: 'cancelled',
    },
    'wide-a-b': { recipients: ['a-own', 'b-own'], percent: 7, validTo: null },
    'everyone-no-rows': { recipients: [], percent: 3, validTo: null },
    'everyone-empty': { recipients: [''], percent: -4, validTo: null },
};

export const setupNumber = (key: SetupKey): string =>
    String(9100 + Object.keys(SETUPS).indexOf(key));

// Spelled out, not recomputed: a setup is visible when it applies to everyone or names a visible client.
export const VISIBLE_SETUPS: Record<ActorKey, SetupKey[]> = {
    'manager-a': [
        'own-a-running',
        'own-a-inactive',
        'wide-a-b',
        'everyone-no-rows',
        'everyone-empty',
    ],
    'manager-b': [
        'own-b-expiring',
        'own-b-expired',
        'wide-a-b',
        'everyone-no-rows',
        'everyone-empty',
    ],
    'head-a': ['own-a-running', 'own-a-inactive', 'wide-a-b', 'everyone-no-rows', 'everyone-empty'],
    'operator-a': [
        'own-a-running',
        'own-a-inactive',
        'own-b-expiring',
        'own-b-expired',
        'wide-a-b',
        'everyone-no-rows',
        'everyone-empty',
    ],
    'head-b': ['own-b-expiring', 'own-b-expired', 'wide-a-b', 'everyone-no-rows', 'everyone-empty'],
    director: [
        'own-a-running',
        'own-b-expiring',
        'own-b-expired',
        'own-a-inactive',
        'wide-a-b',
        'everyone-no-rows',
        'everyone-empty',
    ],
};

export async function seedSetups(): Promise<void> {
    const exchangeId = `e2e-vis-setups-${Date.now()}`;
    await postBatch(
        exchangeId,
        (Object.keys(SETUPS) as SetupKey[]).map(key => ({
            type: 'counterpartyDiscountRule',
            data: {
                erpId: `e2e-vis-setup-${key}`,
                documentNumber: setupNumber(key),
                counterpartyErpIds: SETUPS[key].recipients.map(r => (r ? clientErpId(r) : '')),
                productErpId: null,
                condition: 'БезУсловий',
                conditionValue: 0,
                percent: SETUPS[key].percent,
                validFrom: new Date(Date.now() - 30 * day).toISOString(),
                validTo:
                    SETUPS[key].validTo === null
                        ? null
                        : new Date(Date.now() + SETUPS[key].validTo! * day).toISOString(),
                inactiveReason: SETUPS[key].inactiveReason ?? null,
            },
        })),
    );
    const run = await waitForRun(exchangeId);
    if (run.errors.length > 0)
        throw new Error(`erp-import discount setups failed: ${JSON.stringify(run.errors)}`);
}
