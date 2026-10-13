type Gender = 'm' | 'f';
type Forms = [one: string, few: string, many: string];

const ONES: Record<Gender, string[]> = {
    m: ['', 'один', 'два', 'три', 'четыре', 'пять', 'шесть', 'семь', 'восемь', 'девять'],
    f: ['', 'одна', 'две', 'три', 'четыре', 'пять', 'шесть', 'семь', 'восемь', 'девять'],
};
const TEENS = [
    'десять',
    'одиннадцать',
    'двенадцать',
    'тринадцать',
    'четырнадцать',
    'пятнадцать',
    'шестнадцать',
    'семнадцать',
    'восемнадцать',
    'девятнадцать',
];
const TENS = [
    '',
    '',
    'двадцать',
    'тридцать',
    'сорок',
    'пятьдесят',
    'шестьдесят',
    'семьдесят',
    'восемьдесят',
    'девяносто',
];
const HUNDREDS = [
    '',
    'сто',
    'двести',
    'триста',
    'четыреста',
    'пятьсот',
    'шестьсот',
    'семьсот',
    'восемьсот',
    'девятьсот',
];
const MONTHS_GENITIVE = [
    'января',
    'февраля',
    'марта',
    'апреля',
    'мая',
    'июня',
    'июля',
    'августа',
    'сентября',
    'октября',
    'ноября',
    'декабря',
];
const SCALES: { forms: Forms; gender: Gender }[] = [
    { forms: ['тысяча', 'тысячи', 'тысяч'], gender: 'f' },
    { forms: ['миллион', 'миллиона', 'миллионов'], gender: 'm' },
    { forms: ['миллиард', 'миллиарда', 'миллиардов'], gender: 'm' },
];
const RUBLE: Forms = ['рубль', 'рубля', 'рублей'];
const KOPECK: Forms = ['копейка', 'копейки', 'копеек'];

export function pluralForm(n: number, forms: Forms): string {
    const lastTwo = n % 100;
    const last = n % 10;
    if (lastTwo >= 11 && lastTwo <= 14) return forms[2];
    if (last === 1) return forms[0];
    if (last >= 2 && last <= 4) return forms[1];
    return forms[2];
}

function triplet(n: number, gender: Gender): string[] {
    const words: string[] = [HUNDREDS[Math.floor(n / 100)]];
    const rest = n % 100;
    if (rest >= 10 && rest < 20) {
        words.push(TEENS[rest - 10]);
    } else {
        words.push(TENS[Math.floor(rest / 10)], ONES[gender][rest % 10]);
    }
    return words.filter(Boolean);
}

function integerInWords(n: number, gender: Gender): string {
    if (n === 0) return 'ноль';
    const words: string[] = [];
    const groups: number[] = [];
    for (let rest = n; rest > 0; rest = Math.floor(rest / 1000)) groups.push(rest % 1000);
    for (let i = groups.length - 1; i >= 0; i--) {
        if (groups[i] === 0) continue;
        const scale = i === 0 ? null : SCALES[i - 1];
        words.push(...triplet(groups[i], scale ? scale.gender : gender));
        if (scale) words.push(pluralForm(groups[i], scale.forms));
    }
    return words.join(' ');
}

// Minor units (kopecks) in, e.g. 483370 -> "Четыре тысячи восемьсот тридцать три рубля 70 копеек".
export function rublesInWords(minorUnits: number): string {
    const rubles = Math.floor(minorUnits / 100);
    const kopecks = minorUnits % 100;
    const text = `${integerInWords(rubles, 'm')} ${pluralForm(rubles, RUBLE)}`;
    const kopeckText = `${String(kopecks).padStart(2, '0')} ${pluralForm(kopecks, KOPECK)}`;
    const sentence = `${text} ${kopeckText}`;
    return sentence.charAt(0).toUpperCase() + sentence.slice(1);
}

export function dateInWords(date: Date): string {
    return `${date.getUTCDate()} ${MONTHS_GENITIVE[date.getUTCMonth()]} ${date.getUTCFullYear()} г.`;
}

export function formatMoneyRu(minorUnits: number): string {
    const negative = minorUnits < 0;
    const abs = Math.abs(minorUnits);
    const whole = String(Math.floor(abs / 100)).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
    const fraction = String(abs % 100).padStart(2, '0');
    return `${negative ? '-' : ''}${whole},${fraction}`;
}
