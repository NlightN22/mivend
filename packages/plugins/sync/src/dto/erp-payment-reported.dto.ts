import { ApiProperty } from '@nestjs/swagger';

// The full set of values plugin-acquiring's PayProformaInvoiceOutcome accepts (see
// packages/plugins/acquiring/src/payment-attempt.service.ts's OUTCOME_TO_PAYMENT_STATUS) —
// duplicated here rather than imported since plugin-sync must not depend on plugin-acquiring
// (rule #5/#6: sync owns the transport boundary, not the other way around). Exported so
// ErpCallbackController can validate against it at runtime — this project has no global
// class-validator ValidationPipe wired, so @ApiProperty's `enum` is Swagger documentation only,
// not runtime enforcement, and an unrecognized value must be rejected explicitly, not passed
// through to `OUTCOME_TO_PAYMENT_STATUS[outcome]` as `undefined`.
export const ERP_PAYMENT_OUTCOMES = ['success', 'pending', 'fail', 'cancel'] as const;

export class ErpPaymentReportedDto {
    @ApiProperty({
        description: 'Immutable uuid of the ProformaInvoice this payment names.',
        format: 'uuid',
    })
    proformaInvoiceUuid!: string;

    @ApiProperty({
        description:
            'Amount the customer actually paid, integer minor units (kopecks), > 0. The payment ' +
            'is allocated by this amount: it may be partial or exceed the named document (the remainder follows the FIFO rule).',
        example: 150000,
    })
    amount!: number;

    @ApiProperty({
        description:
            'ISO 4217 currency of amount; must equal the named document currency (a mismatch is ' +
            'rejected and recorded as a reconciliation issue).',
        example: 'RUB',
    })
    currencyCode!: string;

    @ApiProperty({
        required: false,
        description:
            'Human document number of the ProformaInvoice, stored form ("001234-01") or displayed ' +
            'form with the instance-code hyphen ("001-234-01"). Reference only: when given and ' +
            'it does not match the document, the payment is rejected.',
        example: '001234-01',
    })
    proformaInvoiceNumber?: string;

    @ApiProperty({
        description:
            'The organization (legal entity, plugin-documents OrganizationRequisites) this ' +
            'payment is for. Validated against the target ProformaInvoice.organizationId before the ' +
            'payment is applied — payment allocation is always scoped to one organization, ' +
            'regardless of which branch or channel reported it (the external-integration-rules skill).',
    })
    organizationId!: number;

    @ApiProperty({ enum: ERP_PAYMENT_OUTCOMES })
    outcome!: (typeof ERP_PAYMENT_OUTCOMES)[number];

    @ApiProperty({
        description:
            "The ERP's own unique id for this payment fact — used for inbox dedup, so a " +
            'resend of the same ERP record is a safe no-op.',
        example: 'ERP-PMT-000123',
    })
    erpEventId!: string;
}
