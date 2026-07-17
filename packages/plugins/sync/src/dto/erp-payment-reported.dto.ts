import { ApiProperty } from '@nestjs/swagger';

const ERP_PAYMENT_OUTCOMES = ['success', 'pending', 'fail', 'cancel'] as const;

export class ErpPaymentReportedDto {
    @ApiProperty({ description: 'plugin-acquiring Invoice id this payment applies to.' })
    invoiceId!: number;

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
