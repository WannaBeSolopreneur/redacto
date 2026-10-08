import type { EntityType } from '../core/types';

export interface NerModel {
  id: string;
  name: string;
  description: string;
  dtype: 'q8' | 'q4' | 'fp32';
  /** ONNX file under onnx/, as fetched by scripts/setup-assets.mjs. */
  file: string;
  sizeMB: number;
  /** Model label (B-/I- prefix stripped) → app entity type; unmapped labels are ignored. */
  labels: Record<string, EntityType>;
}

const ID = 'ID_NUMBER' as const;

/** All OpenMed PII models share the Nemotron-PII label set (54 types). */
const OPENMED_LABELS: Record<string, EntityType> = {
  first_name: 'PERSON',
  last_name: 'PERSON',
  company_name: 'ORG',
  city: 'LOCATION',
  county: 'LOCATION',
  state: 'LOCATION',
  country: 'LOCATION',
  coordinate: 'LOCATION',
  street_address: 'ADDRESS',
  email: 'EMAIL',
  phone_number: 'PHONE',
  fax_number: 'PHONE',
  ssn: 'SSN',
  credit_debit_card: 'CREDIT_CARD',
  ipv4: 'IP_ADDRESS',
  ipv6: 'IP_ADDRESS',
  url: 'URL',
  date: 'DATE',
  date_of_birth: 'DATE',
  date_time: 'DATE',
  time: 'DATE',
  postcode: 'ZIP',
  medical_record_number: ID,
  health_plan_beneficiary_number: ID,
  account_number: ID,
  bank_routing_number: ID,
  swift_bic: ID,
  customer_id: ID,
  employee_id: ID,
  certificate_license_number: ID,
  tax_id: ID,
  unique_id: ID,
  vehicle_identifier: ID,
  license_plate: ID,
  device_identifier: ID,
  biometric_identifier: ID,
  user_name: ID,
  password: ID,
  pin: ID,
  api_key: ID,
  cvv: ID,
  mac_address: ID,
  http_cookie: ID,
  // Quasi-identifiers and special-category data (GDPR art. 9).
  age: 'SENSITIVE',
  gender: 'SENSITIVE',
  race_ethnicity: 'SENSITIVE',
  religious_belief: 'SENSITIVE',
  sexuality: 'SENSITIVE',
  political_view: 'SENSITIVE',
  blood_type: 'SENSITIVE',
  occupation: 'SENSITIVE',
  employment_status: 'SENSITIVE',
  education_level: 'SENSITIVE',
  language: 'SENSITIVE',
};

/**
 * OpenMed models are built locally by scripts/convert_models.py: graph fused
 * offline + int8 quantized (embeddings included), verified against fp32 on
 * Nemotron-PII (400 held-out docs, exact span): 355M F1 0.950 / recall 0.95, 125M F1 0.934 / recall 0.94,
 * 66M F1 0.939 / recall 0.92. Descriptions are shown to people, so they stay in plain words.
 */
export const MODELS: NerModel[] = [
  {
    id: 'OpenMed/OpenMed-PII-SuperMedical-Large-355M-v1',
    name: 'Best · OpenMed 355M',
    description: 'Catches the most. The largest download and the slowest.',
    dtype: 'q8',
    file: 'onnx/model_quantized.onnx',
    sizeMB: 357,
    labels: OPENMED_LABELS,
  },
  {
    id: 'OpenMed/OpenMed-PII-SuperMedical-Base-125M-v1',
    name: 'Accurate · OpenMed 125M',
    description: 'Nearly as thorough at a third of the size. A good default.',
    dtype: 'q8',
    file: 'onnx/model_quantized.onnx',
    sizeMB: 125,
    labels: OPENMED_LABELS,
  },
  {
    id: 'OpenMed/OpenMed-PII-LiteClinical-Small-66M-v1',
    name: 'Fast · OpenMed 66M',
    description: 'Quick and light. The best choice on phones.',
    dtype: 'q8',
    file: 'onnx/model_quantized.onnx',
    sizeMB: 67,
    labels: OPENMED_LABELS,
  },
  {
    id: 'Xenova/bert-base-NER',
    name: 'Basic · BERT NER',
    description: 'Names, places and organisations only.',
    dtype: 'q8',
    file: 'onnx/model_quantized.onnx',
    sizeMB: 104,
    labels: { PER: 'PERSON', ORG: 'ORG', LOC: 'LOCATION' },
  },
];

/**
 * Firefox runs onnxruntime-web's wasm kernels ~10x slower than Chromium/WebKit
 * (scripts/browser-bench.mjs: ~3 s vs ~0.27 s per doc for the 125M model; Mozilla
 * describes the same gap). There, default to the 66M model; it's still selectable.
 */
const SLOW_WASM = typeof navigator !== 'undefined' && /firefox/i.test(navigator.userAgent);

/**
 * Phones and tablets. iOS kills a tab that uses too much memory ("A problem repeatedly occurred"), and loading
 * the 125M model needs several hundred MB. Phones default to the 66M model (about 40% less) on one thread.
 * iPadOS reports itself as a Mac, so touch support is the tell.
 */
export const IS_PHONE =
  typeof navigator !== 'undefined' &&
  (/iPhone|iPad|iPod|Android/i.test(navigator.userAgent) || (/Macintosh/.test(navigator.userAgent) && (navigator.maxTouchPoints ?? 0) > 1));

export const DEFAULT_MODEL = SLOW_WASM || IS_PHONE ? MODELS[2].id : MODELS[1].id;
/** Used automatically if the selected model fails to load. */
export const FALLBACK_MODEL = MODELS[2].id;
/** The model's page on Hugging Face (what it was trained on, how it was measured, its licence). */
export const modelCard = (m: NerModel) => `https://huggingface.co/${m.id}`;
export const getModel = (id: string) => MODELS.find((m) => m.id === id) ?? MODELS[1];
