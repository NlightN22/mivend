import type en from '../en/demo';

const ru: typeof en = {
    demo: {
        people: {
            ivanPetrov: { name: 'Иван Петров', initials: 'ИП' },
            alexeySmirnov: { name: 'Алексей Смирнов', initials: 'АС' },
            elenaMorozova: { name: 'Елена Морозова', initials: 'ЕМ' },
            kirillNikitin: { name: 'Кирилл Никитин', initials: 'КН' },
            sergeyIvanov: { name: 'Сергей Иванов', initials: 'СИ' },
        },
        points: {
            main: 'Основная точка обслуживания',
            north: 'Северный склад',
            warehouse: 'Склад Б',
        },
        pointAddresses: {
            main: 'ул. Промышленная, 14',
            north: 'Северное шоссе, 52',
            warehouse: 'Складская зона, 8',
        },
        products: {
            motorOil: 'Моторное масло 5W-40, 4 л',
            oilFilter: 'Масляный фильтр для популярных моделей',
            antifreeze: 'Антифриз G12 красный, 5 кг',
            lampH7: 'Автолампа H7 12V',
        },
    },
};

export default ru;
