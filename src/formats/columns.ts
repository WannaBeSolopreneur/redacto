import type { EntityType } from '../core/types';

/**
 * Classify a spreadsheet column by its header. A column called "First Name" is
 * all names whatever the model makes of a lone "Jeff", so header matches give
 * every cell in the column a deterministic redaction. Order matters: the first
 * match wins ("Email Address" is an email, not an address).
 */
const COLUMN_RULES: Array<[RegExp, EntityType]> = [
  [/e-?mail/i, 'EMAIL'],
  [/\b(credit|debit)[\s-]*card\b/i, 'CREDIT_CARD'],
  [/\biban\b/i, 'IBAN'],
  [/\b(api[\s-]*key|password|passcode|routing[\s-]*number|bank[\s-]*account|account[\s-]*id)\b/i, 'ID_NUMBER'],
  [/\b(user ?name|login|handle)\b/i, 'ID_NUMBER'],
  [/\b(company|business|organi[sz]ation|employer|product|file|domain|brand)[\s_-]*name\b/i, 'ORG'],
  // A bare "Company" column, and the company's website, identify the organisation.
  // Typed ORG so they follow the Organizations toggle (off by default) together.
  [/^\s*(company|organi[sz]ation|employer|business|firm|vendor|supplier)\s*$/i, 'ORG'],
  [/^\s*(company[\s_-]*)?(website|web[\s_-]*site|homepage|domain)\s*$/i, 'ORG'],
  [/\b(first|last|middle|given|family|full|maiden|nick)[\s_-]*name\b|\b(sur|fore)name\b|^\s*name\s*$/i, 'PERSON'],
  [/\b(contact|patient|customer|client|employee|member|owner|person|guardian|spouse)[\s_-]*name\b/i, 'PERSON'],
  [/\b(phone|mobile|cell|fax|tel|telephone)\b/i, 'PHONE'],
  [/\b(dob|date[\s_-]*of[\s_-]*birth|birth[\s_-]*date|birthday)\b/i, 'DATE'],
  [/\b(ssn|social[\s_-]*security)\b/i, 'SSN'],
  [/\b(zip|postal[\s_-]*code|post[\s_-]*code|postcode)\b/i, 'ZIP'],
  [/\b(street|address|addr)\b/i, 'ADDRESS'],
  [/^\s*(city|town|county|location|home ?town)\s*$/i, 'LOCATION'],
  [/\b(mrn|medical[\s_-]*record|patient[\s_-]*id|member[\s_-]*id|account[\s_-]*(no|number|#)|passport|licen[cs]e[\s_-]*(no|number)|national[\s_-]*id|tax[\s_-]*id|employee[\s_-]*id)\b/i, 'ID_NUMBER'],
  [/\b(linked\s*in|twitter|facebook|instagram)\b/i, 'URL'],
];

export function classifyColumn(header: string): EntityType | null {
  const h = header.replace(/^﻿/, '').replace(/([a-z])([A-Z])/g, '$1 $2').replace(/_/g, ' ').trim();
  if (!h) return null;
  for (const [re, type] of COLUMN_RULES) if (re.test(h)) return type;
  return null;
}
