// Pure mapping of ProductChanged's `manufacturer` field into the Product custom field
// apps/server/src/vendure-config.ts declares.
//
// issue #116: ProductChanged also carries `barcodes`, `attributes`, `specifications`,
// `technicalRequirements`, and `manufacturerCodes` — an earlier draft of this issue proposed
// storing all of these (this field included) as raw-JSON `text` custom fields. That approach was
// explicitly rejected by the developer: every field mivend decides to store needs a real,
// considered design (its own entity/relation or a properly typed custom field), not an opaque
// blob "for later." `manufacturer` is a plain optional string — a normal typed field, not one of
// the rejected shapes — so it ships now. The rest are deliberately NOT mapped here yet, pending
// Search Platform's answer on their real shape/cardinality/update frequency (cross-session
// request to sp.issue.common) and a follow-up design before any migration/customField is added
// for them.
//
// proto3's canonical JSON mapping (this plugin's own toJson() decode, see kafka-consumer.service.ts)
// omits an `optional` scalar field entirely when it's genuinely unset — indistinguishable on the
// wire from "field not sent." Treated as "nothing to store," never as an explicit empty-string
// write — same zero-value-omission discipline this plugin already applies to isActive (see
// types.ts's own doc comment).

export interface ProductTier2CustomFields {
    manufacturer?: string;
}

function isNonEmptyString(value: unknown): value is string {
    return typeof value === 'string' && value !== '';
}

export function mapProductTier2Fields(payload: Record<string, unknown>): ProductTier2CustomFields {
    const result: ProductTier2CustomFields = {};

    if (isNonEmptyString(payload.manufacturer)) {
        result.manufacturer = payload.manufacturer;
    }

    return result;
}
