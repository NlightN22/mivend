import { Column } from 'typeorm';
import { bigintNumber } from 'shared';

// jsonb for the contract's NamedRef, EnumValue, TypedDocumentRef and AccountingReflection messages, kept as received.
export type ErpRef = Record<string, unknown>;

// Optional ERP fields: null means the ERP did not send it.
export const varcharCol = (): PropertyDecorator => Column({ type: 'varchar', nullable: true });
export const textCol = (): PropertyDecorator => Column({ type: 'text', nullable: true });
export const floatCol = (): PropertyDecorator => Column({ type: 'float', nullable: true });
export const intCol = (): PropertyDecorator => Column({ type: 'int', nullable: true });
export const boolCol = (): PropertyDecorator => Column({ type: 'boolean', nullable: true });
export const timeCol = (): PropertyDecorator => Column({ type: 'timestamptz', nullable: true });
export const refCol = (): PropertyDecorator => Column({ type: 'jsonb', nullable: true });

// Minor units (the settlement convention); a plain proto3 number that is absent reads as zero.
export const moneyCol = (): PropertyDecorator =>
    Column({ type: 'bigint', nullable: true, transformer: bigintNumber });
export const moneyZeroCol = (): PropertyDecorator =>
    Column({ type: 'bigint', default: 0, transformer: bigintNumber });
export const floatZeroCol = (): PropertyDecorator => Column({ type: 'float', default: 0 });
