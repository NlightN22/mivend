import { describe, expect, it } from 'vitest';
import { Permission, PERMISSIONS_METADATA_KEY } from '@vendure/core';

import { LegalNameAbbreviationAdminResolver } from '../../legal-name-abbreviation.resolver';

const proto = LegalNameAbbreviationAdminResolver.prototype;

describe('LegalNameAbbreviationAdminResolver permission gates', () => {
    it('reads are gated by exactly ReadSettings', () => {
        expect(Reflect.getMetadata(PERMISSIONS_METADATA_KEY, proto.legalNameAbbreviations)).toEqual(
            [Permission.ReadSettings],
        );
    });

    it.each([
        'createLegalNameAbbreviation',
        'updateLegalNameAbbreviation',
        'deleteLegalNameAbbreviation',
    ] as const)('%s is gated by exactly UpdateSettings', method => {
        expect(Reflect.getMetadata(PERMISSIONS_METADATA_KEY, proto[method])).toEqual([
            Permission.UpdateSettings,
        ]);
    });
});
