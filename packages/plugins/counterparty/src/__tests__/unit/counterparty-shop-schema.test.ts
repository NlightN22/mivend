import { describe, it, expect } from 'vitest';
import { Kind, type ObjectTypeDefinitionNode } from 'graphql';

import { shopApiSchema } from '../../counterparty.plugin';

describe('counterparty Shop API schema', () => {
    const type = shopApiSchema.definitions.find(
        (def): def is ObjectTypeDefinitionNode =>
            def.kind === Kind.OBJECT_TYPE_DEFINITION && def.name.value === 'Counterparty',
    );
    const fields = (type?.fields ?? []).map(f => f.name.value);

    it('exposes only the customer-visible fullName as the counterparty name', () => {
        expect(fields).toContain('fullName');
    });

    it('never exposes the internal legalName/shortName/name', () => {
        expect(fields).not.toContain('legalName');
        expect(fields).not.toContain('shortName');
        expect(fields).not.toContain('name');
    });

    it('fullName is nullable so a missing value is never replaced by an internal name', () => {
        const field = type?.fields?.find(f => f.name.value === 'fullName');
        expect(field?.type.kind).toBe(Kind.NAMED_TYPE);
    });
});
