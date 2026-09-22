// Flags `payload.<field> != null` / `!== null` / `== null` / `=== null` checks on fields that
// Integration Service's contracts declare as PLAIN (non-`optional`) proto3 scalars — see the
// external-integration-rules skill's "Non-optional proto3 scalar fields" section for the full
// explanation. A plain scalar's zero value (0, false, "") is OMITTED from the decoded JSON
// payload entirely (proto3 JSON mapping), so an absent key is indistinguishable from an explicit
// zero at the JSON level — a `!= null` check can never tell the two apart, and reading "absent"
// as "no data, skip" instead of "explicit zero" is a real, repeat-offender bug class:
// - issue #89: isActive/isDeleted (bool) read as "absent = active" instead of "absent = false".
// - mivend.issue.84.88 (2026-09-15): stock.handler.ts's availableQuantity (double) read as
//   "absent = no data, don't write" instead of "absent = 0" — silently skipped the ATP cap for
//   every row where the ERP reported zero available stock, and separately broke an ERP-reconciliation
//   counter that (wrongly) used this field's nullness as an unrelated "did we receive an event"
//   signal.
//
// PLAIN_SCALAR_FIELDS is generated from `@nlightn22/event-contracts`' own generated `.d.ts` files
// — every non-`optional`, non-boolean numeric field found under `company/catalog/events/v1` and
// `company/orders/events/v1` (the streams this plugin actually consumes) as of the version in use
// when this rule was added. Re-derive this list (grep the package's generated `*_pb.d.ts` files
// for `@generated from field:` lines without `optional `) whenever the contract package is
// upgraded and a new stream/field is wired into a handler — this rule cannot discover new fields
// on its own, it only catches a `!= null`-style check on a field already known to be plain.
//
// Bool fields (isActive, isDeleted, isFolder, etc.) are NOT in this list: those already have
// their own established, correct read pattern (`payload.x === true`) which doesn't use a
// null-check at all, so there's nothing to flag for them here — this rule is specifically for the
// numeric-field version of the same underlying mistake, which has no equivalently established
// fix pattern yet and is easy to write without realizing the bool precedent even applies.
const PLAIN_SCALAR_FIELDS = new Set([
    'quantity',
    'reservedQuantity',
    'availableQuantity',
    'priority',
    'lineNumber',
]);

function isPayloadMemberAccess(node) {
    return (
        node.type === 'MemberExpression' &&
        node.object.type === 'Identifier' &&
        node.object.name === 'payload' &&
        node.property.type === 'Identifier' &&
        PLAIN_SCALAR_FIELDS.has(node.property.name)
    );
}

export default {
    meta: {
        type: 'problem',
        docs: {
            description:
                "Disallow `payload.<field> != null`-style null checks on plain (non-optional) proto3 scalar fields — proto3 JSON omits a zero-value field entirely, so an absent key means the zero value, not 'no data'. See external-integration-rules skill.",
        },
        schema: [],
    },
    create(context) {
        return {
            BinaryExpression(node) {
                if (!['!=', '!==', '==', '==='].includes(node.operator)) return;
                const [payloadSide, otherSide] =
                    node.left.type === 'MemberExpression' ? [node.left, node.right] : [node.right, node.left];
                if (otherSide.type !== 'Literal' || otherSide.value !== null) return;
                if (!isPayloadMemberAccess(payloadSide)) return;
                context.report({
                    node,
                    message: `'payload.${payloadSide.property.name}' is a plain (non-optional) proto3 scalar — an absent key means the zero value (0), not "no data". A null-check here can never distinguish the two; read it as 'payload.${payloadSide.property.name} ?? 0' instead. See external-integration-rules skill, "Non-optional proto3 scalar fields".`,
                });
            },
        };
    },
};
