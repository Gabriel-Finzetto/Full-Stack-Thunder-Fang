/**
 * Address subdivisions from ISO 3166-2 data distributed by the pycountry maintainers
 * (their unmodified copy of Debian iso-codes). Retrieved 2026-10-27.
 * Source: https://github.com/pycountry/pycountry/blob/395b601858d44e410172c990bd132151bd145e5b/src/pycountry/databases/iso3166-2.json
 * Dataset policy: https://github.com/pycountry/pycountry#data-update-policy
 * Upstream license: LGPL-2.1-only; see public/licenses/regions-LGPL-2.1.txt.
 * US: all 50 states, District of Columbia, and six ISO outlying areas (57).
 * ES: all 50 provinces and two autonomous cities (52), without duplicating communities.
 * CN: all 34 province-level ISO subdivisions, including municipalities,
 * autonomous regions and special administrative regions. Names/codes follow the dataset.
 * These are address-selection labels; they do not define real shipping availability.
 */
export type InternationalRegion = { code: string; name: string };
export const internationalRegions: Record<'US' | 'ES' | 'CN', readonly InternationalRegion[]> = {
  "US": [
    {
      "code": "US-AL",
      "name": "Alabama"
    },
    {
      "code": "US-AK",
      "name": "Alaska"
    },
    {
      "code": "US-AS",
      "name": "American Samoa"
    },
    {
      "code": "US-AZ",
      "name": "Arizona"
    },
    {
      "code": "US-AR",
      "name": "Arkansas"
    },
    {
      "code": "US-CA",
      "name": "California"
    },
    {
      "code": "US-CO",
      "name": "Colorado"
    },
    {
      "code": "US-CT",
      "name": "Connecticut"
    },
    {
      "code": "US-DE",
      "name": "Delaware"
    },
    {
      "code": "US-DC",
      "name": "District of Columbia"
    },
    {
      "code": "US-FL",
      "name": "Florida"
    },
    {
      "code": "US-GA",
      "name": "Georgia"
    },
    {
      "code": "US-GU",
      "name": "Guam"
    },
    {
      "code": "US-HI",
      "name": "Hawaii"
    },
    {
      "code": "US-ID",
      "name": "Idaho"
    },
    {
      "code": "US-IL",
      "name": "Illinois"
    },
    {
      "code": "US-IN",
      "name": "Indiana"
    },
    {
      "code": "US-IA",
      "name": "Iowa"
    },
    {
      "code": "US-KS",
      "name": "Kansas"
    },
    {
      "code": "US-KY",
      "name": "Kentucky"
    },
    {
      "code": "US-LA",
      "name": "Louisiana"
    },
    {
      "code": "US-ME",
      "name": "Maine"
    },
    {
      "code": "US-MD",
      "name": "Maryland"
    },
    {
      "code": "US-MA",
      "name": "Massachusetts"
    },
    {
      "code": "US-MI",
      "name": "Michigan"
    },
    {
      "code": "US-MN",
      "name": "Minnesota"
    },
    {
      "code": "US-MS",
      "name": "Mississippi"
    },
    {
      "code": "US-MO",
      "name": "Missouri"
    },
    {
      "code": "US-MT",
      "name": "Montana"
    },
    {
      "code": "US-NE",
      "name": "Nebraska"
    },
    {
      "code": "US-NV",
      "name": "Nevada"
    },
    {
      "code": "US-NH",
      "name": "New Hampshire"
    },
    {
      "code": "US-NJ",
      "name": "New Jersey"
    },
    {
      "code": "US-NM",
      "name": "New Mexico"
    },
    {
      "code": "US-NY",
      "name": "New York"
    },
    {
      "code": "US-NC",
      "name": "North Carolina"
    },
    {
      "code": "US-ND",
      "name": "North Dakota"
    },
    {
      "code": "US-MP",
      "name": "Northern Mariana Islands"
    },
    {
      "code": "US-OH",
      "name": "Ohio"
    },
    {
      "code": "US-OK",
      "name": "Oklahoma"
    },
    {
      "code": "US-OR",
      "name": "Oregon"
    },
    {
      "code": "US-PA",
      "name": "Pennsylvania"
    },
    {
      "code": "US-PR",
      "name": "Puerto Rico"
    },
    {
      "code": "US-RI",
      "name": "Rhode Island"
    },
    {
      "code": "US-SC",
      "name": "South Carolina"
    },
    {
      "code": "US-SD",
      "name": "South Dakota"
    },
    {
      "code": "US-TN",
      "name": "Tennessee"
    },
    {
      "code": "US-TX",
      "name": "Texas"
    },
    {
      "code": "US-UM",
      "name": "United States Minor Outlying Islands"
    },
    {
      "code": "US-UT",
      "name": "Utah"
    },
    {
      "code": "US-VT",
      "name": "Vermont"
    },
    {
      "code": "US-VI",
      "name": "Virgin Islands, U.S."
    },
    {
      "code": "US-VA",
      "name": "Virginia"
    },
    {
      "code": "US-WA",
      "name": "Washington"
    },
    {
      "code": "US-WV",
      "name": "West Virginia"
    },
    {
      "code": "US-WI",
      "name": "Wisconsin"
    },
    {
      "code": "US-WY",
      "name": "Wyoming"
    }
  ],
  "ES": [
    {
      "code": "ES-C",
      "name": "A Coruña [La Coruña]"
    },
    {
      "code": "ES-AB",
      "name": "Albacete"
    },
    {
      "code": "ES-A",
      "name": "Alicante"
    },
    {
      "code": "ES-AL",
      "name": "Almería"
    },
    {
      "code": "ES-O",
      "name": "Asturias"
    },
    {
      "code": "ES-BA",
      "name": "Badajoz"
    },
    {
      "code": "ES-B",
      "name": "Barcelona [Barcelona]"
    },
    {
      "code": "ES-BI",
      "name": "Bizkaia"
    },
    {
      "code": "ES-BU",
      "name": "Burgos"
    },
    {
      "code": "ES-S",
      "name": "Cantabria"
    },
    {
      "code": "ES-CS",
      "name": "Castellón"
    },
    {
      "code": "ES-CE",
      "name": "Ceuta"
    },
    {
      "code": "ES-CR",
      "name": "Ciudad Real"
    },
    {
      "code": "ES-CU",
      "name": "Cuenca"
    },
    {
      "code": "ES-CC",
      "name": "Cáceres"
    },
    {
      "code": "ES-CA",
      "name": "Cádiz"
    },
    {
      "code": "ES-CO",
      "name": "Córdoba"
    },
    {
      "code": "ES-SS",
      "name": "Gipuzkoa"
    },
    {
      "code": "ES-GI",
      "name": "Girona [Gerona]"
    },
    {
      "code": "ES-GR",
      "name": "Granada"
    },
    {
      "code": "ES-GU",
      "name": "Guadalajara"
    },
    {
      "code": "ES-H",
      "name": "Huelva"
    },
    {
      "code": "ES-HU",
      "name": "Huesca"
    },
    {
      "code": "ES-PM",
      "name": "Illes Balears [Islas Baleares]"
    },
    {
      "code": "ES-J",
      "name": "Jaén"
    },
    {
      "code": "ES-LO",
      "name": "La Rioja"
    },
    {
      "code": "ES-GC",
      "name": "Las Palmas"
    },
    {
      "code": "ES-LE",
      "name": "León"
    },
    {
      "code": "ES-L",
      "name": "Lleida [Lérida]"
    },
    {
      "code": "ES-LU",
      "name": "Lugo [Lugo]"
    },
    {
      "code": "ES-M",
      "name": "Madrid"
    },
    {
      "code": "ES-ML",
      "name": "Melilla"
    },
    {
      "code": "ES-MU",
      "name": "Murcia"
    },
    {
      "code": "ES-MA",
      "name": "Málaga"
    },
    {
      "code": "ES-NA",
      "name": "Navarra"
    },
    {
      "code": "ES-OR",
      "name": "Ourense [Orense]"
    },
    {
      "code": "ES-P",
      "name": "Palencia"
    },
    {
      "code": "ES-PO",
      "name": "Pontevedra [Pontevedra]"
    },
    {
      "code": "ES-SA",
      "name": "Salamanca"
    },
    {
      "code": "ES-TF",
      "name": "Santa Cruz de Tenerife"
    },
    {
      "code": "ES-SG",
      "name": "Segovia"
    },
    {
      "code": "ES-SE",
      "name": "Sevilla"
    },
    {
      "code": "ES-SO",
      "name": "Soria"
    },
    {
      "code": "ES-T",
      "name": "Tarragona [Tarragona]"
    },
    {
      "code": "ES-TE",
      "name": "Teruel"
    },
    {
      "code": "ES-TO",
      "name": "Toledo"
    },
    {
      "code": "ES-V",
      "name": "Valencia"
    },
    {
      "code": "ES-VA",
      "name": "Valladolid"
    },
    {
      "code": "ES-ZA",
      "name": "Zamora"
    },
    {
      "code": "ES-Z",
      "name": "Zaragoza"
    },
    {
      "code": "ES-VI",
      "name": "Álava"
    },
    {
      "code": "ES-AV",
      "name": "Ávila"
    }
  ],
  "CN": [
    {
      "code": "CN-AH",
      "name": "Anhui Sheng"
    },
    {
      "code": "CN-BJ",
      "name": "Beijing Shi"
    },
    {
      "code": "CN-CQ",
      "name": "Chongqing Shi"
    },
    {
      "code": "CN-FJ",
      "name": "Fujian Sheng"
    },
    {
      "code": "CN-GS",
      "name": "Gansu Sheng"
    },
    {
      "code": "CN-GD",
      "name": "Guangdong Sheng"
    },
    {
      "code": "CN-GX",
      "name": "Guangxi Zhuangzu Zizhiqu"
    },
    {
      "code": "CN-GZ",
      "name": "Guizhou Sheng"
    },
    {
      "code": "CN-HI",
      "name": "Hainan Sheng"
    },
    {
      "code": "CN-HE",
      "name": "Hebei Sheng"
    },
    {
      "code": "CN-HL",
      "name": "Heilongjiang Sheng"
    },
    {
      "code": "CN-HA",
      "name": "Henan Sheng"
    },
    {
      "code": "CN-HK",
      "name": "Hong Kong SAR"
    },
    {
      "code": "CN-HB",
      "name": "Hubei Sheng"
    },
    {
      "code": "CN-HN",
      "name": "Hunan Sheng"
    },
    {
      "code": "CN-JS",
      "name": "Jiangsu Sheng"
    },
    {
      "code": "CN-JX",
      "name": "Jiangxi Sheng"
    },
    {
      "code": "CN-JL",
      "name": "Jilin Sheng"
    },
    {
      "code": "CN-LN",
      "name": "Liaoning Sheng"
    },
    {
      "code": "CN-MO",
      "name": "Macao SAR"
    },
    {
      "code": "CN-NM",
      "name": "Nei Mongol Zizhiqu"
    },
    {
      "code": "CN-NX",
      "name": "Ningxia Huizu Zizhiqu"
    },
    {
      "code": "CN-QH",
      "name": "Qinghai Sheng"
    },
    {
      "code": "CN-SN",
      "name": "Shaanxi Sheng"
    },
    {
      "code": "CN-SD",
      "name": "Shandong Sheng"
    },
    {
      "code": "CN-SH",
      "name": "Shanghai Shi"
    },
    {
      "code": "CN-SX",
      "name": "Shanxi Sheng"
    },
    {
      "code": "CN-SC",
      "name": "Sichuan Sheng"
    },
    {
      "code": "CN-TW",
      "name": "Taiwan Sheng"
    },
    {
      "code": "CN-TJ",
      "name": "Tianjin Shi"
    },
    {
      "code": "CN-XJ",
      "name": "Xinjiang Uygur Zizhiqu"
    },
    {
      "code": "CN-XZ",
      "name": "Xizang Zizhiqu"
    },
    {
      "code": "CN-YN",
      "name": "Yunnan Sheng"
    },
    {
      "code": "CN-ZJ",
      "name": "Zhejiang Sheng"
    }
  ]
};
