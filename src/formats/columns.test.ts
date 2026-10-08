import { describe, expect, it } from 'vitest';
import { classifyColumn } from './columns';

describe('classifyColumn', () => {
  it.each([
    ['Top Contact First Name', 'PERSON'],
    ['Top Contact Last Name', 'PERSON'],
    ['﻿Name', 'PERSON'],
    ['surname', 'PERSON'],
    ['Patient Name', 'PERSON'],
    ['Top Email', 'EMAIL'],
    ['Email Address', 'EMAIL'],
    ['Mobile Phone', 'PHONE'],
    ['DOB', 'DATE'],
    ['Street Address', 'ADDRESS'],
    ['ZIP', 'ZIP'],
    ['Location', 'LOCATION'],
    ['MRN', 'ID_NUMBER'],
    ['Username', 'ID_NUMBER'],
    ['Top Contact LinkedIn', 'URL'],
    ['Company Name', 'ORG'],
    ['Company', 'ORG'],
    ['Website', 'ORG'],
    ['Company Website', 'ORG'],
    ['firstName', 'PERSON'],
    ['phone_number', 'PHONE'],
    ['employee_id', 'ID_NUMBER'],
    ['Bank Account', 'ID_NUMBER'],
    ['Credit Card Number', 'CREDIT_CARD'],
    ['IBAN', 'IBAN'],
    ['API Key', 'ID_NUMBER'],
  ])('%s -> %s', (h, t) => expect(classifyColumn(h)).toBe(t));

  it.each(['Size', 'Industry', 'Top Contact Position', 'Notes', 'Amount', 'Company Size'])(
    '%s is not auto-redacted',
    (h) => expect(classifyColumn(h)).toBeNull(),
  );
});
