import type { Location } from "./types";

// ISO 3166-1 alpha-2 codes; display names come from Intl.DisplayNames.
const COUNTRY_CODES =
  "AF AL DZ AD AO AG AR AM AU AT AZ BS BH BD BB BY BE BZ BJ BT BO BA BW BR BN BG BF BI CV KH CM CA CF TD CL CN CO KM CG CD CR CI HR CU CY CZ DK DJ DM DO EC EG SV GQ ER EE SZ ET FJ FI FR GA GM GE DE GH GR GD GT GN GW GY HT HN HK HU IS IN ID IR IQ IE IL IT JM JP JO KZ KE KI KW KG LA LV LB LS LR LY LI LT LU MO MG MW MY MV ML MT MH MR MU MX FM MD MC MN ME MA MZ MM NA NR NP NL NZ NI NE NG KP MK NO OM PK PW PS PA PG PY PE PH PL PT PR QA RO RU RW KN LC VC WS SM ST SA SN RS SC SL SG SK SI SB SO ZA KR SS ES LK SD SR SE CH SY TW TJ TZ TH TL TG TO TT TN TR TM TV UG UA AE GB US UY UZ VU VA VE VN YE ZM ZW".split(" ");

// Curated sub-national places: [countryCode, region, city?]
const PLACES: [string, string, string?][] = [
  ["US", "California"], ["US", "California", "San Francisco"], ["US", "California", "Los Angeles"], ["US", "Texas"],
  ["US", "Texas", "Austin"], ["US", "Texas", "Houston"], ["US", "New York"], ["US", "New York", "New York City"],
  ["US", "Florida"], ["US", "Florida", "Miami"], ["US", "Illinois", "Chicago"], ["US", "Washington", "Seattle"],
  ["US", "Massachusetts", "Boston"], ["US", "Georgia", "Atlanta"], ["US", "Colorado", "Denver"],
  ["PK", "Punjab"], ["PK", "Punjab", "Lahore"], ["PK", "Punjab", "Faisalabad"], ["PK", "Punjab", "Rawalpindi"],
  ["PK", "Sindh"], ["PK", "Sindh", "Karachi"], ["PK", "Islamabad Capital Territory", "Islamabad"],
  ["PK", "Khyber Pakhtunkhwa"], ["PK", "Khyber Pakhtunkhwa", "Peshawar"],
  ["IN", "Maharashtra"], ["IN", "Maharashtra", "Mumbai"], ["IN", "Maharashtra", "Pune"], ["IN", "Karnataka", "Bengaluru"],
  ["IN", "Delhi", "New Delhi"], ["IN", "Tamil Nadu", "Chennai"], ["IN", "Telangana", "Hyderabad"],
  ["DE", "Berlin", "Berlin"], ["DE", "Bavaria"], ["DE", "Bavaria", "Munich"], ["DE", "Hamburg", "Hamburg"],
  ["DE", "North Rhine-Westphalia"], ["DE", "North Rhine-Westphalia", "Cologne"], ["DE", "Hesse", "Frankfurt"],
  ["GB", "England"], ["GB", "England", "London"], ["GB", "England", "Manchester"], ["GB", "Scotland"],
  ["GB", "Scotland", "Edinburgh"], ["FR", "Île-de-France", "Paris"], ["FR", "Auvergne-Rhône-Alpes", "Lyon"],
  ["ES", "Community of Madrid", "Madrid"], ["ES", "Catalonia", "Barcelona"], ["IT", "Lombardy", "Milan"], ["IT", "Lazio", "Rome"],
  ["NL", "North Holland", "Amsterdam"], ["SE", "Stockholm County", "Stockholm"], ["PL", "Masovian", "Warsaw"],
  ["CA", "Ontario"], ["CA", "Ontario", "Toronto"], ["CA", "British Columbia", "Vancouver"], ["CA", "Quebec", "Montreal"],
  ["AU", "New South Wales", "Sydney"], ["AU", "Victoria", "Melbourne"], ["NZ", "Auckland", "Auckland"],
  ["AE", "Dubai", "Dubai"], ["AE", "Abu Dhabi", "Abu Dhabi"], ["SA", "Riyadh Province", "Riyadh"], ["QA", "Doha", "Doha"],
  ["NG", "Lagos", "Lagos"], ["NG", "Federal Capital Territory", "Abuja"], ["KE", "Nairobi County", "Nairobi"],
  ["ZA", "Gauteng", "Johannesburg"], ["ZA", "Western Cape", "Cape Town"], ["EG", "Cairo Governorate", "Cairo"],
  ["GH", "Greater Accra", "Accra"], ["MA", "Casablanca-Settat", "Casablanca"],
  ["BR", "São Paulo"], ["BR", "São Paulo", "São Paulo"], ["BR", "Rio de Janeiro", "Rio de Janeiro"],
  ["MX", "Mexico City", "Mexico City"], ["AR", "Buenos Aires", "Buenos Aires"], ["CO", "Bogotá", "Bogotá"],
  ["CL", "Santiago Metropolitan", "Santiago"], ["PE", "Lima", "Lima"],
  ["CN", "Guangdong", "Shenzhen"], ["CN", "Shanghai", "Shanghai"], ["CN", "Beijing", "Beijing"],
  ["JP", "Tokyo", "Tokyo"], ["JP", "Osaka", "Osaka"], ["KR", "Seoul", "Seoul"], ["SG", "Singapore", "Singapore"],
  ["ID", "Jakarta", "Jakarta"], ["MY", "Kuala Lumpur", "Kuala Lumpur"], ["TH", "Bangkok", "Bangkok"],
  ["VN", "Ho Chi Minh City", "Ho Chi Minh City"], ["PH", "Metro Manila", "Manila"], ["BD", "Dhaka Division", "Dhaka"],
  ["TR", "Istanbul", "Istanbul"], ["IL", "Tel Aviv District", "Tel Aviv"], ["IE", "Leinster", "Dublin"],
  ["PT", "Lisbon", "Lisbon"], ["CH", "Zurich", "Zurich"], ["AT", "Vienna", "Vienna"], ["DK", "Capital Region", "Copenhagen"],
  ["FI", "Uusimaa", "Helsinki"], ["NO", "Oslo", "Oslo"], ["BE", "Brussels-Capital", "Brussels"],
];

