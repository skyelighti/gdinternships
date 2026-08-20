// Filters by language region, not strictly "US" — the point is whether the
// user could actually work there, and they speak English and mainland
// Chinese. So: English-speaking countries (US, UK, Canada, Australia,
// Ireland, Singapore) and mainland China are allowed; Taiwan and Hong Kong
// are explicitly excluded (per user preference, despite also being
// Chinese-speaking), and everywhere else (Japan, Korea, continental Europe,
// etc.) is excluded too — unless manually overridden in
// data/location-exceptions.json.
//
// Known limitation: script-based detection (HAN_RE below) can't distinguish
// Simplified Chinese (mainland) from Traditional Chinese (Taiwan/HK) text —
// a job title written only in Chinese script with no English location text
// will be classified "zh" (allowed) even if it's actually Taiwan/HK. The
// location-text keyword check does correctly exclude explicit "Taiwan"/"Hong
// Kong"/"Taipei" mentions.
const HIRAGANA_KATAKANA_RE = /[ぁ-んァ-ヶー]/; // Japanese-specific scripts
const HANGUL_RE = /[가-힣]/; // Korean
const HAN_RE = /[一-鿿㐀-䶿]/; // Chinese/Japanese/Korean shared Han ideographs

const ALLOWED_LOCATION_RE =
  /\b(us|usa|united states|remote|california|washington|texas|new york|massachusetts|colorado|illinois|georgia|florida|north carolina|virginia|san francisco|seattle|austin|los angeles|boston|chicago|uk|united kingdom|london|canada|toronto|vancouver|montreal|australia|sydney|melbourne|ireland|dublin|singapore|china|shanghai|beijing|shenzhen|guangzhou|hangzhou|chengdu)\b/i;

const DISALLOWED_LOCATION_RE =
  /\b(japan|tokyo|osaka|korea|seoul|germany|berlin|munich|france|paris|belgium|brussels|spain|madrid|barcelona|poland|warsaw|netherlands|amsterdam|sweden|stockholm|finland|helsinki|italy|milan|vietnam|hanoi|thailand|bangkok|indonesia|jakarta|malaysia|kuala lumpur|brazil|mexico|india|bangalore|mumbai|russia|moscow|hong kong|taiwan|taipei)\b/i;

export function classifyRegion({ company, program, title, locationText }) {
  const scriptText = [title, program].filter(Boolean).join(" ");
  if (HIRAGANA_KATAKANA_RE.test(scriptText) || HANGUL_RE.test(scriptText)) return "international";
  if (HAN_RE.test(scriptText)) return "zh";

  if (locationText) {
    if (DISALLOWED_LOCATION_RE.test(locationText)) return "international";
    if (ALLOWED_LOCATION_RE.test(locationText)) {
      return /china|shanghai|beijing|shenzhen|guangzhou|hangzhou|chengdu/i.test(locationText) ? "zh" : "us";
    }
  }

  // No usable signal — default to allowed rather than wrongly hiding a real option.
  return "us";
}

export async function loadLocationExceptions(readFile, url) {
  try {
    return JSON.parse(await readFile(url, "utf8"));
  } catch {
    return [];
  }
}
