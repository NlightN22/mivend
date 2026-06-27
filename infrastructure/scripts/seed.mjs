// Seed script for local development. Run: node infrastructure/scripts/seed.mjs
// Requires the server to be running on localhost:3000

const API_URL = `http://localhost:${process.env.PORT ?? '3000'}/admin-api`;

async function gql(query, variables, token) {
    const headers = { 'Content-Type': 'application/json' };
    if (token) headers['Authorization'] = `Bearer ${token}`;
    const res = await fetch(API_URL, { method: 'POST', headers, body: JSON.stringify({ query, variables }) });
    const json = await res.json();
    const authToken = res.headers.get('vendure-auth-token');
    if (json.errors) throw new Error(json.errors[0].message);
    return { data: json.data, authToken };
}

async function login() {
    const { data, authToken } = await gql(`mutation { login(username:"superadmin",password:"superadmin") { ...on CurrentUser{id identifier} } }`);
    if (!authToken) throw new Error('Login failed');
    console.log('✔ Logged in as', data.login.identifier);
    return authToken;
}

async function isAlreadySeeded(token) {
    const { data } = await gql(`query { products(options:{take:1}){ totalItems } }`, {}, token);
    return data.products.totalItems >= 190;
}

async function createFacet(token, name, code, values) {
    const { data } = await gql(`
        mutation CreateFacet($input: CreateFacetInput!) {
            createFacet(input: $input) { id values { id name code } }
        }`, {
        input: {
            isPrivate: false, code,
            translations: [{ languageCode: 'en', name }],
            values: values.map(v => ({ code: v.code, translations: [{ languageCode: 'en', name: v.name }] })),
        },
    }, token);
    console.log(`✔ Facet "${name}" (${values.length} values)`);
    return data.createFacet;
}

async function createProduct(token, { name, slug, facetValueIds, sku, price, stock }) {
    const { data: pd } = await gql(`
        mutation CreateProduct($input: CreateProductInput!) {
            createProduct(input: $input) { id }
        }`, {
        input: { translations: [{ languageCode: 'en', name, slug, description: '' }], facetValueIds },
    }, token);
    await gql(`
        mutation CreateVariants($input: [CreateProductVariantInput!]!) {
            createProductVariants(input: $input) { id }
        }`, {
        input: [{
            productId: pd.createProduct.id,
            translations: [{ languageCode: 'en', name }],
            sku, price,
            stockOnHand: stock,
            trackInventory: 'TRUE',
            optionIds: [],
        }],
    }, token);
}

async function createCustomer(token, firstName, lastName, emailAddress, phone) {
    const { data } = await gql(`
        mutation CreateCustomer($input: CreateCustomerInput!, $password: String) {
            createCustomer(input: $input, password: $password) {
                ...on Customer { id }
                ...on ErrorResult { errorCode message }
            }
        }`, {
        input: { firstName, lastName, emailAddress, phoneNumber: phone },
        password: 'Password123!',
    }, token);
    if (data.createCustomer.errorCode) {
        console.warn(`⚠ Customer "${firstName} ${lastName}":`, data.createCustomer.message);
    } else {
        console.log(`✔ Customer "${firstName} ${lastName}"`);
    }
}

async function setupChannel(token) {
    const { data: zd } = await gql(`mutation { createZone(input:{name:"Default Zone",memberIds:[]}) { id } }`, {}, token);
    const { data: cd } = await gql(`mutation { createTaxCategory(input:{name:"Standard",isDefault:true}) { id } }`, {}, token);
    await gql(`mutation CreateTaxRate($input:CreateTaxRateInput!){createTaxRate(input:$input){id}}`, {
        input: { name: 'Standard Tax', enabled: true, value: 0, categoryId: cd.createTaxCategory.id, zoneId: zd.createZone.id },
    }, token);
    const { data: ch } = await gql(`query { channels { items { id } } }`, {}, token);
    await gql(`mutation UpdateChannel($input:UpdateChannelInput!){updateChannel(input:$input){...on Channel{id}}}`, {
        input: { id: ch.channels.items[0].id, defaultTaxZoneId: zd.createZone.id, defaultShippingZoneId: zd.createZone.id },
    }, token);
    console.log('✔ Channel configured');
}

