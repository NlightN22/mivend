import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import { KNOWN_CONDITION_KINDS, KNOWN_OPERATION_KINDS } from '../../discount-known-kinds';

const migration = readFileSync(
    join(
        __dirname,
        '../../../../../../apps/server/src/migrations/1791536000000-setup-documents.ts',
    ),
    'utf8',
);

describe('setup-documents migration seeds', () => {
    it.each(KNOWN_CONDITION_KINDS)('seeds the condition kind %s as %s', (name, metric) => {
        expect(migration).toContain(`('${name}', '${metric}')`);
    });

    it.each(KNOWN_OPERATION_KINDS)('seeds the operation kind %s', name => {
        expect(migration).toContain(`('${name}')`);
    });
});
