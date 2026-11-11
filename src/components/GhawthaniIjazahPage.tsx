import {
  AlertTriangle,
  ArrowRight,
  Award,
  CalendarClock,
  Check,
  CheckCircle2,
  Clock3,
  Download,
  FileCheck2,
  Loader2,
  RefreshCw,
  RotateCcw,
  ShieldCheck,
} from 'lucide-react';
import { FormEvent, useEffect, useMemo, useRef, useState } from 'react';
import {
  addParticipantClaim,
  clearLegacyProgramSession,
  computeProgramAvailability,
  documentLabels,
  getIjazahProgram,
  getGhawthaniStatus,
  loadLegacyProgramSession,
  retryGhawthaniSubmission,
  saveLegacyProgramSession,
  submitGhawthani,
  type GhawthaniDocument,
  type GhawthaniGender,
  type GhawthaniSubmission,
  type IjazahProgram,
  type ProgramAvailability,
} from '../lib/ghawthaniService';

type Answer = boolean | null;
type Step = 'form' | 'review' | 'result';

interface Props {
  onBack: () => void;
  onOpenCertificates?: () => void;
  programSlug?: string;
}

function YesNoField({ id, label, value, onChange }: { id: string; label: string; value: Answer; onChange: (value: boolean) => void }) {
  return (
    <fieldset className="gh-question">
      <legend>{label} <span aria-hidden>*</span></legend>
      <div className="gh-segmented">
        <label className={value === true ? 'selected' : ''}>
          <input type="radio" name={id} checked={value === true} onChange={() => onChange(true)} />
          {value === true && <Check size={17} aria-hidden />} نعم
        </label>
        <label className={value === false ? 'selected no' : ''}>
          <input type="radio" name={id} checked={value === false} onChange={() => onChange(false)} />
          لا
        </label>
      </div>
    </fieldset>
  );
}

function documentDescription(documents: GhawthaniDocument[]) {
  if (documents.length === 2) return 'تم إصدار شهادة المشاركة والإجازة الخاصة بك.';
  if (documents.length === 1) {
    return documents[0].document_type === 'participation_certificate'
      ? 'تم إصدار شهادة المشاركة والحضور الخاصة بك.'
      : 'تم إصدار الإجازة الخاصة بك.';
  }
  return '';
}

function expectedEligibilityLabel(attendanceCount: number, program: IjazahProgram) {
  const offersCert = program.offers_certificate !== false;
  const offersIjazah = program.offers_ijazah !== false;
  if (attendanceCount === 3) {
    if (offersCert && offersIjazah) return 'الإجازة وشهادة المشاركة';
    if (offersIjazah) return 'الإجازة فقط';
    if (offersCert) return 'شهادة المشاركة فقط';
  }
  if (attendanceCount > 0 && offersCert) return 'شهادة المشاركة فقط';
  return 'لا توجد مستندات مستحقة';
}

function formatDateTime(value: string | null) {
  if (!value) return '';
  return new Intl.DateTimeFormat('ar-LB', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value));
}

const ghawthaniFallback: IjazahProgram = {
  id: '', dawra_id: null, slug: 'ghawthani', title: 'إجازة وشهادة دورة الغوثاني',
  course_subject: 'قراءة وشرح كتاب «كيف تحفظ القرآن الكريم»', instructor_name: 'الشيخ د. يحيى الغوثاني',
  introduction: 'هذه الاستمارة خاصة بدورة قراءة وشرح كتاب «كيف تحفظ القرآن الكريم» للشيخ د. يحيى الغوثاني.',
  trust_statement: 'تُعتمد إجابات الحضور على الأمانة العلمية والثقة في النقل عند أهل القرآن والعلم.', is_active: true,
  offers_certificate: true, offers_ijazah: true, eligibility_method: 'legacy_attendance',
  requires_approval: false,
  available_from: null, available_until: null,
};

