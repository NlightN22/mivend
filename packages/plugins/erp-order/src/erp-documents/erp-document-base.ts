import { Column, CreateDateColumn, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';

// What the ERP last sent for a document. Only the stream writes it; a tombstone sets isDeleted and keeps the data.
export abstract class ErpDocumentBase {
    @PrimaryGeneratedColumn('increment')
    id!: number;

    @CreateDateColumn({ type: 'timestamptz' })
    createdAt!: Date;

    @UpdateDateColumn({ type: 'timestamptz' })
    updatedAt!: Date;

    @Column({ type: 'varchar' })
    erpId!: string;

    @Column({ type: 'varchar' })
    sourceVersion!: string;

    @Column({ type: 'timestamptz', nullable: true })
    sourceUpdatedAt!: Date | null;

    @Column({ type: 'boolean', default: false })
    isDeleted!: boolean;
}

// Line rows are replaced as a whole with each newer document version; documentId is the header's id, no foreign key.
export abstract class ErpLineBase {
    @PrimaryGeneratedColumn('increment')
    id!: number;

    @Column({ type: 'int' })
    documentId!: number;

    @Column({ type: 'int' })
    lineNumber!: number;
}