export interface LocationOption extends Location {
  key: string;
  search: string;
  detail: string;
}

let cache: LocationOption[] | null = null;

export function allLocations(): LocationOption[] {
  if (cache) return cache;
  let names: Intl.DisplayNames | null = null;
  try {
    names = new Intl.DisplayNames(["en"], { type: "region" });
  } catch {
    names = null;
  }
  const countryName = (cc: string) => names?.of(cc) ?? cc;
  const out: LocationOption[] = [
    { key: "global", level: "global", label: "Global", search: "global worldwide world", detail: "Anywhere in the world" },
  ];
  const countries = COUNTRY_CODES.map((cc) => ({ cc, name: countryName(cc) })).sort((a, b) => a.name.localeCompare(b.name));
  for (const { cc, name } of countries) {
    out.push({ key: `c:${cc}`, level: "country", label: name, country: name, country_code: cc,
      search: `${name} ${cc}`.toLowerCase(), detail: "Country" });
  }
  for (const [cc, region, city] of PLACES) {
    const country = countryName(cc);
    if (city) {
      const label = `${city}, ${country}`;
      out.push({ key: `t:${cc}:${region}:${city}`, level: "city", label, city, region, country, country_code: cc,
        search: `${city} ${region} ${country}`.toLowerCase(), detail: `City · ${region}` });
    } else {
      const label = `${region}, ${country}`;
      out.push({ key: `r:${cc}:${region}`, level: "region", label, region, country, country_code: cc,
        search: `${region} ${country}`.toLowerCase(), detail: "State / province" });
    }
  }
  cache = out;
  return out;
}

export function searchLocations(q: string, limit = 40): LocationOption[] {
  const all = allLocations();
  const query = q.trim().toLowerCase();
  if (!query) {
    const popular = ["global", "c:US", "c:PK", "c:DE", "c:IN", "c:GB", "t:PK:Punjab:Lahore", "t:DE:Berlin:Berlin", "r:US:California"];
    return popular.map((k) => all.find((l) => l.key === k)!).filter(Boolean);
  }
  const starts: LocationOption[] = [];
  const contains: LocationOption[] = [];
  for (const l of all) {
    if (l.label.toLowerCase().startsWith(query) || l.search.startsWith(query)) starts.push(l);
    else if (l.search.includes(query)) contains.push(l);
  }
  return [...starts, ...contains].slice(0, limit);
}

export function toLocation(o: LocationOption): Location {
  return { level: o.level, label: o.label, country: o.country, country_code: o.country_code, region: o.region, city: o.city };
}

export const GLOBAL: Location = { level: "global", label: "Global" };

export const LEVEL_LABEL: Record<string, string> = {
  global: "Global",
  country: "Country-level",
  region: "Regional",
  city: "City-level",
};
