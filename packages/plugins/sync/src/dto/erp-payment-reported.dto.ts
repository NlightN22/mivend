import { ApiProperty } from '@nestjs/swagger';

const ERP_PAYMENT_OUTCOMES = ['success', 'pending', 'fail', 'cancel'] as const;

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
