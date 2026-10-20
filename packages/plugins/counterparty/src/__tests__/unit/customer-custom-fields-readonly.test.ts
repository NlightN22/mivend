import { describe, it, expect } from 'vitest';
import { getConfigurationFunction, type RuntimeVendureConfig } from '@vendure/core';
import { addGraphQLCustomFields } from '@vendure/core/dist/api/config/graphql-custom-fields';

import { CounterpartyPlugin } from '../../counterparty.plugin';

const GUARDED = ['counterpartyId', 'portalRole', 'preferredTradingPointId'];
const BASE_SDL = `
    type Customer { id: ID! }
    input CreateCustomerInput { emailAddress: String }
    input UpdateCustomerInput { firstName: String }
    type Query { customer: Customer }
`;

type Schema = ReturnType<typeof addGraphQLCustomFields>;

function buildSchema(publicOnly: boolean): Schema {
    const configure = getConfigurationFunction(CounterpartyPlugin) as (
        c: RuntimeVendureConfig,
    ) => RuntimeVendureConfig;
    const probe = { name: 'probe', type: 'string' };
    const config = configure({
        customFields: { Customer: [probe] },
    } as unknown as RuntimeVendureConfig);
    return addGraphQLCustomFields(BASE_SDL, config.customFields, publicOnly);
}

// Vendure bundles its own graphql copy, so instanceof-based guards from ours would fail.
function fieldNames(schema: Schema, name: string): string[] {
    const type = schema.getType(name) as { getFields?: () => Record<string, unknown> } | undefined;
    if (!type?.getFields) throw new Error(`${name} is missing from the schema`);
    return Object.keys(type.getFields());
}

describe.each([
    ['Shop API', true],
    ['Admin API', false],
])('Customer tenant/role custom fields in the %s', (_api, publicOnly) => {
    const schema = buildSchema(publicOnly);

    it.each(['UpdateCustomerCustomFieldsInput', 'CreateCustomerCustomFieldsInput'])(
        '%s cannot set them',
        inputName => {
            const fields = fieldNames(schema, inputName);
            expect(fields).toContain('probe');
            for (const name of GUARDED) expect(fields).not.toContain(name);
        },
    );

    it('still exposes them for reading', () => {
        expect(fieldNames(schema, 'CustomerCustomFields')).toEqual(expect.arrayContaining(GUARDED));
    });
});