// ── Product catalogue ──────────────────────────────────────────────────────────
// Each row: [name, slug, category-code, brand-code, price-kopecks, stock]
const CATALOGUE = [
    // MOTOR OILS — 30 products
    ['Motor Oil Lukoil Genesis 5W-40 1L',  'lukoil-genesis-5w40-1l',  'motor-oils', 'lukoil',   89000, 500],
    ['Motor Oil Lukoil Genesis 5W-40 4L',  'lukoil-genesis-5w40-4l',  'motor-oils', 'lukoil',  320000, 300],
    ['Motor Oil Lukoil Genesis 5W-40 5L',  'lukoil-genesis-5w40-5l',  'motor-oils', 'lukoil',  390000, 200],
    ['Motor Oil Lukoil Luxe 10W-40 1L',    'lukoil-luxe-10w40-1l',    'motor-oils', 'lukoil',   62000, 600],
    ['Motor Oil Lukoil Luxe 10W-40 4L',    'lukoil-luxe-10w40-4l',    'motor-oils', 'lukoil',  230000, 380],
    ['Motor Oil Motul 8100 X-Clean 5W-30 1L', 'motul-8100-5w30-1l',   'motor-oils', 'motul',  125000, 400],
    ['Motor Oil Motul 8100 X-Clean 5W-30 4L', 'motul-8100-5w30-4l',   'motor-oils', 'motul',  460000, 150],
    ['Motor Oil Motul 300V 5W-40 1L',      'motul-300v-5w40-1l',      'motor-oils', 'motul',  185000, 200],
    ['Motor Oil Motul 300V 5W-40 2L',      'motul-300v-5w40-2l',      'motor-oils', 'motul',  355000,  80],
    ['Motor Oil Castrol EDGE 5W-40 1L',    'castrol-edge-5w40-1l',    'motor-oils', 'castrol', 110000, 350],
    ['Motor Oil Castrol EDGE 5W-40 4L',    'castrol-edge-5w40-4l',    'motor-oils', 'castrol', 400000, 220],
    ['Motor Oil Castrol EDGE 5W-40 5L',    'castrol-edge-5w40-5l',    'motor-oils', 'castrol', 480000, 160],
    ['Motor Oil Castrol GTX 10W-40 1L',    'castrol-gtx-10w40-1l',    'motor-oils', 'castrol',  75000, 450],
    ['Motor Oil Castrol GTX 10W-40 4L',    'castrol-gtx-10w40-4l',    'motor-oils', 'castrol', 275000, 280],
    ['Motor Oil Shell Helix Ultra 5W-40 1L','shell-helix-ultra-1l',   'motor-oils', 'shell',   120000, 300],
    ['Motor Oil Shell Helix Ultra 5W-40 4L','shell-helix-ultra-4l',   'motor-oils', 'shell',   440000, 180],
    ['Motor Oil Shell Helix HX7 10W-40 1L','shell-helix-hx7-1l',      'motor-oils', 'shell',    80000, 400],
    ['Motor Oil Shell Helix HX7 10W-40 4L','shell-helix-hx7-4l',      'motor-oils', 'shell',   295000, 250],
    ['Motor Oil Mobil 1 ESP 5W-30 1L',     'mobil1-esp-5w30-1l',      'motor-oils', 'mobil',   135000, 280],
    ['Motor Oil Mobil 1 ESP 5W-30 4L',     'mobil1-esp-5w30-4l',      'motor-oils', 'mobil',   495000, 120],
    ['Motor Oil Mobil Super 3000 5W-40 1L','mobil-super3000-1l',       'motor-oils', 'mobil',    95000, 320],
    ['Motor Oil Mobil Super 3000 5W-40 4L','mobil-super3000-4l',       'motor-oils', 'mobil',   350000, 180],
    ['Motor Oil Total Quartz 9000 0W-20 1L','total-quartz-9000-0w20-1l','motor-oils','total',   145000, 180],
    ['Motor Oil Total Quartz 9000 0W-20 5L','total-quartz-9000-0w20-5l','motor-oils','total',   680000,  60],
    ['Motor Oil Total Quartz 7000 10W-40 1L','total-quartz-7000-1l',   'motor-oils', 'total',    70000, 420],
    ['Motor Oil Total Quartz 7000 10W-40 4L','total-quartz-7000-4l',   'motor-oils', 'total',   258000, 260],
    ['Motor Oil Total Quartz 7000 10W-40 5L','total-quartz-7000-5l',   'motor-oils', 'total',   315000, 190],
    ['Motor Oil Lukoil Avangard 5W-30 1L', 'lukoil-avangard-5w30-1l', 'motor-oils', 'lukoil',   98000, 340],
    ['Motor Oil Lukoil Avangard 5W-30 4L', 'lukoil-avangard-5w30-4l', 'motor-oils', 'lukoil',  360000, 200],
    ['Motor Oil Motul Specific 504 00 5W-30 1L','motul-specific-504-1l','motor-oils','motul',   165000, 140],

    // TRANSMISSION FLUIDS — 12 products
    ['ATF Dexron VI Lukoil 1L',            'atf-dexron-vi-lukoil-1l', 'transmission','lukoil',   55000, 200],
    ['ATF Dexron VI Lukoil 4L',            'atf-dexron-vi-lukoil-4l', 'transmission','lukoil',  195000, 120],
    ['ATF Dexron VI Shell 1L',             'atf-dexron-vi-shell-1l',  'transmission','shell',    68000, 180],
    ['ATF Dexron VI Shell 4L',             'atf-dexron-vi-shell-4l',  'transmission','shell',   245000, 100],
    ['Gear Oil GL-4 75W-90 Motul 1L',      'gear-oil-gl4-motul-1l',   'transmission','motul',    85000, 160],
    ['Gear Oil GL-4 75W-90 Motul 4L',      'gear-oil-gl4-motul-4l',   'transmission','motul',   310000,  80],
    ['Gear Oil GL-4 75W-90 Castrol 1L',    'gear-oil-gl4-castrol-1l', 'transmission','castrol',  78000, 140],
    ['Gear Oil GL-4 75W-90 Castrol 4L',    'gear-oil-gl4-castrol-4l', 'transmission','castrol', 285000,  70],
    ['Gear Oil GL-5 80W-90 Shell 1L',      'gear-oil-gl5-shell-1l',   'transmission','shell',    72000, 150],
    ['Gear Oil GL-5 80W-90 Shell 4L',      'gear-oil-gl5-shell-4l',   'transmission','shell',   265000,  90],
    ['Gear Oil GL-5 80W-90 Mobil 1L',      'gear-oil-gl5-mobil-1l',   'transmission','mobil',    80000, 130],
    ['Gear Oil GL-5 80W-90 Mobil 4L',      'gear-oil-gl5-mobil-4l',   'transmission','mobil',   295000,  65],

    // COOLANTS — 10 products
    ['Coolant Sintec Antifreeze G12 -40 1L','sintec-g12-1l',           'auto-chemicals','sintec', 22000, 600],
    ['Coolant Sintec Antifreeze G12 -40 5L','sintec-g12-5l',           'auto-chemicals','sintec', 95000, 300],
    ['Coolant Sintec Antifreeze G12 -40 10L','sintec-g12-10l',         'auto-chemicals','sintec',175000, 100],
    ['Coolant Sintec Antifreeze G11 -40 1L','sintec-g11-1l',           'auto-chemicals','sintec', 19000, 500],
    ['Coolant Sintec Antifreeze G11 -40 5L','sintec-g11-5l',           'auto-chemicals','sintec', 82000, 250],
    ['Coolant Hi-Gear Antifreeze G12+ 1L', 'higear-g12-1l',            'auto-chemicals','hi-gear', 28000, 400],
    ['Coolant Hi-Gear Antifreeze G12+ 5L', 'higear-g12-5l',            'auto-chemicals','hi-gear',110000, 180],
    ['Coolant Motul Inugel Expert -37 1L', 'motul-inugel-1l',          'auto-chemicals','motul',   45000, 220],
    ['Coolant Motul Inugel Expert -37 5L', 'motul-inugel-5l',          'auto-chemicals','motul',  195000,  90],
    ['Distilled Water 5L',                 'distilled-water-5l',       'auto-chemicals','sintec',   8000, 800],

    // OIL FILTERS — 18 products
    ['Oil Filter Mann HU 811/80 x',        'mann-hu-811-80x',         'filters','mann',  32000, 300],
    ['Oil Filter Mann HU 719/7 x',         'mann-hu-719-7x',          'filters','mann',  28000, 350],
    ['Oil Filter Mann HU 712/7 x',         'mann-hu-712-7x',          'filters','mann',  30000, 280],
    ['Oil Filter Mann HU 68 x',            'mann-hu-68x',             'filters','mann',  26000, 400],
    ['Oil Filter Mann HU 7009 z',          'mann-hu-7009z',           'filters','mann',  35000, 220],
    ['Oil Filter Mann HU 821/4 x',         'mann-hu-821-4x',          'filters','mann',  31000, 260],
    ['Oil Filter Bosch 0 451 103 259',     'bosch-0451103259',        'filters','bosch', 38000, 200],
    ['Oil Filter Bosch 0 451 103 369',     'bosch-0451103369',        'filters','bosch', 35000, 240],
    ['Oil Filter Bosch 0 451 103 273',     'bosch-0451103273',        'filters','bosch', 40000, 180],
    ['Oil Filter Filtron OP 613/1',        'filtron-op-613-1',        'filters','filtron',25000, 380],
    ['Oil Filter Filtron OP 629/1',        'filtron-op-629-1',        'filters','filtron',27000, 320],
    ['Oil Filter Filtron OP 520/1',        'filtron-op-520-1',        'filters','filtron',24000, 360],
    ['Oil Filter Mahle OX 352/1D',         'mahle-ox-352-1d',         'filters','mahle', 34000, 200],
    ['Oil Filter Mahle OX 153D',           'mahle-ox-153d',           'filters','mahle', 29000, 250],
    ['Oil Filter Mahle OX 188D',           'mahle-ox-188d',           'filters','mahle', 36000, 180],
    ['Oil Filter Knecht OC 90',            'knecht-oc-90',            'filters','knecht',28000, 300],
    ['Oil Filter Knecht OC 115',           'knecht-oc-115',           'filters','knecht',30000, 270],
    ['Oil Filter Knecht OC 285',           'knecht-oc-285',           'filters','knecht',32000, 240],

    // AIR FILTERS — 12 products
    ['Air Filter Mann C 2940/1',           'mann-c-2940-1',           'filters','mann',  24000, 250],
    ['Air Filter Mann C 24 003',           'mann-c-24-003',           'filters','mann',  28000, 200],
    ['Air Filter Mann C 2584',             'mann-c-2584',             'filters','mann',  22000, 300],
    ['Air Filter Mann C 30 130',           'mann-c-30-130',           'filters','mann',  26000, 220],
    ['Air Filter Bosch 1 987 432 109',     'bosch-1987432109',        'filters','bosch', 32000, 180],
    ['Air Filter Bosch 1 987 432 043',     'bosch-1987432043',        'filters','bosch', 35000, 160],
    ['Air Filter Bosch 1 987 432 500',     'bosch-1987432500',        'filters','bosch', 30000, 200],
    ['Air Filter Filtron AP 031/6',        'filtron-ap-031-6',        'filters','filtron',20000, 280],
    ['Air Filter Filtron AP 183',          'filtron-ap-183',          'filters','filtron',22000, 260],
    ['Air Filter Mahle LX 769',            'mahle-lx-769',            'filters','mahle', 27000, 190],
    ['Air Filter Mahle LX 1940',           'mahle-lx-1940',           'filters','mahle', 29000, 170],
    ['Air Filter Knecht LX 1693',          'knecht-lx-1693',          'filters','knecht',25000, 220],

    // CABIN FILTERS — 10 products
    ['Cabin Filter Mann CU 2532',          'mann-cu-2532',            'filters','mann',  38000, 200],
    ['Cabin Filter Mann CU 3360',          'mann-cu-3360',            'filters','mann',  42000, 180],
    ['Cabin Filter Mann CU 2939',          'mann-cu-2939',            'filters','mann',  36000, 220],
    ['Cabin Filter Bosch 1 987 432 244',   'bosch-1987432244',        'filters','bosch', 48000, 160],
    ['Cabin Filter Bosch 1 987 432 197',   'bosch-1987432197',        'filters','bosch', 45000, 170],
    ['Cabin Filter Filtron K 1169',        'filtron-k-1169',          'filters','filtron',32000, 240],
    ['Cabin Filter Filtron K 1172',        'filtron-k-1172',          'filters','filtron',34000, 220],
    ['Cabin Filter Mahle LAK 295',         'mahle-lak-295',           'filters','mahle', 40000, 190],
    ['Cabin Filter Mahle LAK 157',         'mahle-lak-157',           'filters','mahle', 38000, 200],
    ['Cabin Filter Knecht LA 168/S',       'knecht-la-168s',          'filters','knecht',36000, 210],

    // BRAKE PADS — 18 products
    ['Brake Pads Front Brembo P 85 048',   'brembo-p85048-f',         'brake-system','brembo', 420000, 80],
    ['Brake Pads Front Brembo P 85 052',   'brembo-p85052-f',         'brake-system','brembo', 390000, 90],
    ['Brake Pads Rear Brembo P 85 050',    'brembo-p85050-r',         'brake-system','brembo', 350000, 70],
    ['Brake Pads Front Bosch 0 986 424 381','bosch-0986424381-f',     'brake-system','bosch',  280000, 120],
    ['Brake Pads Front Bosch 0 986 494 150','bosch-0986494150-f',     'brake-system','bosch',  310000, 100],
    ['Brake Pads Rear Bosch 0 986 424 491','bosch-0986424491-r',      'brake-system','bosch',  250000, 110],
    ['Brake Pads Front TRW GDB1451',       'trw-gdb1451-f',           'brake-system','trw',    230000, 140],
    ['Brake Pads Front TRW GDB1622',       'trw-gdb1622-f',           'brake-system','trw',    245000, 130],
    ['Brake Pads Rear TRW GDB1453',        'trw-gdb1453-r',           'brake-system','trw',    210000, 120],
    ['Brake Pads Front Textar 2365001',    'textar-2365001-f',        'brake-system','textar', 195000, 150],
    ['Brake Pads Front Textar 2371701',    'textar-2371701-f',        'brake-system','textar', 210000, 140],
    ['Brake Pads Rear Textar 2380801',     'textar-2380801-r',        'brake-system','textar', 175000, 130],
    ['Brake Pads Front Ferodo FDB1284',    'ferodo-fdb1284-f',        'brake-system','ferodo', 220000, 120],
    ['Brake Pads Front Ferodo FDB4603',    'ferodo-fdb4603-f',        'brake-system','ferodo', 245000, 100],
    ['Brake Pads Rear Ferodo FDB1285',     'ferodo-fdb1285-r',        'brake-system','ferodo', 195000, 110],
    ['Brake Pads Front ATE 13.0460-7189.2','ate-13046071892-f',       'brake-system','ate',    205000, 130],
    ['Brake Pads Rear ATE 13.0460-5945.2', 'ate-13046059452-r',      'brake-system','ate',    185000, 120],
    ['Brake Pads Front Mintex MDB1693',    'mintex-mdb1693-f',        'brake-system','mintex', 215000, 100],

    // BRAKE DISCS — 12 products
    ['Brake Disc Front Brembo 09.8945.11', 'brembo-09894511-f',       'brake-system','brembo', 680000, 40],
    ['Brake Disc Front Brembo 09.B222.11', 'brembo-09b22211-f',       'brake-system','brembo', 720000, 35],
    ['Brake Disc Rear Brembo 08.B222.11',  'brembo-08b22211-r',       'brake-system','brembo', 590000, 30],
    ['Brake Disc Front Bosch 0 986 479 A86','bosch-0986479a86-f',     'brake-system','bosch',  420000, 60],
    ['Brake Disc Front Bosch 0 986 479 A55','bosch-0986479a55-f',     'brake-system','bosch',  385000, 70],
    ['Brake Disc Rear Bosch 0 986 479 E12','bosch-0986479e12-r',      'brake-system','bosch',  350000, 55],
    ['Brake Disc Front TRW DF4922',        'trw-df4922-f',            'brake-system','trw',    340000, 75],
    ['Brake Disc Front TRW DF6103',        'trw-df6103-f',            'brake-system','trw',    365000, 65],
    ['Brake Disc Rear TRW DF4916',         'trw-df4916-r',            'brake-system','trw',    310000, 60],
    ['Brake Disc Front Textar 92155903',   'textar-92155903-f',       'brake-system','textar', 320000, 80],
    ['Brake Disc Rear Textar 92155803',    'textar-92155803-r',       'brake-system','textar', 290000, 70],
    ['Brake Disc Front ATE 24.0120-0102.1','ate-24012001021-f',       'brake-system','ate',    310000, 75],

    // SPARK PLUGS — 20 products
    ['Spark Plug NGK BPR6ES',              'ngk-bpr6es',              'spark-plugs','ngk',     15000,1000],
    ['Spark Plug NGK BKR6E',               'ngk-bkr6e',               'spark-plugs','ngk',     18000, 900],
    ['Spark Plug NGK IZFR6K11',            'ngk-izfr6k11',            'spark-plugs','ngk',     65000, 400],
    ['Spark Plug NGK IFR5L11',             'ngk-ifr5l11',             'spark-plugs','ngk',     75000, 350],
    ['Spark Plug NGK LFR5A-11',            'ngk-lfr5a-11',            'spark-plugs','ngk',     28000, 700],
    ['Spark Plug Bosch 0 242 235 668',     'bosch-0242235668',        'spark-plugs','bosch',   20000, 800],
    ['Spark Plug Bosch 0 242 235 666',     'bosch-0242235666',        'spark-plugs','bosch',   17000, 900],
    ['Spark Plug Bosch 0 241 229 578',     'bosch-0241229578',        'spark-plugs','bosch',   85000, 300],
    ['Spark Plug Bosch 0 242 236 562',     'bosch-0242236562',        'spark-plugs','bosch',   22000, 750],
    ['Spark Plug Denso K20HR-U11',         'denso-k20hr-u11',         'spark-plugs','denso',   55000, 500],
    ['Spark Plug Denso IK20TT',            'denso-ik20tt',            'spark-plugs','denso',   80000, 350],
    ['Spark Plug Denso GK5B',              'denso-gk5b',              'spark-plugs','denso',   16000, 850],
    ['Spark Plug Champion RC8YC',          'champion-rc8yc',          'spark-plugs','champion', 14000, 900],
    ['Spark Plug Champion OE022T10',       'champion-oe022t10',       'spark-plugs','champion', 19000, 750],
    ['Spark Plug Champion 9003',           'champion-9003',           'spark-plugs','champion', 75000, 300],
    ['Spark Plug NGK BPR7ES',              'ngk-bpr7es',              'spark-plugs','ngk',     16000, 950],
    ['Spark Plug NGK LZKAR6AP-11',         'ngk-lzkar6ap11',          'spark-plugs','ngk',     72000, 320],
    ['Spark Plug Bosch Super 4 0 242 232 502','bosch-super4-0242232502','spark-plugs','bosch',  48000, 450],
    ['Spark Plug Denso SK16HR11',          'denso-sk16hr11',          'spark-plugs','denso',   62000, 380],
    ['Spark Plug Champion RE8YC4',         'champion-re8yc4',         'spark-plugs','champion', 58000, 350],

    // BATTERIES — 10 products
    ['Car Battery Bosch S4 60Ah 540A',     'bosch-s4-60ah',           'batteries','bosch',   890000, 50],
    ['Car Battery Bosch S4 74Ah 680A',     'bosch-s4-74ah',           'batteries','bosch',  1050000, 40],
    ['Car Battery Bosch S5 77Ah 780A',     'bosch-s5-77ah',           'batteries','bosch',  1450000, 25],
    ['Car Battery Varta Blue Dynamic 60Ah','varta-blue-60ah',          'batteries','varta',   870000, 45],
    ['Car Battery Varta Blue Dynamic 74Ah','varta-blue-74ah',          'batteries','varta',  1020000, 35],
    ['Car Battery Varta Silver Dynamic 74Ah','varta-silver-74ah',      'batteries','varta',  1380000, 20],
    ['Car Battery Exide EC550 55Ah 460A',  'exide-ec550',             'batteries','exide',   720000, 55],
    ['Car Battery Exide EK600 60Ah 640A',  'exide-ek600',             'batteries','exide',   890000, 45],
    ['Car Battery Exide EK800 80Ah 800A',  'exide-ek800',             'batteries','exide',  1250000, 25],
    ['Car Battery Varta Black Dynamic 60Ah','varta-black-60ah',        'batteries','varta',   820000, 50],

    // SUSPENSION — 18 products
    ['Shock Absorber Front Sachs 313 514', 'sachs-313514-f',          'suspension','sachs',  460000, 60],
    ['Shock Absorber Front Sachs 312 909', 'sachs-312909-f',          'suspension','sachs',  490000, 55],
    ['Shock Absorber Rear Sachs 313 515',  'sachs-313515-r',          'suspension','sachs',  390000, 65],
    ['Shock Absorber Front KYB 334812',    'kyb-334812-f',            'suspension','kyb',    420000, 70],
    ['Shock Absorber Front KYB 333820',    'kyb-333820-f',            'suspension','kyb',    445000, 65],
    ['Shock Absorber Rear KYB 334813',     'kyb-334813-r',            'suspension','kyb',    360000, 75],
    ['Shock Absorber Front Monroe E1188',  'monroe-e1188-f',          'suspension','monroe', 380000, 80],
    ['Shock Absorber Rear Monroe E1189',   'monroe-e1189-r',          'suspension','monroe', 320000, 85],
    ['Shock Absorber Front Bilstein 22-107839','bilstein-22107839-f', 'suspension','bilstein',780000, 25],
    ['Strut Mount Front Sachs 802 375',    'sachs-802375-f',          'suspension','sachs',  145000, 100],
    ['Strut Mount Rear Sachs 802 376',     'sachs-802376-r',          'suspension','sachs',  138000, 100],
    ['Control Arm Bushing Front 48654-26110','toyota-48654-26110',    'suspension','',        35000, 200],
    ['Stabilizer Link Front TRW JTS1068',  'trw-jts1068-f',          'suspension','trw',     85000, 150],
    ['Stabilizer Link Rear TRW JTS1069',   'trw-jts1069-r',          'suspension','trw',     78000, 140],
    ['Ball Joint TRW JBJ755',              'trw-jbj755',              'suspension','trw',    175000,  90],
    ['Tie Rod End TRW JTE1145',            'trw-jte1145',             'suspension','trw',    125000, 110],
    ['Wheel Bearing SKF VKBA 3568',        'skf-vkba3568',            'suspension','skf',    285000,  70],
    ['Wheel Bearing SKF VKBA 6504',        'skf-vkba6504',            'suspension','skf',    310000,  60],

    // TIMING BELTS & KITS — 10 products
    ['Timing Belt Gates T149',             'gates-t149',              'spare-parts','gates',   95000, 120],
    ['Timing Belt Gates T225',             'gates-t225',              'spare-parts','gates',  115000, 100],
    ['Timing Belt Kit Gates K015649XS',    'gates-k015649xs',         'spare-parts','gates',  380000,  50],
    ['Timing Belt Kit Continental CT1028K1','continental-ct1028k1',   'spare-parts','continental',420000,45],
    ['Serpentine Belt Gates 6PK1763',      'gates-6pk1763',           'spare-parts','gates',   85000, 150],
    ['Serpentine Belt Gates 6PK2040',      'gates-6pk2040',           'spare-parts','gates',   92000, 140],
    ['Timing Belt Dayco 941045',           'dayco-941045',            'spare-parts','dayco',  102000, 110],
    ['Timing Belt Kit Dayco KTB428',       'dayco-ktb428',            'spare-parts','dayco',  395000,  45],
    ['Serpentine Belt Continental 6PK1550','continental-6pk1550',     'spare-parts','continental',88000,130],
    ['Water Pump Gates WP0154',            'gates-wp0154',            'spare-parts','gates',  285000,  60],

    // LIGHTING — 12 products
    ['Headlight Bulb H4 Philips 12342PRC1','philips-12342prc1',       'accessories','philips', 48000, 300],
    ['Headlight Bulb H7 Philips 12972PRC1','philips-12972prc1',       'accessories','philips', 52000, 280],
    ['Headlight Bulb H4 Osram 64193NBS',  'osram-64193nbs',           'accessories','osram',   45000, 320],
    ['Headlight Bulb H7 Osram 64210NBS',  'osram-64210nbs',           'accessories','osram',   48000, 300],
    ['LED H4 Philips Ultinon Pro9000',     'philips-ultinon-h4',      'accessories','philips', 580000,  60],
    ['LED H7 Philips Ultinon Pro9000',     'philips-ultinon-h7',      'accessories','philips', 580000,  55],
    ['Fog Light Bulb H11 Osram 64211NBU', 'osram-64211nbu',           'accessories','osram',   38000, 350],
    ['Parking Bulb W5W Osram 2825',        'osram-2825',              'accessories','osram',    4500, 1000],
    ['Indicator Bulb PY21W Philips 12496B2','philips-12496b2',        'accessories','philips',  6500, 900],
    ['Headlight Bulb H1 Bosch 1 987 301 002','bosch-1987301002',      'accessories','bosch',   32000, 400],
    ['Xenon Bulb D2S Philips 85122VIS1',   'philips-85122vis1',       'accessories','philips', 950000,  20],
    ['Xenon Bulb D2S Osram 66240CBI',      'osram-66240cbi',          'accessories','osram',   880000,  22],

    // AUTO CHEMICALS — 14 products
    ['Brake Fluid DOT4 Hi-Gear HG7042 0.5L','higear-dot4-05l',       'auto-chemicals','hi-gear', 24000, 500],
    ['Brake Fluid DOT4 Sintec 0.5L',       'sintec-dot4-05l',        'auto-chemicals','sintec',  20000, 600],
    ['Brake Fluid DOT4 Bosch 0 986 331 700 0.5L','bosch-dot4-05l',   'auto-chemicals','bosch',   28000, 450],
    ['Windshield Washer Fluid -25°C 4L Sintec','sintec-washer-25-4l','auto-chemicals','sintec',  18000, 700],
    ['Windshield Washer Fluid -30°C 4L Sintec','sintec-washer-30-4l','auto-chemicals','sintec',  22000, 600],
    ['Engine Flush Liqui Moly 5min 0.3L', 'liquimoly-flush-5min',    'auto-chemicals','liqui-moly',85000,200],
    ['Power Steering Fluid Hi-Gear HG7047 0.95L','higear-psf-095l',  'auto-chemicals','hi-gear', 38000, 250],
    ['AC System Cleaner Liqui Moly 500ml', 'liquimoly-ac-cleaner',   'auto-chemicals','liqui-moly',145000,100],
    ['Radiator Flush Liqui Moly 0.3L',    'liquimoly-rad-flush',     'auto-chemicals','liqui-moly',75000,180],
    ['Chain Spray Liqui Moly 400ml',       'liquimoly-chain-spray',  'auto-chemicals','liqui-moly',95000,150],
    ['Carburetor Cleaner Hi-Gear HG3144 400ml','higear-carb-cleaner','auto-chemicals','hi-gear',  55000, 250],
    ['Rust Penetrant WD-40 450ml',         'wd40-450ml',             'auto-chemicals','wd-40',    48000, 400],
    ['Rust Penetrant WD-40 200ml',         'wd40-200ml',             'auto-chemicals','wd-40',    28000, 500],
    ['Battery Terminal Protector Liqui Moly 150ml','liquimoly-bat-protect','auto-chemicals','liqui-moly',62000,180],
];

