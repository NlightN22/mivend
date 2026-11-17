import { describe, expect, it } from 'vitest';

import { OPERATION_UI } from '../../components/bulk-operations/operationUi';
import {
    BULK_PERMISSIONS,
    OPERATION_PERMISSIONS,
} from '../../components/bulk-operations/operationPermissions';

describe('bulk operation registry (#366)', () => {
    it('gives every operation with a wizard its permission, and the menu knows them all', () => {
        for (const type of Object.keys(OPERATION_UI)) {
            expect(OPERATION_PERMISSIONS[type], type).toBeTruthy();
        }
        expect(BULK_PERMISSIONS).toContain('ReassignCounterpartyManager');
        expect(BULK_PERMISSIONS).toContain('RemoveCounterpartyManager');
    });

    it('the manager change cannot go to review without a target manager', () => {
        const ui = OPERATION_UI['counterparty-manager-reassign'];
        expect(ui.required?.name).toBe('administratorId');
        expect(ui.defaultParameters.administratorId).toBe('');
    });

    it('the manager removal cannot go to review without the confirmation', () => {
        const ui = OPERATION_UI['counterparty-manager-remove'];
        expect(ui.required?.name).toBe('confirmed');
        expect(ui.defaultParameters.confirmed).toBe(false);
    });
});
