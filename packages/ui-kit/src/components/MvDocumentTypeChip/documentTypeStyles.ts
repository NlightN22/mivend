import {
    IconFileInvoice,
    IconFilePencil,
    IconRotate2,
    IconScale,
    IconFileText,
} from '@tabler/icons-vue';
import type { StatusBadgeVariant } from '../MvStatusBadge/MvStatusBadge.vue';

// Document.type is free-text ERP business data (the backend-plugin-rules skill's "Business data must live in the
// database" — see api/customers.ts's DOCUMENT_STATUS_BADGE_VARIANT doc comment for the same
// carve-out reasoning applied to status). This map is presentation-only: known type strings get
// a recognizable icon + one of MvStatusBadge's existing StatusBadgeVariant colors, anything else
// falls back to a neutral default — it never gates filtering, sorting, or any business decision,
// so it doesn't reintroduce a hardcoded business enum. Icon set is Tabler (the frontend-rules skill's "Icon kit"
// rule) — pick from there first before adding any other icon package.
//
// The 4 keys below are the real values this app actually produces today — see
// Document.type's own doc comment (plugin-documents/src/entities/document.entity.ts:
// 'invoice' | 'contract' | 'return' | 'reconciliation') and DocumentRecord's (types.ts). An
// earlier version of this map invented a richer 6-value fictional set (waybill/certificate/
// credit note/'reconciliation act') that matched a UI mockup but not any real ERP-pushed or
// internally-generated value — so every real document except 'invoice' silently fell through to
// the neutral default (found via a live GraphQL query against seeded data, not by inspection).
// Add a new key here only once a real value shows up (grep this plugin's `type:` literals and
// erp-import's document handler first) — do not pre-guess future ERP categories.
//
// Deliberately reuses MvStatusBadge's own 5-value StatusBadgeVariant palette instead of a
// separate bespoke color system — single source of truth shared by MvDocumentTypeChip (the row
// cell, which wraps MvStatusBadge directly) and CustomerDocumentsDataTable.vue's Type column
// checklist filter (a plain `type: 'status'` filterConfig, the exact same MvColumnFilterStatus
// widget every other status-shaped column already uses — no bespoke filter component).
export interface DocumentTypeStyle {
    icon: typeof IconFileText;
    variant: StatusBadgeVariant;
}

const STYLES: Record<string, DocumentTypeStyle> = {
    invoice: { icon: IconFileInvoice, variant: 'info' },
    contract: { icon: IconFilePencil, variant: 'warning' },
    return: { icon: IconRotate2, variant: 'danger' },
    reconciliation: { icon: IconScale, variant: 'success' },
};

// Distinct from every real variant above, so an unrecognized future type never looks like an
// existing one at a glance.
export const DEFAULT_DOCUMENT_TYPE_STYLE: DocumentTypeStyle = {
    icon: IconFileText,
    variant: 'neutral',
};

export function resolveDocumentTypeStyle(type: string): DocumentTypeStyle {
    return STYLES[type.trim().toLowerCase()] ?? DEFAULT_DOCUMENT_TYPE_STYLE;
}
