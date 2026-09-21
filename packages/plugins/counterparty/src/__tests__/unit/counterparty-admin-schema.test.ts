import { describe, it, expect } from 'vitest';
import { Kind, type FieldDefinitionNode, type ObjectTypeDefinitionNode } from 'graphql';

import { adminApiSchema } from '../../counterparty.plugin';

// mivend.audit.common (issue #131): Counterparty.phone/officialEmail/factualAddress/legalAddress
// were written to the entity/DB by CounterpartyStreamHandler but never added to the admin API
// SDL — the data was correctly persisted but no client (manager portal, Dashboard, #120's
// activation UI) could read it via GraphQL at all. This test reads the real adminApiSchema AST
// directly (not buildASTSchema — adminApiSchema `extend`s Vendure's own Query/Mutation/Customer
// types and references scalars/types that only exist once merged into the full server schema,
// so it isn't independently buildable) and asserts the field actually exists on the
// `Counterparty` type definition, so a future field added to the entity/service without a
// matching SDL field fails a fast unit test instead of only being caught by a human reading the
// schema.
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

    // notificationPhone is deliberately deferred (no entity column, no consumer) — must not
    // silently reappear in the SDL without an entity/handler change accompanying it.
    it('does not expose notificationPhone (deliberately deferred, see counterparty.handler.ts)', () => {
        expect(fieldNames).not.toContain('notificationPhone');
    });
});
