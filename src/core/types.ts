import { DEFAULT_MODEL } from '../ml/models';

export const ENTITY_TYPES = [
  'PERSON',
  'ORG',
  'LOCATION',
  'ADDRESS',
  'EMAIL',
  'PHONE',
  'SSN',
  'CREDIT_CARD',
  'IBAN',
  'IP_ADDRESS',
  'URL',
  'DATE',
  'ZIP',
  'ID_NUMBER',
  'SENSITIVE',
  'CUSTOM',
] as const;

export type EntityType = (typeof ENTITY_TYPES)[number];

export const ENTITY_LABELS: Record<EntityType, string> = {
  PERSON: 'Names',
  ORG: 'Organizations',
  LOCATION: 'Locations',
  ADDRESS: 'Street addresses',
  EMAIL: 'Emails',
  PHONE: 'Phone numbers',
  SSN: 'SSNs',
  CREDIT_CARD: 'Credit cards',
  IBAN: 'IBANs',
  IP_ADDRESS: 'IP addresses',
  URL: 'URLs',
  DATE: 'Dates',
  ZIP: 'ZIP codes',
  ID_NUMBER: 'ID / account / MRN numbers',
  SENSITIVE: 'Sensitive attributes',
  CUSTOM: 'Custom terms',
};

export interface Entity {
  start: number;
  end: number;
  type: EntityType;
  text: string;
  source: 'rule' | 'ml' | 'manual';
  score: number;
}

export type Mode = 'redact' | 'label' | 'pseudonymize';

export interface Settings {
  enabled: Record<EntityType, boolean>;
  mode: Mode;
  useML: boolean;
  /** NER model id, see src/ml/models.ts. */
  model: string;
  /** The user picked the model in Settings (otherwise the device's default applies). */
  modelChosen?: boolean;
  minScore: number;
  /** Terms that are always redacted (case-insensitive, whole word). */
  denyList: string[];
  /** Terms that are never redacted. */
  allowList: string[];
  /** OCR every PDF page, not just pages without a text layer. */
  forceOcr: boolean;
}

export function defaultSettings(): Settings {
  const enabled = Object.fromEntries(ENTITY_TYPES.map((t) => [t, true])) as Record<EntityType, boolean>;
  enabled.ORG = false;
  return {
    enabled,
    mode: 'label',
    useML: true,
    model: DEFAULT_MODEL,
    // Scores are per-type probabilities (src/ml/ner.worker.ts); 0.5 lost no precision on held-out docs.
    minScore: 0.5,
    denyList: [],
    allowList: [],
    forceOcr: false,
  };
}
