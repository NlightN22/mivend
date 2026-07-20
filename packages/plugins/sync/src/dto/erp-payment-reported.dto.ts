import { ApiProperty } from '@nestjs/swagger';

// The full set of values plugin-acquiring's PayInvoiceOutcome accepts (see
// packages/plugins/acquiring/src/payment-attempt.service.ts's OUTCOME_TO_PAYMENT_STATUS) —
// duplicated here rather than imported since plugin-sync must not depend on plugin-acquiring
// (rule #5/#6: sync owns the transport boundary, not the other way around). Exported so
// ErpCallbackController can validate against it at runtime — this project has no global
// class-validator ValidationPipe wired, so @ApiProperty's `enum` is Swagger documentation only,
// not runtime enforcement, and an unrecognized value must be rejected explicitly, not passed
// through to `OUTCOME_TO_PAYMENT_STATUS[outcome]` as `undefined`.
export const ERP_PAYMENT_OUTCOMES = ['success', 'pending', 'fail', 'cancel'] as const;

export class ErpPaymentReportedDto {
    @ApiProperty({ description: 'plugin-acquiring Invoice id this payment applies to.' })
    invoiceId!: number;

    @ApiProperty({
        description:
            'The organization (legal entity, plugin-documents OrganizationRequisites) this ' +
            'payment is for. Validated against the target Invoice.organizationId before the ' +
            'payment is applied — payment allocation is always scoped to one organization, ' +
            'regardless of which branch or channel reported it (AGENTS.md sync rule #13).',
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
