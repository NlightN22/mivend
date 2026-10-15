import { describe, expect, it } from 'vitest';
import { PERMISSIONS_METADATA_KEY } from '@vendure/core';
import { CustomPermission } from '@mivend/plugin-access-control';

import { ChecksResolver } from '../../checks.resolver';

const proto = ChecksResolver.prototype;

describe('ChecksResolver permission gates', () => {
    it.each([
        ['updateCheckPolicy', CustomPermission.ManageCheckPolicies],
        ['checkPolicies', CustomPermission.ManageCheckPolicies],
        ['checkResults', CustomPermission.ReadCheckResults],
        ['checkDefinitions', CustomPermission.ReadCheckResults],
    ] as const)('%s is gated by exactly its permission', (method, permission) => {
        const gate = Reflect.getMetadata(PERMISSIONS_METADATA_KEY, proto[method]);
        expect(gate).toEqual([permission.Permission]);
    });
});
