import type en from '../en/contracts';

export default {
    contracts: {
        title: 'Договоры',
        subtitle: 'Ваши договоры и приложенные к ним файлы.',
        empty: 'Файлов по договорам пока нет.',
        download: 'Скачать',
        columns: { contract: 'Договор', kind: 'Тип файла', date: 'Дата', file: 'Файл' },
        kind: {
            scan: 'Скан договора',
            'power-of-attorney-scan': 'Скан доверенности',
            other: 'Другое',
        },
    },
} satisfies typeof en;
