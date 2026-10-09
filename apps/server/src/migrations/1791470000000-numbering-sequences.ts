import { MigrationInterface, QueryRunner } from 'typeorm';

const SEQUENCE_NAMES = [
    'mivend_number_seq_order',
    'mivend_number_seq_invoice',
    'mivend_number_seq_payment',
    'mivend_number_seq_refund',
    'mivend_number_seq_discount_grant',
    'mivend_number_seq_proforma',
];

export class NumberingSequences1791470000000 implements MigrationInterface {
    public async up(queryRunner: QueryRunner): Promise<void> {
        for (const name of SEQUENCE_NAMES) {
            await queryRunner.query(`CREATE SEQUENCE IF NOT EXISTS "${name}" START 1`, undefined);
        }
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        for (const name of SEQUENCE_NAMES) {
            await queryRunner.query(`DROP SEQUENCE IF EXISTS "${name}"`, undefined);
        }
    }
}