async function createCollection(token, name, slug, facetValueIds, parentId) {
    const input = {
        translations: [{ languageCode: 'en', name, slug, description: '' }],
        filters: facetValueIds.length ? [{
            code: 'facet-value-filter',
            arguments: [
                { name: 'facetValueIds', value: JSON.stringify(facetValueIds) },
                { name: 'containsAny', value: 'true' },
            ],
        }] : [],
    };
    if (parentId) input.parentId = parentId;
    const { data } = await gql(`
        mutation CreateCollection($input: CreateCollectionInput!) {
            createCollection(input: $input) { id }
        }`, { input }, token);
    console.log(`✔ Collection "${name}"`);
    return data.createCollection;
}

function detectPackaging(name) {
    if (name.includes('0.3L')) return '0-3l';
    if (name.includes('0.5L')) return '0-5l';
    if (name.includes('10L'))  return '10l';
    if (name.includes('1L'))   return '1l';
    if (name.includes('4L'))   return '4l';
    if (name.includes('5L'))   return '5l';
    return null;
}

// premium brands → OEM tier, mid → Premium, rest → Standard
const OEM_BRANDS      = new Set(['brembo', 'bilstein', 'skf', 'gates', 'continental', 'philips', 'osram', 'ngk', 'bosch', 'mann']);
const PREMIUM_BRANDS  = new Set(['motul', 'castrol', 'shell', 'mobil', 'total', 'kyb', 'sachs', 'monroe', 'trw', 'mahle', 'filtron', 'textar', 'ferodo', 'ate', 'dayco', 'denso', 'champion', 'liqui-moly', 'varta', 'exide']);

