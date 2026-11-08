import assert from 'node:assert/strict';
import { expectedDocumentTypes } from '../supabase/functions/_shared/eligibility.ts';

let checked = 0;
for (const attended_day_1 of [false, true]) {
  for (const attended_day_2 of [false, true]) {
    for (const attended_day_3 of [false, true]) {
      const count = Number(attended_day_1) + Number(attended_day_2) + Number(attended_day_3);
      for (const gender of ['male', 'female']) {
        const actual = expectedDocumentTypes({ gender, attended_day_1, attended_day_2, attended_day_3 });
        const expected = count === 0
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
console.log(`Verified all 8 attendance combinations for both genders (${checked} cases).`);
