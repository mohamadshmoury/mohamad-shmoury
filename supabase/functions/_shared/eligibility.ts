export type GhawthaniGender = 'male' | 'female';
export type DocumentType = 'ijazah_male' | 'ijazah_female' | 'participation_certificate';

export function expectedDocumentTypes(submission: {
  gender: GhawthaniGender;
  attended_day_1: boolean;
  attended_day_2: boolean;
  attended_day_3: boolean;
  certificate_eligible?: boolean | null;
  ijazah_eligible?: boolean | null;
}, program: {
  offers_certificate?: boolean | null;
  offers_ijazah?: boolean | null;
} = {}): DocumentType[] {
  const count = Number(submission.attended_day_1) + Number(submission.attended_day_2) + Number(submission.attended_day_3);
  const certificateEligible = submission.certificate_eligible ?? count > 0;
  const ijazahEligible = submission.ijazah_eligible ?? count === 3;
  const types: DocumentType[] = [];
  if (certificateEligible && program.offers_certificate !== false) types.push('participation_certificate');
  if (ijazahEligible && program.offers_ijazah !== false) {
    types.push(submission.gender === 'male' ? 'ijazah_male' : 'ijazah_female');
  }
  return types;
}
