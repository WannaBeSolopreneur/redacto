import type { Entity, EntityType } from './types';

interface Rule {
  type: EntityType;
  re: RegExp;
  score: number;
  /** Return false to reject a match (e.g. checksum failure). */
  validate?: (m: string) => boolean;
  /** Capture group to use as the entity instead of the whole match. */
  group?: number;
}

function luhn(s: string): boolean {
  const digits = s.replace(/\D/g, '');
  if (digits.length < 13 || digits.length > 19) return false;
  let sum = 0;
  for (let i = 0; i < digits.length; i++) {
    let d = Number(digits[digits.length - 1 - i]);
    if (i % 2 === 1) {
      d *= 2;
      if (d > 9) d -= 9;
    }
    sum += d;
  }
  return sum % 10 === 0;
}

function ibanValid(s: string): boolean {
  const iban = s.replace(/\s/g, '').toUpperCase();
  if (iban.length < 15 || iban.length > 34) return false;
  const rearranged = iban.slice(4) + iban.slice(0, 4);
  let rem = 0;
  for (const ch of rearranged) {
    const v = ch >= 'A' && ch <= 'Z' ? String(ch.charCodeAt(0) - 55) : ch;
    for (const d of v) rem = (rem * 10 + Number(d)) % 97;
  }
  return rem === 1;
}

function ssnValid(s: string): boolean {
  const d = s.replace(/\D/g, '');
  const area = d.slice(0, 3);
  return area !== '000' && area !== '666' && area[0] !== '9' && d.slice(3, 5) !== '00' && d.slice(5) !== '0000';
}

const MONTHS = 'Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|June?|July?|Aug(?:ust)?|Sep(?:t(?:ember)?)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?';
const STREET_SUFFIX =
  'Street|St|Avenue|Ave|Road|Rd|Boulevard|Blvd|Lane|Ln|Drive|Dr|Court|Ct|Place|Pl|Way|Terrace|Ter|Parkway|Pkwy|Circle|Cir|Highway|Hwy|Square|Sq|Trail|Trl';

const RULES: Rule[] = [
  { type: 'EMAIL', re: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g, score: 0.99 },
  { type: 'URL', re: /\b(?:https?:\/\/|www\.)[^\s<>"')\]]+/gi, score: 0.95 },
  { type: 'SSN', re: /\b\d{3}[- ]\d{2}[- ]\d{4}\b/g, score: 0.95, validate: ssnValid },
  {
    type: 'CREDIT_CARD',
    re: /\b(?:\d[ -]?){12,18}\d\b/g,
    score: 0.95,
    validate: luhn,
  },
  { type: 'IBAN', re: /\b[A-Z]{2}\d{2}(?: ?[A-Z0-9]{4}){2,7}(?: ?[A-Z0-9]{1,4})?\b/g, score: 0.95, validate: ibanValid },
  {
    type: 'IP_ADDRESS',
    re: /\b(?:(?:25[0-5]|2[0-4]\d|1?\d?\d)\.){3}(?:25[0-5]|2[0-4]\d|1?\d?\d)\b/g,
    score: 0.9,
  },
  { type: 'IP_ADDRESS', re: /\b(?:[0-9a-fA-F]{1,4}:){7}[0-9a-fA-F]{1,4}\b/g, score: 0.9 },
  {
    type: 'PHONE',
    re: /(?:\+\d{1,3}[\s.-]?)?(?:\(\d{3}\)\s?|\b\d{3}[\s.-])\d{3}[\s.-]\d{4}\b/g,
    score: 0.9,
  },
  { type: 'PHONE', re: /\+\d{1,3}(?:[\s.-]?\d{2,4}){2,5}\b/g, score: 0.8 },
  {
    type: 'DATE',
    re: /\b(?:\d{1,2}[/.-]\d{1,2}[/.-](?:\d{4}|\d{2})|\d{4}-\d{2}-\d{2})\b/g,
    score: 0.85,
  },
  {
    type: 'DATE',
    re: new RegExp(`\\b(?:(?:${MONTHS})\\.?\\s+\\d{1,2}(?:st|nd|rd|th)?\\s*,?\\s*\\d{4}|\\d{1,2}(?:st|nd|rd|th)?\\s+(?:${MONTHS})\\.?,?\\s+\\d{4})\\b`, 'gi'),
    score: 0.9,
  },
  {
    type: 'ADDRESS',
    re: new RegExp(`\\b\\d{1,6}\\s+(?:[NSEW]\\.?\\s+)?(?:[A-Z][A-Za-z0-9'-]*\\s+){1,4}(?:${STREET_SUFFIX}|${STREET_SUFFIX.toUpperCase()})\\b\\.?(?:,?\\s+(?:Apt|Suite|Ste|Unit|#)\\.?\\s*[A-Za-z0-9-]+)?`, 'g'),
    score: 0.85,
  },
  { type: 'ADDRESS', re: /\bP\.?\s?O\.?\s+Box\s+\d+\b/gi, score: 0.85 },
  { type: 'ZIP', re: /\b[A-Z]{2}\s+(\d{5}(?:-\d{4})?)\b/g, score: 0.85, group: 1 },
  {
    type: 'ID_NUMBER',
    re: /\b(?:MRN|Medical Record(?: Number| No\.?)?|Patient ID|Account(?: Number| No\.?| #)?|Acct\.?(?: #)?|Policy(?: Number| No\.?)?|(?:Insurance |Health Plan )?Member(?: ID| Number| No\.?| #)|Insurance(?: ID| Number| No\.?)|License(?: Number| No\.?)?|Passport(?: Number| No\.?)?|Employee ID|DOB|(?:Web|PPD|CCD|ACH|Customer|Client|Transaction|Trans|Reference|Ref|Confirmation|Conf|Trace|Case|Claim|Order|Invoice)\.?\s*(?:ID|#|No\.?|Number))\s*[:#]?\s*([A-Z0-9][A-Z0-9-]{3,})/gi,
    score: 0.85,
    group: 1,
    // The label match is case-insensitive, so require a digit: "Account settings" is not an ID.
    validate: (m) => /\d/.test(m),
  },
];

export function detectRules(text: string): Entity[] {
  const out: Entity[] = [];
  for (const rule of RULES) {
    rule.re.lastIndex = 0;
    for (const m of text.matchAll(rule.re)) {
      let value = m[0];
      let start = m.index;
      if (rule.group !== undefined) {
        const g = m[rule.group];
        if (!g) continue;
        start = m.index + m[0].lastIndexOf(g);
        value = g;
      }
      // Trim trailing punctuation that URLs and addresses tend to swallow.
      const trimmed = value.replace(/[.,;:]+$/, '');
      if (rule.validate && !rule.validate(trimmed)) continue;
      out.push({ start, end: start + trimmed.length, type: rule.type, text: trimmed, source: 'rule', score: rule.score });
    }
  }
  return out;
}

function escapeRe(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Entities for user-supplied always-redact terms. */
export function detectDenyList(text: string, terms: string[]): Entity[] {
  const out: Entity[] = [];
  for (const term of terms.map((t) => t.trim()).filter(Boolean)) {
    // Unicode-aware word edges, as in occurrences(): "Jos" must not match inside "José".
    const re = new RegExp(`(?<![\\p{L}\\p{N}_])${escapeRe(term)}(?![\\p{L}\\p{N}_])`, 'giu');
    for (const m of text.matchAll(re)) {
      out.push({ start: m.index, end: m.index + m[0].length, type: 'CUSTOM', text: m[0], source: 'manual', score: 1 });
    }
  }
  return out;
}
