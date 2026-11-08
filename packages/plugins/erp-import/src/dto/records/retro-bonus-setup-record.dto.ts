import { ApiProperty } from '@nestjs/swagger';

// Mirrors RetroBonusSetupRecord in ../../types.ts: a dev-seed shape of the ERP retro-bonus setup document.
export class RetroBonusSetupRecordDto {
    @ApiProperty({ description: 'ERP setup document uuid.' })
    erpId!: string;

    @ApiProperty({ description: 'Strictly increasing version string; an older one is ignored.' })
    version!: string;

    @ApiProperty({ required: false })
    documentNumber?: string;

    @ApiProperty({ description: 'Percent of the sale given back.' })
    percent!: number;

    @ApiProperty({ description: 'ERP identifier of the counterparty the rule is given to.' })
    counterpartyErpId!: string;

    @ApiProperty({
        required: false,
        description: 'Products the rule covers; empty with allProducts.',
    })
    productErpIds?: string[];

    @ApiProperty({ required: false, description: 'Covers every product, ignoring the list.' })
    allProducts?: boolean;

    @ApiProperty({ required: false, description: 'ISO date; defaults to the import time.' })
    validFrom?: string;

    @ApiProperty({ required: false, nullable: true, description: 'ISO date or null.' })
    validTo?: string | null;
}
