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
} from 'graphql';

type Variables = Record<string, unknown> | undefined;

function isProvided(value: unknown): boolean {
    return value !== undefined && value !== null;
}

function variableTake(name: string, variables: Variables): boolean {
    const value = variables?.[name];
    return isProvided(value);
}

function optionsHaveTake(options: ArgumentNode | undefined, variables: Variables): boolean {
    const value: ValueNode | undefined = options?.value;
    if (!value) return false;
    if (value.kind === Kind.VARIABLE) {
        const bound = variables?.[value.name.value];
        return isProvided((bound as { take?: unknown } | null | undefined)?.take);
    }
    if (value.kind !== Kind.OBJECT) return false;
    const take = value.fields.find(f => f.name.value === 'take');
    if (!take) return false;
    if (take.value.kind === Kind.VARIABLE) return variableTake(take.value.name.value, variables);
    return take.value.kind !== Kind.NULL;
}

export function findOmittedTake(
    schema: GraphQLSchema,
    document: DocumentNode,
    variables: Variables,
): string[] {
    const typeInfo = new TypeInfo(schema);
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
                if (!optionsHaveTake(given, variables)) omitted.push(node.name.value);
            },
        }),
    );
    return omitted;
}
