import {
  AlertTriangle,
  ArrowRight,
  Check,
  CheckCircle2,
  Download,
  FileCheck2,
  Loader2,
  RotateCcw,
  ShieldCheck,
} from 'lucide-react';
import { FormEvent, useEffect, useMemo, useRef, useState } from 'react';
import {
  documentLabels,
  getIjazahProgram,
  getGhawthaniStatus,
  GH_PARTICIPANT_SESSION_KEY,
  submitGhawthani,
  type GhawthaniDocument,
  type GhawthaniGender,
  type GhawthaniSubmission,
  type IjazahProgram,
} from '../lib/ghawthaniService';

type Answer = boolean | null;
type Step = 'form' | 'review' | 'result';

interface Props {
  onBack: () => void;
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
  if (documents.length === 1) return 'تم إصدار شهادة المشاركة والحضور الخاصة بك.';
  return '';
}

const ghawthaniFallback: IjazahProgram = {
  id: '', dawra_id: null, slug: 'ghawthani', title: 'إجازة وشهادة دورة الغوثاني',
  course_subject: 'قراءة وشرح كتاب «كيف تحفظ القرآن الكريم»', instructor_name: 'الشيخ د. يحيى الغوثاني',
  introduction: 'هذه الاستمارة خاصة بدورة قراءة وشرح كتاب «كيف تحفظ القرآن الكريم» للشيخ د. يحيى الغوثاني.',
  trust_statement: 'تُعتمد إجابات الحضور على الأمانة العلمية والثقة في النقل عند أهل القرآن والعلم.', is_active: true,
};

