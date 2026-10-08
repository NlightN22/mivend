import { describe, expect, it } from 'vitest';

import { compareContractVersions } from '../../contract-version-drift';

describe('compareContractVersions', () => {
    it.each([
        ['0.52.0', '0.53.0', 'BEHIND'],
        ['0.52.0', '1.0.0', 'BEHIND'],
        ['0.9.0', '0.10.0', 'BEHIND'],
        ['0.52.0', '0.52.0', 'UP_TO_DATE'],
        ['0.53.1', '0.53.0', 'AHEAD'],
    ])('%s vs %s -> %s', (installed, latest, status) => {
        expect(compareContractVersions(installed, latest).status).toBe(status);
    });

    it('is UNKNOWN when the latest version could not be looked up', () => {
        expect(compareContractVersions('0.52.0', null)).toEqual({
            installed: '0.52.0',
            latest: null,
            status: 'UNKNOWN',
        });
    });
});
