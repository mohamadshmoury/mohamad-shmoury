export type EligibilityMethod = 'legacy_attendance' | 'passed_exam' | 'manual';

export interface ProgramAvailability {
  is_active: boolean;
  available_from?: string | null;
  available_until?: string | null;
}

export function programAvailability(program: ProgramAvailability, now = new Date()) {
  const nowMs = now.getTime();
  const startMs = program.available_from ? new Date(program.available_from).getTime() : null;
  const endMs = program.available_until ? new Date(program.available_until).getTime() : null;
  const startsLater = startMs !== null && Number.isFinite(startMs) && nowMs < startMs;
  const expired = endMs !== null && Number.isFinite(endMs) && nowMs >= endMs;
  const available = program.is_active && !startsLater && !expired;
  return {
    available,
    state: !program.is_active ? 'inactive' as const
      : startsLater ? 'scheduled' as const
        : expired ? 'expired' as const
          : 'available' as const,
    available_from: program.available_from || null,
    available_until: program.available_until || null,
  };
}

export function offeredDocumentTypes(program: {
  offers_certificate?: boolean | null;
  offers_ijazah?: boolean | null;
}, gender: 'male' | 'female' = 'male') {
  const types: Array<'ijazah_male' | 'ijazah_female' | 'participation_certificate'> = [];
  if (program.offers_certificate !== false) types.push('participation_certificate');
  if (program.offers_ijazah !== false) types.push(gender === 'female' ? 'ijazah_female' : 'ijazah_male');
  return types;
}

export function assertProgramAvailable(program: ProgramAvailability) {
  const availability = programAvailability(program);
  if (availability.available) return availability;
  if (availability.state === 'scheduled') throw new Error('لم تبدأ فترة طلب الإجازات والشهادات لهذه الدورة بعد.');
  if (availability.state === 'expired') throw new Error('انتهت فترة الطلب والإصدار لهذه الدورة. تبقى المستندات الصادرة سابقًا متاحة للتنزيل.');
  throw new Error('برنامج الإجازات والشهادات لهذه الدورة متوقف حاليًا.');
}
