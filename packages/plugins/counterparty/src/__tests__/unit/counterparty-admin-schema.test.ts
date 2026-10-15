import { describe, it, expect } from 'vitest';
import { Kind, type FieldDefinitionNode, type ObjectTypeDefinitionNode } from 'graphql';

import { adminApiSchema } from '../../counterparty.plugin';

// Reads the raw adminApiSchema AST: it extends Vendure's types and uses scalars that exist only
// after merge, so buildASTSchema can't build it. Entity fields missing from SDL must fail here.
describe('counterparty admin API schema', () => {
    const counterpartyType = adminApiSchema.definitions.find(
        (def): def is ObjectTypeDefinitionNode =>
            def.kind === Kind.OBJECT_TYPE_DEFINITION && def.name.value === 'Counterparty',
    );
    const fieldNames = (counterpartyType?.fields ?? []).map(
        (field: FieldDefinitionNode) => field.name.value,
    );

    it('finds the Counterparty type definition at all', () => {
        expect(counterpartyType).toBeDefined();
    });

    it('exposes phone/officialEmail/factualAddress/legalAddress on Counterparty (issue #131)', () => {
        expect(fieldNames).toContain('phone');
        expect(fieldNames).toContain('officialEmail');
        expect(fieldNames).toContain('factualAddress');
        expect(fieldNames).toContain('legalAddress');
    });

    it('exposes managerErpId/linkedCustomerId on Counterparty (issue #133)', () => {
        expect(fieldNames).toContain('managerErpId');
        expect(fieldNames).toContain('linkedCustomerId');
    });

    // notificationPhone is deliberately deferred (no entity column, no consumer) — must not
    // silently reappear in the SDL without an entity/handler change accompanying it.
    it('does not expose notificationPhone (deliberately deferred, see counterparty.handler.ts)', () => {
        expect(fieldNames).not.toContain('notificationPhone');
    });
});
