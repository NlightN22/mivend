import { describe, expect, it } from 'vitest';

import { activeStatePatch, activeStateSeedPatch } from '../../counterparty-active-state';
import type { ActiveStateFields } from '../../counterparty-active-state';
import {
    COUNTERPARTY_FIELD_OWNERS,
    PORTAL_OWNED_COLUMNS,
    withoutPortalOwned,
} from '../../counterparty-ownership';

const everything: ActiveStateFields = {
    name: 'ERP name',
    isActive: true,
    inn: '7700000001',
    erpGroupLabel: 'group',
    departmentId: 'dept-1',
    assignedManagerId: 'admin-1',
    managerErpId: 'user-1',
    legalAddress: 'legal',
    factualAddress: 'factual',
    phone: '+70000000001',
    officialEmail: 'a@example.com',
    mainContractId: 'contract-1',
    fullName: 'Full name',
    mainBankAccountId: 'bank-1',
    ogrnip: 'ogrnip',
    kpp: 'kpp',
    okpo: 'okpo',
    legalType: 'legal',
    regionId: 'region-1',
    legalFormId: 'form-1',
};

describe('counterparty field ownership', () => {
    it('lists the portal-owned fields the issue names, and only those', () => {
        expect([...PORTAL_OWNED_COLUMNS].sort()).toEqual(
            [
                'legalName',
                'shortName',
                'fullName',
                'inn',
                'kpp',
                'ogrnip',
                'okpo',
                'legalType',
                'legalFormId',
                'regionId',
                'legalAddress',
                'factualAddress',
                'phone',
                'officialEmail',
                'erpGroupLabel',
                'assignedManagerId',
            ].sort(),
        );
    });

    it('an inbound event on an existing record writes no portal-owned field', () => {
        const patch = activeStatePatch(everything);
        for (const key of Object.keys(patch)) {
            expect(COUNTERPARTY_FIELD_OWNERS).toHaveProperty(key);
            expect(
                COUNTERPARTY_FIELD_OWNERS[key as keyof typeof COUNTERPARTY_FIELD_OWNERS],
            ).not.toBe('portal');
        }
    });

    it('an inbound event on an existing record still moves the ERP-owned fields', () => {
        expect(activeStatePatch(everything)).toEqual({
            isActive: true,
            departmentId: 'dept-1',
            managerErpId: 'user-1',
            mainContractId: 'contract-1',
            mainBankAccountId: 'bank-1',
        });
    });

    it('the first arrival seeds every portal-owned field the event carries', () => {
        const seed = activeStateSeedPatch(everything);
        for (const column of PORTAL_OWNED_COLUMNS) expect(seed).toHaveProperty(column);
    });

    it('withoutPortalOwned keeps the local and ERP-owned keys', () => {
        expect(withoutPortalOwned({ legalName: 'x', branchId: 'b', creditLimit: 5 })).toEqual({
            branchId: 'b',
            creditLimit: 5,
        });
    });
});