export default function GhawthaniIjazahPage({ onBack, onOpenCertificates, programSlug = 'ghawthani' }: Props) {
  const [step, setStep] = useState<Step>('form');
  const [fullName, setFullName] = useState('');
  const [gender, setGender] = useState<GhawthaniGender | ''>('');
  const [day1, setDay1] = useState<Answer>(null);
  const [day2, setDay2] = useState<Answer>(null);
  const [day3, setDay3] = useState<Answer>(null);
  const [acknowledged, setAcknowledged] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [retrying, setRetrying] = useState(false);
  const [submission, setSubmission] = useState<GhawthaniSubmission | null>(null);
  const [accessToken, setAccessToken] = useState('');
  const [documents, setDocuments] = useState<GhawthaniDocument[]>([]);
  const [program, setProgram] = useState<IjazahProgram>(ghawthaniFallback);
  const [availability, setAvailability] = useState<ProgramAvailability>(() => computeProgramAvailability(ghawthaniFallback));
  const [programLoading, setProgramLoading] = useState(programSlug !== 'ghawthani');
  const idempotencyRef = useRef(crypto.randomUUID());

  const attendanceCount = useMemo(
    () => [day1, day2, day3].filter((answer) => answer === true).length,
    [day1, day2, day3],
  );

  useEffect(() => {
    let mounted = true;
    getIjazahProgram(programSlug)
      .then(({ program: loaded, availability: loadedAvailability }) => {
        if (!mounted) return;
        setProgram(loaded);
        setAvailability(loadedAvailability || computeProgramAvailability(loaded));
      })
      .catch((caught) => {
        if (mounted && programSlug !== 'ghawthani') {
          setError(caught instanceof Error ? caught.message : 'تعذر تحميل بيانات الدورة.');
        }
      })
      .finally(() => { if (mounted) setProgramLoading(false); });
    return () => { mounted = false; };
  }, [programSlug]);

  useEffect(() => {
    const saved = loadLegacyProgramSession(programSlug);
    if (!saved) {
      setSubmission(null);
      setAccessToken('');
      setDocuments([]);
      setStep('form');
      return;
    }
    setLoading(true);
    getGhawthaniStatus(saved.submissionId, saved.accessToken)
      .then((result) => {
        setSubmission(result.submission);
        setAccessToken(saved.accessToken);
        setDocuments(result.documents);
        setFullName(result.submission.full_name);
        setStep('result');
      })
      .catch((caught) => {
        clearLegacyProgramSession(programSlug);
        if (caught instanceof Error && caught.message.includes('إلغاء صلاحية')) {
          setError(caught.message);
        }
      })
      .finally(() => setLoading(false));
  }, [programSlug]);

  function validate() {
    const trimmed = fullName.trim();
    if (trimmed.length < 3) return 'يرجى إدخال الاسم الثلاثي كما سيظهر في المستندات.';
    if (trimmed.length > 120) return 'الاسم أطول من المساحة المسموح بها.';
    if (!gender) return 'يرجى اختيار الجنس لتحديد قالب الإجازة المناسب.';
    if (day1 === null || day2 === null || day3 === null) return 'يجب الإجابة صراحةً عن حضور كل يوم.';
    if (!acknowledged) return 'يرجى تأكيد صحة المعلومات والاسم.';
    return '';
  }

  function review(event: FormEvent) {
    event.preventDefault();
    const validation = validate();
    if (validation) {
      setError(validation);
      return;
    }
    setFullName(fullName.trim());
    setError('');
    setStep('review');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  async function submit() {
    if (!gender || day1 === null || day2 === null || day3 === null) return;
    setLoading(true);
    setError('');
    try {
      const result = await submitGhawthani({
        program_slug: programSlug,
        full_name: fullName,
        gender,
        attended_day_1: day1,
        attended_day_2: day2,
        attended_day_3: day3,
        acknowledged: true,
        idempotency_key: idempotencyRef.current,
      });
      saveLegacyProgramSession(programSlug, result.submission.id, result.access_token);
      addParticipantClaim({
        kind: 'submission', id: result.submission.id, token: result.access_token, program_slug: programSlug,
      });
      setAccessToken(result.access_token);
      setSubmission(result.submission);
      setDocuments(result.documents);
      setStep('result');
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'تعذر إرسال الطلب. يرجى المحاولة مجددًا.');
    } finally {
      setLoading(false);
    }
  }

  async function handleRetryGeneration() {
    if (!submission || !accessToken) return;
    setRetrying(true);
    setError('');
    try {
      const result = await retryGhawthaniSubmission({
        submission_id: submission.id,
        access_token: accessToken,
        full_name: fullName.trim() || submission.full_name,
      });
      setSubmission(result.submission);
      setDocuments(result.documents);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'تعذر إعادة محاولة توليد المستندات.');
    } finally {
      setRetrying(false);
    }
  }

  function reset() {
    clearLegacyProgramSession(programSlug);
    idempotencyRef.current = crypto.randomUUID();
    setFullName('');
    setGender('');
    setDay1(null);
    setDay2(null);
    setDay3(null);
    setAcknowledged(false);
    setSubmission(null);
    setAccessToken('');
    setDocuments([]);
    setError('');
    setStep('form');
  }

  const offersBoth = program.offers_certificate !== false && program.offers_ijazah !== false;
  const offersOnlyCertificate = program.offers_certificate !== false && program.offers_ijazah === false;
  const offersOnlyIjazah = program.offers_certificate === false && program.offers_ijazah !== false;

  return (
    <main className="gh-page">
      <section className="gh-hero">
        <button className="gh-back" type="button" onClick={onBack}>
          <ArrowRight size={18} aria-hidden /> العودة إلى المنصة
        </button>
        <span className="gh-eyebrow"><FileCheck2 size={17} aria-hidden /> {program.title}</span>
        <h1>{offersOnlyCertificate ? 'طلب شهادة المشاركة والحضور' : offersOnlyIjazah ? 'طلب الإجازة العلمية' : 'طلب الإجازة وشهادة المشاركة'}</h1>
        <p>{program.introduction || <>هذه الاستمارة خاصة بدورة <strong>{program.course_subject}</strong>، بإشراف {program.instructor_name}.</>}</p>
      </section>

      <div className="gh-layout">
        <aside className="gh-requirements" aria-label="شروط الاستحقاق">
          <h2>شروط الاستحقاق</h2>
          <ol>
            {offersBoth && (
              <>
                <li><strong>ثلاثة أيام:</strong> إجازة، مع شهادة مشاركة وحضور.</li>
                <li><strong>يوم أو يومان:</strong> شهادة مشاركة وحضور فقط.</li>
                <li><strong>دون حضور:</strong> لا يصدر أي مستند.</li>
              </>
            )}
            {offersOnlyCertificate && (
              <>
                <li><strong>يوم واحد إلى ثلاثة أيام:</strong> شهادة مشاركة وحضور.</li>
                <li><strong>دون حضور:</strong> لا يصدر أي مستند.</li>
              </>
            )}
            {offersOnlyIjazah && (
              <>
                <li><strong>ثلاثة أيام كاملة:</strong> إجازة علمية معتمدة.</li>
                <li><strong>أقل من ثلاثة أيام:</strong> لا تصدر إجازة لهذه الدورة.</li>
              </>
            )}
          </ol>
          <p><ShieldCheck size={18} aria-hidden /> {program.trust_statement}</p>
          <div className="gh-availability-box">
            <CalendarClock size={16} aria-hidden />
            <span>
              {availability.state === 'scheduled' && `يبدأ استقبال الطلبات في ${formatDateTime(availability.available_from)}`}
              {availability.state === 'expired' && `انتهت فترة استقبال الطلبات في ${formatDateTime(availability.available_until)}`}
              {availability.state === 'inactive' && 'استقبال الطلبات الجديدة متوقف حاليًا'}
              {availability.state === 'available' && (availability.available_until ? `متاح حتى ${formatDateTime(availability.available_until)}` : 'متاح دون تاريخ انتهاء')}
            </span>
          </div>
        </aside>

        <section className="gh-card" aria-live="polite">
          <div className="gh-steps" aria-label="خطوات الطلب">
            <span className={step === 'form' ? 'active' : 'done'}>1 <small>البيانات</small></span>
            <i aria-hidden />
            <span className={step === 'review' ? 'active' : step === 'result' ? 'done' : ''}>2 <small>المراجعة</small></span>
            <i aria-hidden />
            <span className={step === 'result' ? 'active' : ''}>3 <small>الإصدار</small></span>
          </div>

          {(loading || programLoading) && step === 'form' && (
            <div className="gh-state"><Loader2 className="spin" size={30} aria-hidden /><strong>جاري استعادة طلبك السابق…</strong></div>
          )}

          {step === 'form' && !loading && !programLoading && !availability.available && (
            <div className="gh-result">
              <div className="gh-result-icon warning"><Clock3 size={34} aria-hidden /></div>
              <h2>
                {availability.state === 'scheduled'
                  ? 'لم تبدأ فترة استقبال الطلبات بعد'
                  : availability.state === 'expired'
                    ? 'انتهت فترة استقبال الطلبات الجديدة'
                    : 'استقبال الطلبات متوقف حاليًا'}
              </h2>
              <p>
                {availability.state === 'scheduled' && `يُفتح باب التقديم لهذه الدورة في ${formatDateTime(availability.available_from)}.`}
                {availability.state === 'expired' && `أُغلق باب الطلبات والإصدارات الجديدة في ${formatDateTime(availability.available_until)}. إذا سبق لك إصدار مستند، فإنه يبقى متاحًا للتنزيل من قسم الإجازات والشهادات.`}
                {availability.state === 'inactive' && 'أوقفت إدارة المنصة استقبال طلبات جديدة لهذه الدورة في الوقت الحالي. تبقى المستندات الصادرة سابقًا محفوظة وقابلة للتنزيل.'}
              </p>
              {error && <div className="gh-alert error"><AlertTriangle size={18} aria-hidden />{error}</div>}
              {onOpenCertificates && (
                <button className="secondary-action" type="button" onClick={onOpenCertificates}>
                  <Award size={18} aria-hidden /> فتح الإجازات والشهادات
                </button>
              )}
            </div>
          )}

          {step === 'form' && !loading && !programLoading && availability.available && (
            <form className="gh-form" onSubmit={review} noValidate>
              <div className="gh-section-heading">
                <h2>أدخل الاسم وأجب عن الحضور</h2>
                <p>سيظهر الاسم المكتوب أدناه كما هو على المستندات الصادرة. لا نقيّد الأسماء المركبة بعدد كلمات محدد.</p>
              </div>
              <label className="field full">
                <span>الاسم الثلاثي <b aria-hidden>*</b></span>
                <input value={fullName} onChange={(event) => setFullName(event.target.value)} maxLength={120} autoComplete="name" placeholder="مثال: عبد الله محمد أحمد" />
                <small>اكتب الاسم كاملًا بالإملاء الذي تريد ظهوره في الإجازة والشهادة.</small>
              </label>
              <fieldset className="gh-question">
                <legend>الجنس <span aria-hidden>*</span></legend>
                <div className="gh-segmented">
                  <label className={gender === 'male' ? 'selected' : ''}><input type="radio" name="gender" checked={gender === 'male'} onChange={() => setGender('male')} /> ذكر</label>
                  <label className={gender === 'female' ? 'selected' : ''}><input type="radio" name="gender" checked={gender === 'female'} onChange={() => setGender('female')} /> أنثى</label>
                </div>
              </fieldset>
              <div className="gh-attendance">
                <h3>إقرار الحضور</h3>
                <YesNoField id="day1" label="هل حضرت اليوم الأول؟" value={day1} onChange={setDay1} />
                <YesNoField id="day2" label="هل حضرت اليوم الثاني؟" value={day2} onChange={setDay2} />
                <YesNoField id="day3" label="هل حضرت اليوم الثالث؟" value={day3} onChange={setDay3} />
              </div>
              <label className="gh-acknowledgment">
                <input type="checkbox" checked={acknowledged} onChange={(event) => setAcknowledged(event.target.checked)} />
                <span>أقر بأن الاسم والمعلومات أعلاه صحيحة، وأن هذا الاسم هو المعتمد لطباعته على المستندات.</span>
              </label>
              {error && <div className="gh-alert error"><AlertTriangle size={18} aria-hidden />{error}</div>}
              <button className="primary-action gh-submit" type="submit">مراجعة البيانات قبل الإرسال</button>
            </form>
          )}

          {step === 'review' && (
            <div className="gh-review">
              <div className="gh-section-heading"><span>المراجعة النهائية</span><h2>تأكد من الاسم والإجابات</h2><p>لن يتم إصدار المستندات قبل ضغط زر التأكيد.</p></div>
              <div className="gh-name-preview"><small>الاسم الذي سيظهر على المستندات</small><strong>{fullName}</strong></div>
              <dl className="gh-review-list">
                <div><dt>الجنس</dt><dd>{gender === 'male' ? 'ذكر' : 'أنثى'}</dd></div>
                <div><dt>اليوم الأول</dt><dd>{day1 ? 'نعم' : 'لا'}</dd></div>
                <div><dt>اليوم الثاني</dt><dd>{day2 ? 'نعم' : 'لا'}</dd></div>
                <div><dt>اليوم الثالث</dt><dd>{day3 ? 'نعم' : 'لا'}</dd></div>
                <div className="emphasis"><dt>الاستحقاق المتوقع</dt><dd>{expectedEligibilityLabel(attendanceCount, program)}</dd></div>
              </dl>
              {expectedEligibilityLabel(attendanceCount, program) === 'لا توجد مستندات مستحقة' && (
                <div className="gh-alert warning">
                  <AlertTriangle size={18} aria-hidden />
                  {offersOnlyIjazah
                    ? 'يشترط حضور الأيام الثلاثة كاملة للحصول على الإجازة في هذه الدورة.'
                    : 'يشترط حضور يوم واحد على الأقل للحصول على شهادة المشاركة، وحضور الأيام الثلاثة للحصول على الإجازة.'}
                </div>
              )}
              {program.requires_approval && expectedEligibilityLabel(attendanceCount, program) !== 'لا توجد مستندات مستحقة' && (
                <div className="gh-alert warning">
                  <Clock3 size={18} aria-hidden />
                  يتطلب هذا البرنامج مراجعة وموافقة الإدارة بعد إرسال الطلب قبل إصدار المستندات.
                </div>
              )}
              {error && <div className="gh-alert error"><AlertTriangle size={18} aria-hidden />{error}</div>}
              <div className="gh-actions">
                <button className="secondary-action" type="button" onClick={() => setStep('form')} disabled={loading}>تعديل البيانات</button>
                <button className="primary-action" type="button" onClick={submit} disabled={loading}>
                  {loading ? <><Loader2 className="spin" size={18} aria-hidden /> جاري الحفظ والإصدار…</> : 'تأكيد وإرسال الطلب'}
                </button>
              </div>
            </div>
          )}

          {step === 'result' && submission && (
            <div className="gh-result">
              {submission.approval_status === 'pending_approval' ? (
                <>
                  <div className="gh-result-icon warning"><Clock3 size={34} aria-hidden /></div>
                  <h2>تم استلام طلبك وهو بانتظار موافقة الإدارة</h2>
                  <p>حُفظ إقرارك بنجاح، وسيتم إصدار المستندات وإتاحتها للتنزيل فور اعتماد الطلب من إدارة الدورة.</p>
                </>
              ) : submission.approval_status === 'rejected' ? (
                <>
                  <div className="gh-result-icon error"><AlertTriangle size={34} aria-hidden /></div>
                  <h2>تعذر اعتماد الطلب</h2>
                  <p>{submission.approval_note || 'لم تتم الموافقة على إصدار المستندات لهذا الطلب من قِبل الإدارة.'}</p>
                </>
              ) : submission.generation_status === 'failed' ? (
                <>
                  <div className="gh-result-icon error"><AlertTriangle size={34} aria-hidden /></div>
                  <h2>حُفظ طلبك، وتعذر توليد المستندات</h2>
                  <p>{submission.generation_error || 'يمكن لمسؤول المنصة إعادة المحاولة بعد مراجعة القوالب.'}</p>
                </>
              ) : (submission.eligibility === 'none' || submission.generation_status === 'not_required') ? (
                <>
                  <div className="gh-result-icon warning"><AlertTriangle size={34} aria-hidden /></div>
                  <h2>تم تسجيل إجابتك</h2>
                  <p>
                    {offersOnlyIjazah
                      ? 'لا تصدر إجازة عند حضور أقل من ثلاثة أيام في هذه الدورة.'
                      : 'لا يصدر مستند عند عدم حضور أي يوم. يلزم حضور يوم واحد على الأقل للشهادة، والأيام الثلاثة للإجازة.'}
                  </p>
                </>
              ) : (
                <>
                  <div className="gh-result-icon"><CheckCircle2 size={36} aria-hidden /></div>
                  <h2>تم إصدار مستنداتك بنجاح</h2>
                  <p>{documentDescription(documents)}</p>
                </>
              )}
              <div className="gh-name-preview compact"><small>الاسم المعتمد</small><strong>{submission.full_name}</strong></div>
              {error && <div className="gh-alert error"><AlertTriangle size={18} aria-hidden />{error}</div>}
              {submission.generation_status === 'failed' && availability.available && accessToken && (
                <div className="gh-retry-box">
                  <label className="field full">
                    <span>الاسم للطباعة (يمكنك تعديله إذا كان طويلًا جدًا)</span>
                    <input value={fullName} maxLength={120} onChange={(event) => setFullName(event.target.value)} />
                  </label>
                  <button className="primary-action" type="button" disabled={retrying} onClick={handleRetryGeneration}>
                    {retrying ? <Loader2 className="spin" size={18} aria-hidden /> : <RefreshCw size={18} aria-hidden />}
                    إعادة محاولة الإصدار
                  </button>
                </div>
              )}
              {documents.length > 0 && (
                <div className="gh-downloads">
                  {documents.map((document) => (
                    <a className="primary-action" key={document.id} href={document.download_url} target="_blank" rel="noreferrer" download>
                      <Download size={19} aria-hidden /> تنزيل {documentLabels[document.document_type]}
                    </a>
                  ))}
                  <small>روابط التنزيل خاصة ومؤقتة. عند انتهاء الرابط، أعد فتح هذه الصفحة في الجلسة نفسها.</small>
                  {!availability.available && (
                    <small className="issued-preserved">
                      <CheckCircle2 size={15} aria-hidden /> تبقى المستندات الصادرة سابقًا متاحة للتنزيل بعد انتهاء فترة الطلب.
                    </small>
                  )}
                </div>
              )}
              <div className="gh-result-footer">
                {onOpenCertificates && (
                  <button className="secondary-action" type="button" onClick={onOpenCertificates}>
                    <Award size={17} aria-hidden /> الإجازات والشهادات لجميع دوراتي
                  </button>
                )}
                {availability.available && (
                  <button className="ghost-action" type="button" onClick={reset}>
                    <RotateCcw size={17} aria-hidden /> تقديم طلب جديد
                  </button>
                )}
              </div>
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
