export interface CurrencyMeta {
  code: string;
  label: string;
  symbol: string;
}

// A curated list rather than the full ISO 4217 set — covers the currencies people
// on this app are actually likely to use. The backend's exchange-rate lookup
// (open.er-api.com) supports ~160 currencies, so entering a code not in this list
// via the API directly would still work; this is just what the dropdown offers.
export const CURRENCIES: CurrencyMeta[] = [
  { code: 'EUR', label: 'Euro', symbol: '€' },
  { code: 'USD', label: 'US Dollar', symbol: '$' },
  { code: 'GBP', label: 'British Pound', symbol: '£' },
  { code: 'MKD', label: 'Macedonian Denar', symbol: 'ден' },
  { code: 'CHF', label: 'Swiss Franc', symbol: 'CHF' },
  { code: 'RSD', label: 'Serbian Dinar', symbol: 'дин.' },
  { code: 'ALL', label: 'Albanian Lek', symbol: 'L' },
  { code: 'BGN', label: 'Bulgarian Lev', symbol: 'лв' },
  { code: 'RON', label: 'Romanian Leu', symbol: 'lei' },
  { code: 'TRY', label: 'Turkish Lira', symbol: '₺' },
  { code: 'CZK', label: 'Czech Koruna', symbol: 'Kč' },
  { code: 'PLN', label: 'Polish Złoty', symbol: 'zł' },
  { code: 'HUF', label: 'Hungarian Forint', symbol: 'Ft' },
  { code: 'SEK', label: 'Swedish Krona', symbol: 'kr' },
  { code: 'NOK', label: 'Norwegian Krone', symbol: 'kr' },
  { code: 'DKK', label: 'Danish Krone', symbol: 'kr' },
  { code: 'CAD', label: 'Canadian Dollar', symbol: '$' },
  { code: 'AUD', label: 'Australian Dollar', symbol: '$' },
  { code: 'JPY', label: 'Japanese Yen', symbol: '¥' },
  { code: 'CNY', label: 'Chinese Yuan', symbol: '¥' },
  { code: 'INR', label: 'Indian Rupee', symbol: '₹' },
  { code: 'AED', label: 'UAE Dirham', symbol: 'د.إ' },
];

export function getCurrencyMeta(code: string): CurrencyMeta {
  return CURRENCIES.find((c) => c.code === code) ?? { code, label: code, symbol: code };
}