export default function GhawthaniIjazahPage({ onBack, programSlug = 'ghawthani' }: Props) {
  const [step, setStep] = useState<Step>('form');
  const [fullName, setFullName] = useState('');
  const [gender, setGender] = useState<GhawthaniGender | ''>('');
  const [day1, setDay1] = useState<Answer>(null);
  const [day2, setDay2] = useState<Answer>(null);
  const [day3, setDay3] = useState<Answer>(null);
  const [acknowledged, setAcknowledged] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [submission, setSubmission] = useState<GhawthaniSubmission | null>(null);
  const [documents, setDocuments] = useState<GhawthaniDocument[]>([]);
  const [program, setProgram] = useState<IjazahProgram>(ghawthaniFallback);
  const [programLoading, setProgramLoading] = useState(programSlug !== 'ghawthani');
  const idempotencyRef = useRef(crypto.randomUUID());

  const attendanceCount = useMemo(
    () => [day1, day2, day3].filter((answer) => answer === true).length,
    [day1, day2, day3],
  );

  useEffect(() => {
    let mounted = true;
    getIjazahProgram(programSlug)
      .then(({ program: loaded }) => { if (mounted) setProgram(loaded); })
      .catch((caught) => { if (mounted && programSlug !== 'ghawthani') setError(caught instanceof Error ? caught.message : 'تعذر تحميل بيانات الدورة.'); })
      .finally(() => { if (mounted) setProgramLoading(false); });
    return () => { mounted = false; };
  }, [programSlug]);

  useEffect(() => {
    const saved = sessionStorage.getItem(GH_PARTICIPANT_SESSION_KEY);
    if (!saved) return;
    try {
      const { submissionId, accessToken, savedProgramSlug } = JSON.parse(saved);
      if (!submissionId || !accessToken || (savedProgramSlug && savedProgramSlug !== programSlug)) return;
      setLoading(true);
      getGhawthaniStatus(submissionId, accessToken)
        .then((result) => {
          setSubmission(result.submission);
          setDocuments(result.documents);
          setStep('result');
        })
        .catch(() => sessionStorage.removeItem(GH_PARTICIPANT_SESSION_KEY))
        .finally(() => setLoading(false));
    } catch {
      sessionStorage.removeItem(GH_PARTICIPANT_SESSION_KEY);
    }
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
      sessionStorage.setItem(GH_PARTICIPANT_SESSION_KEY, JSON.stringify({
        submissionId: result.submission.id,
        accessToken: result.access_token,
        savedProgramSlug: programSlug,
      }));
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

  function reset() {
    sessionStorage.removeItem(GH_PARTICIPANT_SESSION_KEY);
    idempotencyRef.current = crypto.randomUUID();
    setFullName('');
    setGender('');
    setDay1(null);
    setDay2(null);
    setDay3(null);
    setAcknowledged(false);
    setSubmission(null);
    setDocuments([]);
    setError('');
    setStep('form');
  }

  return (
    <main className="gh-page">
      <section className="gh-hero">
        <button className="gh-back" type="button" onClick={onBack}>
          <ArrowRight size={18} aria-hidden /> العودة إلى المنصة
        </button>
        <span className="gh-eyebrow"><FileCheck2 size={17} aria-hidden /> {program.title}</span>
        <h1>طلب الإجازة وشهادة المشاركة</h1>
        <p>{program.introduction || <>هذه الاستمارة خاصة بدورة <strong>{program.course_subject}</strong>، بإشراف {program.instructor_name}.</>}</p>
      </section>

      <div className="gh-layout">
        <aside className="gh-requirements" aria-label="شروط الاستحقاق">
          <h2>شروط الاستحقاق</h2>
          <ol>
            <li><strong>ثلاثة أيام:</strong> إجازة، مع شهادة مشاركة وحضور.</li>
            <li><strong>يوم أو يومان:</strong> شهادة مشاركة وحضور فقط.</li>
            <li><strong>دون حضور:</strong> لا يصدر أي مستند.</li>
          </ol>
          <p><ShieldCheck size={18} aria-hidden /> {program.trust_statement}</p>
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

          {step === 'form' && !loading && !programLoading && (
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
                <div className="emphasis"><dt>الاستحقاق المتوقع</dt><dd>{attendanceCount === 3 ? 'الإجازة وشهادة المشاركة' : attendanceCount > 0 ? 'شهادة المشاركة فقط' : 'لا توجد مستندات مستحقة'}</dd></div>
              </dl>
              {attendanceCount === 0 && <div className="gh-alert warning"><AlertTriangle size={18} aria-hidden />يشترط حضور يوم واحد على الأقل للحصول على شهادة المشاركة، وحضور الأيام الثلاثة للحصول على الإجازة.</div>}
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
              {submission.generation_status === 'failed' ? (
                <><div className="gh-result-icon error"><AlertTriangle size={34} aria-hidden /></div><h2>حُفظ طلبك، وتعذر توليد المستندات</h2><p>{submission.generation_error || 'يمكن لمسؤول المنصة إعادة المحاولة بعد مراجعة القوالب.'}</p></>
              ) : submission.eligibility === 'none' ? (
                <><div className="gh-result-icon warning"><AlertTriangle size={34} aria-hidden /></div><h2>تم تسجيل إجابتك</h2><p>لا يصدر مستند عند عدم حضور أي يوم. يلزم حضور يوم واحد على الأقل للشهادة، والأيام الثلاثة للإجازة.</p></>
              ) : (
                <><div className="gh-result-icon"><CheckCircle2 size={36} aria-hidden /></div><h2>تم إصدار مستنداتك بنجاح</h2><p>{documentDescription(documents)}</p></>
              )}
              <div className="gh-name-preview compact"><small>الاسم المعتمد</small><strong>{submission.full_name}</strong></div>
              {documents.length > 0 && (
                <div className="gh-downloads">
                  {documents.map((document) => (
                    <a className="primary-action" key={document.id} href={document.download_url} target="_blank" rel="noreferrer" download>
                      <Download size={19} aria-hidden /> تنزيل {documentLabels[document.document_type]}
                    </a>
                  ))}
                  <small>روابط التنزيل خاصة ومؤقتة. عند انتهاء الرابط، أعد فتح هذه الصفحة في الجلسة نفسها.</small>
                </div>
              )}
              <button className="ghost-action" type="button" onClick={reset}><RotateCcw size={17} aria-hidden /> تقديم طلب جديد</button>
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
