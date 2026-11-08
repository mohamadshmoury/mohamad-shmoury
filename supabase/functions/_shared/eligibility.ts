export type GhawthaniGender = 'male' | 'female';
export type DocumentType = 'ijazah_male' | 'ijazah_female' | 'participation_certificate';

export function expectedDocumentTypes(submission: {
  gender: GhawthaniGender;
  attended_day_1: boolean;
  attended_day_2: boolean;
  attended_day_3: boolean;
}): DocumentType[] {
  const count = Number(submission.attended_day_1) + Number(submission.attended_day_2) + Number(submission.attended_day_3);
  if (count === 0) return [];
  if (count < 3) return ['participation_certificate'];
  return ['participation_certificate', submission.gender === 'male' ? 'ijazah_male' : 'ijazah_female'];
}