function detectQualityClass(brandCode) {
    if (OEM_BRANDS.has(brandCode))     return 'oem';
    if (PREMIUM_BRANDS.has(brandCode)) return 'premium';
    return 'standard';
}

async function main() {
    console.log(`\n── Seeding Vendure development database (${CATALOGUE.length} products) ──\n`);

    const token = await login();

    if (await isAlreadySeeded(token)) {
        console.log('Already seeded (≥190 products). To re-seed: drop and recreate the DB.\n');
        return;
    }

    await setupChannel(token);

    // ── Facets ──────────────────────────────────────────────────────────────
    const category = await createFacet(token, 'Category', 'category', [
        { name: 'Motor Oils',      code: 'motor-oils' },
        { name: 'Transmission',    code: 'transmission' },
        { name: 'Filters',         code: 'filters' },
        { name: 'Brake System',    code: 'brake-system' },
        { name: 'Spark Plugs',     code: 'spark-plugs' },
        { name: 'Batteries',       code: 'batteries' },
        { name: 'Suspension',      code: 'suspension' },
        { name: 'Spare Parts',     code: 'spare-parts' },
        { name: 'Auto Chemicals',  code: 'auto-chemicals' },
        { name: 'Accessories',     code: 'accessories' },
    ]);

    const brand = await createFacet(token, 'Brand', 'brand', [
        { name: 'Lukoil',       code: 'lukoil' },
        { name: 'Motul',        code: 'motul' },
        { name: 'Castrol',      code: 'castrol' },
        { name: 'Shell',        code: 'shell' },
        { name: 'Mobil',        code: 'mobil' },
        { name: 'Total',        code: 'total' },
        { name: 'Sintec',       code: 'sintec' },
        { name: 'Hi-Gear',      code: 'hi-gear' },
        { name: 'NGK',          code: 'ngk' },
        { name: 'Bosch',        code: 'bosch' },
        { name: 'Denso',        code: 'denso' },
        { name: 'Champion',     code: 'champion' },
        { name: 'Mann',         code: 'mann' },
        { name: 'Mahle',        code: 'mahle' },
        { name: 'Filtron',      code: 'filtron' },
        { name: 'Knecht',       code: 'knecht' },
        { name: 'Brembo',       code: 'brembo' },
        { name: 'TRW',          code: 'trw' },
        { name: 'Textar',       code: 'textar' },
        { name: 'Ferodo',       code: 'ferodo' },
        { name: 'ATE',          code: 'ate' },
        { name: 'Mintex',       code: 'mintex' },
        { name: 'Varta',        code: 'varta' },
        { name: 'Exide',        code: 'exide' },
        { name: 'Sachs',        code: 'sachs' },
        { name: 'KYB',          code: 'kyb' },
        { name: 'Monroe',       code: 'monroe' },
        { name: 'Bilstein',     code: 'bilstein' },
        { name: 'SKF',          code: 'skf' },
        { name: 'Gates',        code: 'gates' },
        { name: 'Continental',  code: 'continental' },
        { name: 'Dayco',        code: 'dayco' },
        { name: 'Philips',      code: 'philips' },
        { name: 'Osram',        code: 'osram' },
        { name: 'Liqui-Moly',   code: 'liqui-moly' },
        { name: 'WD-40',        code: 'wd-40' },
    ]);

    const qualityClass = await createFacet(token, 'Quality Class', 'quality-class', [
        { name: 'OEM',      code: 'oem' },
        { name: 'Premium',  code: 'premium' },
        { name: 'Standard', code: 'standard' },
    ]);

    const packaging = await createFacet(token, 'Packaging', 'packaging', [
        { name: '0.3L', code: '0-3l' },
        { name: '0.5L', code: '0-5l' },
        { name: '1L',   code: '1l' },
        { name: '4L',   code: '4l' },
        { name: '5L',   code: '5l' },
        { name: '10L',  code: '10l' },
    ]);

    const cat = Object.fromEntries(category.values.map(v => [v.code, v.id]));
    const br  = Object.fromEntries(brand.values.map(v => [v.code, v.id]));
    const qc  = Object.fromEntries(qualityClass.values.map(v => [v.code, v.id]));
    const pkg = Object.fromEntries(packaging.values.map(v => [v.code, v.id]));

    // ── Products ────────────────────────────────────────────────────────────
    let created = 0;
    for (const [name, slug, catCode, brandCode, price, stock] of CATALOGUE) {
        const facetValueIds = [cat[catCode]].filter(Boolean);
        if (brandCode && br[brandCode]) facetValueIds.push(br[brandCode]);

        const qcCode = detectQualityClass(brandCode);
        if (qc[qcCode]) facetValueIds.push(qc[qcCode]);

        const pkgCode = detectPackaging(name);
        if (pkgCode && pkg[pkgCode]) facetValueIds.push(pkg[pkgCode]);

        const sku = slug.toUpperCase().replace(/-/g, '_').slice(0, 40);
        await createProduct(token, { name, slug, facetValueIds, sku, price, stock });
        created++;
        if (created % 20 === 0) console.log(`  … ${created}/${CATALOGUE.length} products`);
    }
    console.log(`✔ Created ${created} products`);

    // ── Collections ─────────────────────────────────────────────────────────
    console.log('\nCreating collections…');
    const lubricants = await createCollection(token, 'Lubricants', 'lubricants', [cat['motor-oils'], cat['transmission']]);
    await createCollection(token, 'Motor Oils',           'motor-oils',           [cat['motor-oils']],     lubricants.id);
    await createCollection(token, 'Transmission Fluids',  'transmission-fluids',  [cat['transmission']],   lubricants.id);

    const filters = await createCollection(token, 'Filters', 'filters', [cat['filters']]);
    await createCollection(token, 'Oil Filters',    'oil-filters',    [cat['filters'], br['mann'], br['bosch'], br['mahle'], br['knecht'], br['filtron']], filters.id);
    await createCollection(token, 'Air Filters',    'air-filters',    [cat['filters'], br['mann'], br['bosch'], br['filtron'], br['mahle']], filters.id);
    await createCollection(token, 'Cabin Filters',  'cabin-filters',  [cat['filters'], br['mann'], br['bosch'], br['filtron'], br['mahle'], br['knecht']], filters.id);

    const brakeSystem = await createCollection(token, 'Brake System', 'brake-system', [cat['brake-system']]);
    await createCollection(token, 'Brake Pads',  'brake-pads',  [cat['brake-system'], br['brembo'], br['bosch'], br['trw'], br['textar'], br['ferodo'], br['ate'], br['mintex']], brakeSystem.id);
    await createCollection(token, 'Brake Discs', 'brake-discs', [cat['brake-system'], br['brembo'], br['bosch'], br['trw'], br['textar'], br['ate']], brakeSystem.id);

    await createCollection(token, 'Spark Plugs',   'spark-plugs',   [cat['spark-plugs']]);
    await createCollection(token, 'Batteries',     'batteries',     [cat['batteries']]);
    const suspension = await createCollection(token, 'Suspension', 'suspension', [cat['suspension']]);
    await createCollection(token, 'Shock Absorbers', 'shock-absorbers', [cat['suspension'], br['sachs'], br['kyb'], br['monroe'], br['bilstein']], suspension.id);
    await createCollection(token, 'Bearings & Joints', 'bearings-joints', [cat['suspension'], br['skf'], br['trw']], suspension.id);

    await createCollection(token, 'Belts & Drives',  'belts-drives',  [cat['spare-parts']]);
    await createCollection(token, 'Auto Chemicals',  'auto-chemicals', [cat['auto-chemicals']]);
    await createCollection(token, 'Accessories',     'accessories',    [cat['accessories']]);

    // ── Customers ────────────────────────────────────────────────────────────
    await createCustomer(token, 'Ivan',   'Petrov',   'ivan@autoservice-nord.example', '+79131234567');
    await createCustomer(token, 'Sergey', 'Kovalev',  'sergey@parts-retail.example',   '+79139876543');
    await createCustomer(token, 'Anna',   'Sorokina',  'anna@garazh24.example',          '+79135551122');

    console.log(`\n── Seed complete: ${CATALOGUE.length} products, 3 customers, ${16} collections ──\n`);
}

main().catch(err => {
    console.error('\nSeed failed:', err.message);
    process.exit(1);
});
