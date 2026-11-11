import assert from 'node:assert/strict';
import { expectedDocumentTypes } from '../supabase/functions/_shared/eligibility.ts';
import {
  assertProgramAvailable,
  offeredDocumentTypes,
  programAvailability,
} from '../supabase/functions/_shared/programs.ts';

let checked = 0;

// 1. Existing Ghawthani attendance combinations (8 combinations x 2 genders = 16 cases)
for (const attended_day_1 of [false, true]) {
  for (const attended_day_2 of [false, true]) {
    for (const attended_day_3 of [false, true]) {
      const count = Number(attended_day_1) + Number(attended_day_2) + Number(attended_day_3);
      for (const gender of ['male', 'female']) {
        const actual = expectedDocumentTypes({ gender, attended_day_1, attended_day_2, attended_day_3 });
        const expected =
          count === 0
            ? []
            : count < 3
              ? ['participation_certificate']
              : ['participation_certificate', gender === 'male' ? 'ijazah_male' : 'ijazah_female'];
        assert.deepEqual(actual, expected);
        checked += 1;
      }
    }
  }
}

// 2. Course document-type offerings: certificates only, ijazat only, and both
assert.deepEqual(
  offeredDocumentTypes({ offers_certificate: true, offers_ijazah: false }, 'male'),
  ['participation_certificate'],
  'Certificate-only course must only offer participation_certificate',
);

assert.deepEqual(
  offeredDocumentTypes({ offers_certificate: false, offers_ijazah: true }, 'female'),
  ['ijazah_female'],
  'Ijazah-only course must only offer ijazah_female for female participant',
);

assert.deepEqual(
  offeredDocumentTypes({ offers_certificate: true, offers_ijazah: true }, 'male'),
  ['participation_certificate', 'ijazah_male'],
  'Both-enabled course must offer both documents',
);

assert.deepEqual(
  expectedDocumentTypes(
    {
      gender: 'male',
      attended_day_1: true,
      attended_day_2: true,
      attended_day_3: true,
    },
    {
      offers_certificate: false,
      offers_ijazah: true,
    },
  ),
  ['ijazah_male'],
  'Ijazah-only legacy_attendance program should only issue ijazah_male on 3/3 attendance',
);

assert.deepEqual(
  expectedDocumentTypes(
    {
      gender: 'female',
      attended_day_1: true,
      attended_day_2: false,
      attended_day_3: false,
    },
    {
      offers_certificate: false,
      offers_ijazah: true,
    },
  ),
  [],
  'Ijazah-only legacy_attendance program should issue no documents on 1/3 attendance',
);

assert.deepEqual(
  expectedDocumentTypes(
    {
      gender: 'female',
      attended_day_1: false,
      attended_day_2: false,
      attended_day_3: false,
      certificate_eligible: true,
      ijazah_eligible: false,
    },
    {
      offers_certificate: true,
      offers_ijazah: true,
    },
  ),
  ['participation_certificate'],
  'Explicit entitlement flags override attendance counts for non-attendance programs',
);

// 3. Availability periods: indefinite, active window, scheduled (future), expired (past), inactive
const now = new Date('2026-11-11T12:00:00Z');

const indefiniteAvail = programAvailability(
  { is_active: true, available_from: null, available_until: null },
  now,
);
assert.equal(indefiniteAvail.available, true);
assert.equal(indefiniteAvail.state, 'available');
assertProgramAvailable({ is_active: true, available_from: null, available_until: null });

const boundedOpenAvail = programAvailability(
  {
    is_active: true,
    available_from: '2026-11-01T00:00:00Z',
    available_until: '2026-11-20T23:59:59Z',
  },
  now,
);
assert.equal(boundedOpenAvail.available, true);
assert.equal(boundedOpenAvail.state, 'available');

const scheduledAvail = programAvailability(
  {
    is_active: true,
    available_from: '2099-01-01T00:00:00Z',
    available_until: '2099-12-31T23:59:59Z',
  },
  now,
);
assert.equal(scheduledAvail.available, false);
assert.equal(scheduledAvail.state, 'scheduled');
assert.throws(
  () =>
    assertProgramAvailable({
      is_active: true,
      available_from: '2099-01-01T00:00:00Z',
      available_until: '2099-12-31T23:59:59Z',
    }),
  /لم تبدأ/,
);

const expiredAvail = programAvailability(
  {
    is_active: true,
    available_from: '2020-01-01T00:00:00Z',
    available_until: '2020-12-31T23:59:59Z',
  },
  now,
);
assert.equal(expiredAvail.available, false);
assert.equal(expiredAvail.state, 'expired');
assert.throws(
  () =>
    assertProgramAvailable({
      is_active: true,
      available_from: '2020-01-01T00:00:00Z',
      available_until: '2020-12-31T23:59:59Z',
    }),
  /انتهت/,
);

const inactiveAvail = programAvailability(
  {
    is_active: false,
    available_from: null,
    available_until: null,
  },
  now,
);
assert.equal(inactiveAvail.available, false);
assert.equal(inactiveAvail.state, 'inactive');
assert.throws(
  () =>
    assertProgramAvailable({
      is_active: false,
      available_from: null,
      available_until: null,
    }),
  /متوقف/,
);

console.log(
  `Verified all ${checked} Ghawthani attendance combinations, document-type filters (cert-only/ijazah-only/both), explicit entitlement flags, and availability states (indefinite/active/scheduled/expired/inactive).`,
);
