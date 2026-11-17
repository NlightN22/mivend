import {
    getNamedType,
    isInputObjectType,
    Kind,
    TypeInfo,
    visit,
    visitWithTypeInfo,
    type ArgumentNode,
    type DocumentNode,
    type GraphQLSchema,
    type ValueNode,
    valueFromASTUntyped,
} from 'graphql';

type Variables = Record<string, unknown> | undefined;

function isProvided(value: unknown): boolean {
    return value !== undefined && value !== null;
}

function withDefaults(document: DocumentNode, variables: Variables): Record<string, unknown> {
    const merged: Record<string, unknown> = {};
    for (const def of document.definitions) {
        if (def.kind !== Kind.OPERATION_DEFINITION) continue;
        for (const v of def.variableDefinitions ?? []) {
            if (v.defaultValue) merged[v.variable.name.value] = valueFromASTUntyped(v.defaultValue);
        }
    }
    for (const [name, value] of Object.entries(variables ?? {})) {
        if (isProvided(value)) merged[name] = value;
    }
    return merged;
}

function optionsHaveTake(
    options: ArgumentNode | undefined,
    variables: Record<string, unknown>,
): boolean {
    const value: ValueNode | undefined = options?.value;
    if (!value) return false;
    if (value.kind === Kind.VARIABLE) {
        const bound = variables[value.name.value];
        return isProvided((bound as { take?: unknown } | null | undefined)?.take);
    }
    if (value.kind !== Kind.OBJECT) return false;
    const take = value.fields.find(f => f.name.value === 'take');
    if (!take) return false;
    if (take.value.kind === Kind.VARIABLE) return isProvided(variables[take.value.name.value]);
    return take.value.kind !== Kind.NULL;
}

export function findOmittedTake(
    schema: GraphQLSchema,
    document: DocumentNode,
    variables: Variables,
): string[] {
    const typeInfo = new TypeInfo(schema);
    const bound = withDefaults(document, variables);
    const omitted: string[] = [];
    visit(
        document,
        visitWithTypeInfo(typeInfo, {
            Field(node) {
                const optionsArg = typeInfo.getFieldDef()?.args.find(a => a.name === 'options');
                const optionsType = optionsArg && getNamedType(optionsArg.type);
                if (!optionsType || !isInputObjectType(optionsType)) return;
                if (!('take' in optionsType.getFields())) return;
                const given = node.arguments?.find(a => a.name.value === 'options');
                if (!optionsHaveTake(given, bound)) omitted.push(node.name.value);
            },
        }),
    );
    return omitted;
}
