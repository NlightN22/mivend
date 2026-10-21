import { beforeAll, describe, expect, it, vi } from 'vitest';
import type { CustomFields } from '@vendure/core';
import { preBootstrapConfig } from '@vendure/core/dist/bootstrap';
import { addGraphQLCustomFields } from '@vendure/core/dist/api/config/graphql-custom-fields';

import { CLIENT_WRITABLE_CUSTOM_FIELDS } from '../../custom-field-write-policy.plugin';

type Schema = ReturnType<typeof addGraphQLCustomFields>;

let customFields: CustomFields;

beforeAll(async () => {
    vi.stubEnv('INSTANCE_TYPE', 'central');
    vi.stubEnv('INSTANCE_NUMBER_CODE', '001');
    const { config } = await import('../../vendure-config');
    customFields = (await preBootstrapConfig(config)).customFields;
}, 60_000);

function inputFieldNames(schema: Schema, name: string): string[] {
    const type = schema.getType(name) as { getFields?: () => Record<string, unknown> } | undefined;
    return type?.getFields ? Object.keys(type.getFields()) : [];
}

function baseSdl(entities: string[]): string {
    const types = entities.map(
        e =>
            `type ${e} { id: ID! } input Create${e}Input { id: ID } input Update${e}Input { id: ID }`,
    );
    const relations = new Set<string>();
    for (const fields of Object.values(customFields)) {
        for (const f of fields ?? []) {
            if (f.type === 'relation') relations.add(f.graphQLType || f.entity.name);
        }
    }
    const stubs = [...relations]
        .filter(r => !entities.includes(r))
        .map(r => `type ${r} { id: ID! }`);
    return `${[...types, ...stubs].join('\n')}\ntype Query { order: Order }`;
}

describe('client-writable custom fields (#266)', () => {
    it.each([
        ['Shop API', true],
        ['Admin API', false],
    ])(
        '%s exposes no custom field outside the allow-list in any Create/Update input',
        (_api, publicOnly) => {
            const entities = Object.keys(customFields).filter(e => e !== 'OrderLine');
            const schema = addGraphQLCustomFields(baseSdl(entities), customFields, publicOnly);
            const leaked: string[] = [];
            for (const entity of entities) {
                const allowed = CLIENT_WRITABLE_CUSTOM_FIELDS[entity] ?? [];
                for (const input of [
                    `Create${entity}CustomFieldsInput`,
                    `Update${entity}CustomFieldsInput`,
                ]) {
                    for (const name of inputFieldNames(schema, input)) {
                        if (!allowed.includes(name)) leaked.push(`${input}.${name}`);
                    }
                }
            }
            expect(leaked).toEqual([]);
        },
    );

    it('keeps every OrderLine field readonly: Vendure does not strip them from the addItemToOrder input', () => {
        const writable = (customFields.OrderLine ?? []).filter(f => !f.readonly).map(f => f.name);
        expect(writable).toEqual([]);
    });

    it('lists only entities and fields that exist', () => {
        for (const [entity, names] of Object.entries(CLIENT_WRITABLE_CUSTOM_FIELDS)) {
            const defined = (customFields[entity as keyof CustomFields] ?? []).map(f => f.name);
            expect(defined, entity).toEqual(expect.arrayContaining([...names]));
        }
    });
});
