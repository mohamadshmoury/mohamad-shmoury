import {
  AlertTriangle,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Download,
  Eye,
  FileCog,
  FileUp,
  Loader2,
  RefreshCw,
  Search,
  Settings2,
} from 'lucide-react';
import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import {
  documentLabels,
  fileAsBase64,
  ghawthaniAdmin,
  type GhawthaniDocument,
  type GhawthaniDocumentType,
  type GhawthaniSubmission,
  type GhawthaniSummary,
  type GhawthaniTemplate,
  type IjazahProgram,
} from '../../lib/ghawthaniService';
import type { Dawra } from '../../types';

interface Props {
  adminToken: string;
  dawrat: Dawra[];
  setNotice: (value: string) => void;
  setError: (value: string) => void;
}

type Filters = {
  search: string;
  gender: string;
  attendance_count: string;
  eligibility: string;
  generation_status: string;
};

const templateLabels: Record<GhawthaniDocumentType, string> = {
  ijazah_male: 'إجازة الذكور',
  ijazah_female: 'إجازة الإناث',
  participation_certificate: 'شهادة المشاركة والحضور',
};

const defaultPlacements: Record<GhawthaniDocumentType, Pick<GhawthaniTemplate, 'page_index' | 'name_x' | 'name_y' | 'name_width' | 'name_height' | 'font_size' | 'min_font_size' | 'font_color' | 'alignment'>> = {
  ijazah_male: { page_index: 0, name_x: 92, name_y: 452, name_width: 295, name_height: 34, font_size: 21, min_font_size: 11, font_color: '#171717', alignment: 'center' },
  ijazah_female: { page_index: 0, name_x: 92, name_y: 452, name_width: 295, name_height: 34, font_size: 21, min_font_size: 11, font_color: '#171717', alignment: 'center' },
  participation_certificate: { page_index: 0, name_x: 145, name_y: 382, name_width: 552, name_height: 50, font_size: 28, min_font_size: 14, font_color: '#171717', alignment: 'center' },
};

function attendanceText(row: GhawthaniSubmission) {
  return [row.attended_day_1, row.attended_day_2, row.attended_day_3].map((yes, index) => `اليوم ${index + 1}: ${yes ? 'نعم' : 'لا'}`).join('، ');
}

function eligibilityText(value: string) {
  if (value === 'ijazah_and_certificate') return 'إجازة وشهادة';
  if (value === 'certificate_only') return 'شهادة فقط';
  return 'غير مستحق';
}

function generationText(value: string) {
  return ({ pending: 'بانتظار التوليد', processing: 'قيد التوليد', completed: 'تم التوليد', failed: 'فشل التوليد', not_required: 'لا يلزم توليد' } as Record<string, string>)[value] || value;
}

export default function GhawthaniManager({ adminToken, dawrat, setNotice, setError }: Props) {
  const [section, setSection] = useState<'submissions' | 'templates' | 'programs'>('submissions');
  const [programs, setPrograms] = useState<IjazahProgram[]>([]);
  const [selectedProgramId, setSelectedProgramId] = useState('');
  const [programForm, setProgramForm] = useState({
    id: '', dawra_id: '', slug: '', title: '', course_subject: '', instructor_name: '', introduction: '',
    trust_statement: 'تُعتمد إجابات الحضور على الأمانة العلمية والثقة.', is_active: true,
  });
  const [rows, setRows] = useState<GhawthaniSubmission[]>([]);
  const [summary, setSummary] = useState<GhawthaniSummary>({ submissions: 0, ijazah_eligible: 0, certificate_only: 0, generation_failures: 0 });
  const [filters, setFilters] = useState<Filters>({ search: '', gender: '', attendance_count: '', eligibility: '', generation_status: '' });
  const [appliedSearch, setAppliedSearch] = useState('');
  const [page, setPage] = useState(1);
  const [count, setCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState<GhawthaniSubmission | null>(null);
  const [templates, setTemplates] = useState<GhawthaniTemplate[]>([]);
  const [selectedTemplate, setSelectedTemplate] = useState<GhawthaniTemplate | null>(null);
  const [templateType, setTemplateType] = useState<GhawthaniDocumentType>('ijazah_male');
  const [templateFile, setTemplateFile] = useState<File | null>(null);
  const [placement, setPlacement] = useState(defaultPlacements.ijazah_male);
  const [sampleName, setSampleName] = useState('عبد الله محمد أحمد');
  const [sampleUrl, setSampleUrl] = useState('');
  const pageSize = 20;

  const loadPrograms = useCallback(async () => {
    setLoading(true);
    try {
      const result = await ghawthaniAdmin<{ programs: IjazahProgram[] }>(adminToken, 'list_programs');
      setPrograms(result.programs);
      setSelectedProgramId((current) => current || result.programs[0]?.id || '');
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'تعذر تحميل برامج الإجازات والشهادات.');
    } finally {
      setLoading(false);
    }
  }, [adminToken, setError]);

  const loadRows = useCallback(async () => {
    if (!selectedProgramId) return;
    setLoading(true);
    setError('');
    try {
      const result = await ghawthaniAdmin<{ rows: GhawthaniSubmission[]; count: number; summary: GhawthaniSummary }>(adminToken, 'list_submissions', {
        page,
        program_id: selectedProgramId,
        page_size: pageSize,
        search: appliedSearch,
        gender: filters.gender,
        attendance_count: filters.attendance_count === '' ? undefined : Number(filters.attendance_count),
        eligibility: filters.eligibility,
        generation_status: filters.generation_status,
      });
      setRows(result.rows);
      setCount(result.count);
      setSummary(result.summary);
      if (selected) setSelected(result.rows.find((row) => row.id === selected.id) || selected);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'تعذر تحميل طلبات الغوثاني.');
    } finally {
      setLoading(false);
    }
  }, [adminToken, appliedSearch, filters.attendance_count, filters.eligibility, filters.gender, filters.generation_status, page, selected, selectedProgramId, setError]);

  const loadTemplates = useCallback(async () => {
    if (!selectedProgramId) return;
    setLoading(true);
    setError('');
    try {
      const result = await ghawthaniAdmin<{ templates: GhawthaniTemplate[] }>(adminToken, 'list_templates', { program_id: selectedProgramId });
      setTemplates(result.templates);
      if (selectedTemplate) setSelectedTemplate(result.templates.find((item) => item.id === selectedTemplate.id) || null);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'تعذر تحميل القوالب.');
    } finally {
      setLoading(false);
    }
  }, [adminToken, selectedProgramId, selectedTemplate, setError]);

  useEffect(() => { void loadPrograms(); }, [loadPrograms]);

  useEffect(() => {
    if (section === 'submissions') void loadRows();
    else if (section === 'templates') void loadTemplates();
    // selected entities are intentionally excluded to avoid refetch loops.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [section, page, appliedSearch, filters.gender, filters.attendance_count, filters.eligibility, filters.generation_status, adminToken, selectedProgramId]);

  const pages = Math.max(1, Math.ceil(count / pageSize));
  const activeTemplates = useMemo(() => templates.filter((template) => template.is_active), [templates]);

  async function showDetails(row: GhawthaniSubmission) {
    setLoading(true);
    try {
      const result = await ghawthaniAdmin<{ submission: GhawthaniSubmission }>(adminToken, 'submission_details', { submission_id: row.id });
      setSelected(result.submission);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'تعذر تحميل التفاصيل.');
    } finally {
      setLoading(false);
    }
  }

  async function retry(row: GhawthaniSubmission) {
    setLoading(true);
    setError('');
    try {
      const result = await ghawthaniAdmin<{ submission: GhawthaniSubmission }>(adminToken, 'retry', { submission_id: row.id });
      setSelected(result.submission);
      setNotice('اكتملت إعادة محاولة توليد المستندات.');
      await loadRows();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'فشلت إعادة المحاولة.');
    } finally {
      setLoading(false);
    }
  }

  async function openDocument(document: GhawthaniDocument, download: boolean) {
    try {
      const result = await ghawthaniAdmin<{ url: string }>(adminToken, 'document_url', { document_id: document.id, download });
      window.open(result.url, '_blank', 'noopener,noreferrer');
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'تعذر فتح المستند.');
    }
  }

  function chooseTemplate(template: GhawthaniTemplate) {
    setSelectedTemplate(template);
    setTemplateType(template.template_type);
    setPlacement({
      page_index: Number(template.page_index), name_x: Number(template.name_x), name_y: Number(template.name_y),
      name_width: Number(template.name_width), name_height: Number(template.name_height), font_size: Number(template.font_size),
      min_font_size: Number(template.min_font_size), font_color: template.font_color, alignment: template.alignment,
    });
    setSampleUrl('');
  }

  function changeTemplateType(type: GhawthaniDocumentType) {
    setTemplateType(type);
    setPlacement(defaultPlacements[type]);
    setSelectedTemplate(null);
    setSampleUrl('');
  }

  async function uploadTemplate(event: FormEvent) {
    event.preventDefault();
    if (!templateFile) {
      setError('اختر ملف PDF أولًا.');
      return;
    }
    setLoading(true);
    setError('');
    try {
      const result = await ghawthaniAdmin<{ template: GhawthaniTemplate }>(adminToken, 'upload_template', {
        program_id: selectedProgramId,
        template_type: templateType,
        filename: templateFile.name,
        file_base64: await fileAsBase64(templateFile),
        ...placement,
      });
      setSelectedTemplate(result.template);
      setTemplateFile(null);
      setNotice('رُفع القالب كنسخة غير مفعّلة. أنشئ عينة وافحصها قبل التفعيل.');
      await loadTemplates();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'تعذر رفع القالب.');
    } finally {
      setLoading(false);
    }
  }

  async function saveConfig() {
    if (!selectedTemplate) return;
    setLoading(true);
    try {
      const result = await ghawthaniAdmin<{ template: GhawthaniTemplate; created_new_version: boolean }>(adminToken, 'save_template_config', {
        template_id: selectedTemplate.id,
        ...placement,
      });
      setSelectedTemplate(result.template);
      setSampleUrl('');
      setNotice(result.created_new_version ? 'حُفظ الضبط كنسخة جديدة للمحافظة على أثر النسخة المفعّلة.' : 'حُفظ موضع الاسم. يلزم إعادة فحص عينة.');
      await loadTemplates();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'تعذر حفظ موضع الاسم.');
    } finally {
      setLoading(false);
    }
  }

  async function generateSample() {
    if (!selectedTemplate) return;
    setLoading(true);
    setError('');
    try {
      const result = await ghawthaniAdmin<{ sample_url: string }>(adminToken, 'generate_sample', { template_id: selectedTemplate.id, sample_name: sampleName });
      setSampleUrl(result.sample_url);
      setNotice('تم إنشاء العينة. افحصها بصريًا ثم اعتمد النتيجة إذا كانت صحيحة.');
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'تعذر إنشاء العينة.');
    } finally {
      setLoading(false);
    }
  }

  async function validateTemplate() {
    if (!selectedTemplate || !sampleUrl) return;
    setLoading(true);
    try {
      const result = await ghawthaniAdmin<{ template: GhawthaniTemplate }>(adminToken, 'validate_template', { template_id: selectedTemplate.id });
      setSelectedTemplate(result.template);
      setNotice('تم اعتماد نتيجة العينة. يمكن الآن تفعيل هذه النسخة.');
      await loadTemplates();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'تعذر اعتماد القالب.');
    } finally {
      setLoading(false);
    }
  }

  async function activateTemplate() {
    if (!selectedTemplate) return;
    setLoading(true);
    try {
      await ghawthaniAdmin(adminToken, 'activate_template', { template_id: selectedTemplate.id });
      setNotice('تم تفعيل نسخة القالب. ستستخدم في الإصدارات الجديدة فقط.');
      await loadTemplates();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'تعذر تفعيل القالب.');
    } finally {
      setLoading(false);
    }
  }

  function editProgram(program: IjazahProgram) {
    setProgramForm({
      id: program.id, dawra_id: program.dawra_id || '', slug: program.slug, title: program.title,
      course_subject: program.course_subject, instructor_name: program.instructor_name,
      introduction: program.introduction, trust_statement: program.trust_statement, is_active: program.is_active,
    });
    setSection('programs');
  }

  function chooseDawra(dawraId: string) {
    const dawra = dawrat.find((item) => item.id === dawraId);
    setProgramForm((current) => ({
      ...current,
      dawra_id: dawraId,
      title: current.title || (dawra ? `إجازة وشهادة ${dawra.title}` : ''),
      course_subject: current.course_subject || dawra?.title || '',
      introduction: current.introduction || (dawra ? `هذه الاستمارة خاصة بدورة ${dawra.title}.` : ''),
    }));
  }

  async function saveProgram(event: FormEvent) {
    event.preventDefault();
    setLoading(true);
    setError('');
    try {
      const result = await ghawthaniAdmin<{ program: IjazahProgram }>(adminToken, 'save_program', {
        program_id: programForm.id || undefined,
        ...programForm,
      });
      setNotice(programForm.id ? 'تم تحديث إعداد البرنامج.' : 'تم إنشاء برنامج الإجازات والشهادات للدورة المختارة.');
      await loadPrograms();
      setSelectedProgramId(result.program.id);
      setProgramForm({ id: '', dawra_id: '', slug: '', title: '', course_subject: '', instructor_name: '', introduction: '', trust_statement: 'تُعتمد إجابات الحضور على الأمانة العلمية والثقة.', is_active: true });
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'تعذر حفظ البرنامج.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="gh-admin">
      <section className="tool-panel gh-program-picker">
        <div>
          <span className="section-kicker">نطاق العمل</span>
          <h2>إجازات وشهادات</h2>
          <p>اختر الدورة أولًا؛ الطلبات والقوالب والإصدارات أدناه مستقلة لكل دورة.</p>
        </div>
        <label className="field">
          <span>برنامج الدورة</span>
          <select value={selectedProgramId} onChange={(event) => { setSelectedProgramId(event.target.value); setPage(1); setSelected(null); setSelectedTemplate(null); }}>
            {programs.map((program) => <option key={program.id} value={program.id}>{program.title}{program.is_active ? '' : ' (متوقف)'}</option>)}
          </select>
        </label>
        {selectedProgramId && <a className="ghost-action small" href={`/ejaza/${programs.find((program) => program.id === selectedProgramId)?.slug || ''}`} target="_blank" rel="noreferrer">فتح الاستمارة العامة</a>}
      </section>
      <div className="gh-admin-tabs">
        <button className={section === 'submissions' ? 'active' : ''} onClick={() => setSection('submissions')} type="button">الطلبات والإصدارات</button>
        <button className={section === 'templates' ? 'active' : ''} onClick={() => setSection('templates')} type="button">إدارة القوالب</button>
        <button className={section === 'programs' ? 'active' : ''} onClick={() => setSection('programs')} type="button"><Settings2 size={16} aria-hidden /> إعداد الدورات</button>
      </div>

      {section === 'submissions' && (
        <>
          <div className="gh-summary-grid">
            <div><strong>{summary.submissions}</strong><span>كل الطلبات</span></div>
            <div><strong>{summary.ijazah_eligible}</strong><span>مستحقو الإجازة</span></div>
            <div><strong>{summary.certificate_only}</strong><span>شهادة فقط</span></div>
            <div className={summary.generation_failures ? 'danger' : ''}><strong>{summary.generation_failures}</strong><span>فشل توليد</span></div>
          </div>
          <section className="tool-panel gh-admin-panel">
            <form className="gh-filter-bar" onSubmit={(event) => { event.preventDefault(); setPage(1); setAppliedSearch(filters.search.trim()); }}>
              <label className="search-field"><Search size={17} aria-hidden /><input value={filters.search} onChange={(event) => setFilters({ ...filters, search: event.target.value })} placeholder="بحث باسم المستفيد" /></label>
              <select aria-label="الجنس" value={filters.gender} onChange={(event) => { setPage(1); setFilters({ ...filters, gender: event.target.value }); }}><option value="">كل الأجناس</option><option value="male">ذكر</option><option value="female">أنثى</option></select>
              <select aria-label="عدد أيام الحضور" value={filters.attendance_count} onChange={(event) => { setPage(1); setFilters({ ...filters, attendance_count: event.target.value }); }}><option value="">كل الحضور</option><option value="0">0 أيام</option><option value="1">يوم واحد</option><option value="2">يومان</option><option value="3">3 أيام</option></select>
              <select aria-label="الاستحقاق" value={filters.eligibility} onChange={(event) => { setPage(1); setFilters({ ...filters, eligibility: event.target.value }); }}><option value="">كل الاستحقاقات</option><option value="ijazah_and_certificate">إجازة وشهادة</option><option value="certificate_only">شهادة فقط</option><option value="none">غير مستحق</option></select>
              <select aria-label="حالة التوليد" value={filters.generation_status} onChange={(event) => { setPage(1); setFilters({ ...filters, generation_status: event.target.value }); }}><option value="">كل حالات التوليد</option><option value="completed">تم التوليد</option><option value="failed">فشل</option><option value="processing">قيد التوليد</option><option value="not_required">لا يلزم</option></select>
              <button className="secondary-action small" type="submit">تطبيق البحث</button>
            </form>
            {loading && <div className="gh-inline-loader"><Loader2 className="spin" size={20} aria-hidden /> جاري التحميل…</div>}
            <div className="responsive-table">
              <table>
                <thead><tr><th>المستفيد</th><th>الجنس</th><th>الحضور</th><th>الاستحقاق</th><th>تاريخ الطلب</th><th>التوليد</th><th>إجراء</th></tr></thead>
                <tbody>
                  {rows.map((row) => (
                    <tr key={row.id}>
                      <td><strong>{row.full_name}</strong></td><td>{row.gender === 'male' ? 'ذكر' : 'أنثى'}</td>
                      <td title={attendanceText(row)}>{row.attendance_count}/3</td><td>{eligibilityText(row.eligibility)}</td>
                      <td>{new Date(row.submitted_at).toLocaleString('ar-LB')}</td>
                      <td><span className={`gh-status ${row.generation_status}`}>{generationText(row.generation_status)}</span></td>
                      <td><button className="ghost-action small" type="button" onClick={() => showDetails(row)}>التفاصيل</button></td>
                    </tr>
                  ))}
                  {!rows.length && !loading && <tr><td colSpan={7}>لا توجد طلبات مطابقة.</td></tr>}
                </tbody>
              </table>
            </div>
            <div className="gh-pagination"><button className="ghost-action small" disabled={page <= 1} onClick={() => setPage(page - 1)} type="button"><ChevronRight size={16} aria-hidden /> السابق</button><span>صفحة {page} من {pages} - {count} طلبًا</span><button className="ghost-action small" disabled={page >= pages} onClick={() => setPage(page + 1)} type="button">التالي <ChevronLeft size={16} aria-hidden /></button></div>
          </section>

          {selected && (
            <section className="tool-panel gh-details">
              <div className="section-heading compact"><span className="section-kicker">تفاصيل الطلب</span><h3>{selected.full_name}</h3></div>
              <div className="details-grid">
                <span>الجنس: {selected.gender === 'male' ? 'ذكر' : 'أنثى'}</span><span>الحضور: {selected.attendance_count}/3</span>
                <span>الاستحقاق: {eligibilityText(selected.eligibility)}</span><span>التوليد: {generationText(selected.generation_status)}</span>
              </div>
              <p className="gh-attendance-detail">{attendanceText(selected)}</p>
              {selected.generation_error && <div className="gh-alert error"><AlertTriangle size={18} aria-hidden />{selected.generation_error}</div>}
              <div className="gh-admin-documents">
                {(selected.documents || []).map((document) => (
                  <div key={document.id}><span><strong>{documentLabels[document.document_type]}</strong><small>{document.generation_status === 'issued' ? `صدر ${document.issued_at ? new Date(document.issued_at).toLocaleString('ar-LB') : ''}` : document.generation_error || 'غير جاهز'}</small></span><div className="item-actions"><button className="ghost-action small" disabled={document.generation_status !== 'issued'} onClick={() => openDocument(document, false)} type="button"><Eye size={16} aria-hidden /> معاينة</button><button className="secondary-action small" disabled={document.generation_status !== 'issued'} onClick={() => openDocument(document, true)} type="button"><Download size={16} aria-hidden /> تنزيل</button></div></div>
                ))}
                {!(selected.documents || []).length && <p>لم يصدر أي مستند لهذا الطلب.</p>}
              </div>
              <div className="item-actions"><button className="secondary-action" disabled={loading || !['failed', 'pending'].includes(selected.generation_status)} onClick={() => retry(selected)} type="button"><RefreshCw size={17} aria-hidden /> إعادة محاولة التوليد</button><button className="ghost-action" onClick={() => setSelected(null)} type="button">إغلاق التفاصيل</button></div>
            </section>
          )}
        </>
      )}

      {section === 'templates' && (
        <>
          <div className="gh-template-status">
            {Object.keys(templateLabels).map((type) => {
              const active = activeTemplates.find((template) => template.template_type === type);
              return <div key={type} className={active ? 'ready' : 'missing'}>{active ? <CheckCircle2 size={19} aria-hidden /> : <AlertTriangle size={19} aria-hidden />}<span><strong>{templateLabels[type as GhawthaniDocumentType]}</strong><small>{active ? `النسخة ${active.version_number} مفعّلة` : 'لا توجد نسخة مفعّلة'}</small></span>{active && <button className="ghost-action small" onClick={() => chooseTemplate(active)} type="button">إدارة</button>}</div>;
            })}
          </div>

          <div className="gh-template-grid">
            <section className="tool-panel">
              <div className="section-heading compact"><span className="section-kicker">نسخة جديدة</span><h3>رفع قالب PDF</h3><p>يُحفظ القالب كنسخة غير مفعّلة حتى توليد عينة وفحصها.</p></div>
              <form className="gh-template-form" onSubmit={uploadTemplate}>
                <label className="field full"><span>غرض القالب</span><select value={templateType} onChange={(event) => changeTemplateType(event.target.value as GhawthaniDocumentType)}>{Object.entries(templateLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
                <label className="field full"><span>ملف PDF</span><input type="file" accept="application/pdf,.pdf" onChange={(event) => setTemplateFile(event.target.files?.[0] || null)} /></label>
                <PlacementFields placement={placement} setPlacement={setPlacement} />
                <button className="primary-action" disabled={loading || !templateFile} type="submit">{loading ? <Loader2 className="spin" size={17} aria-hidden /> : <FileUp size={17} aria-hidden />} رفع نسخة القالب</button>
              </form>
            </section>

            <section className="tool-panel">
              <div className="section-heading compact"><span className="section-kicker">النسخ المحفوظة</span><h3>القوالب والإصدارات</h3></div>
              <div className="gh-template-list">
                {templates.map((template) => <button type="button" key={template.id} className={`${selectedTemplate?.id === template.id ? 'selected' : ''}`} onClick={() => chooseTemplate(template)}><FileCog size={18} aria-hidden /><span><strong>{templateLabels[template.template_type]} - النسخة {template.version_number}</strong><small>{template.is_active ? 'مفعّلة' : template.is_validated ? 'مفحوصة وغير مفعّلة' : 'بانتظار الفحص'} · {new Date(template.created_at).toLocaleDateString('ar-LB')}</small></span></button>)}
                {!templates.length && !loading && <p>لا توجد قوالب. ارفع القوالب الأصلية الثلاثة للبدء.</p>}
              </div>
            </section>
          </div>

          {selectedTemplate && (
            <section className="tool-panel gh-template-editor">
              <div className="section-heading compact"><span className="section-kicker">ضبط وفحص</span><h3>{templateLabels[selectedTemplate.template_type]} - النسخة {selectedTemplate.version_number}</h3><p>الإحداثيات بوحدة نقطة PDF ومن الزاوية السفلية اليسرى للصفحة. أبعاد الصفحة {Number(selectedTemplate.page_width).toFixed(1)} × {Number(selectedTemplate.page_height).toFixed(1)} نقطة.</p></div>
              <div className="gh-template-preview"><iframe title="معاينة القالب الحالي" src={selectedTemplate.preview_url} /><a className="secondary-action small" href={selectedTemplate.preview_url} target="_blank" rel="noreferrer"><Eye size={16} aria-hidden /> فتح القالب في نافذة</a></div>
              <PlacementFields placement={placement} setPlacement={setPlacement} />
              <div className="item-actions"><button className="secondary-action" onClick={saveConfig} disabled={loading} type="button">حفظ موضع الاسم {selectedTemplate.is_active ? 'كنسخة جديدة' : ''}</button></div>
              <div className="gh-sample-controls"><label className="field"><span>اسم عربي للاختبار</span><input value={sampleName} onChange={(event) => setSampleName(event.target.value)} /></label><button className="primary-action" onClick={generateSample} disabled={loading} type="button">إنشاء عينة</button></div>
              {sampleUrl && <div className="gh-sample-preview"><iframe title="عينة الاسم على القالب" src={sampleUrl} /><div className="item-actions"><a className="secondary-action" href={sampleUrl} target="_blank" rel="noreferrer"><Eye size={17} aria-hidden /> فحص العينة بالحجم الكامل</a><button className="primary-action" onClick={validateTemplate} disabled={loading || selectedTemplate.is_validated} type="button"><CheckCircle2 size={17} aria-hidden /> اعتماد نتيجة العينة</button></div></div>}
              <div className="gh-activation"><span>{selectedTemplate.is_active ? 'هذه النسخة مفعّلة حاليًا.' : selectedTemplate.is_validated ? 'العينة معتمدة والنسخة جاهزة للتفعيل.' : 'يجب إنشاء عينة وفحصها واعتمادها قبل التفعيل.'}</span><button className="primary-action" onClick={activateTemplate} disabled={loading || selectedTemplate.is_active || !selectedTemplate.is_validated} type="button">تفعيل هذه النسخة</button></div>
            </section>
          )}
        </>
      )}

      {section === 'programs' && (
        <div className="gh-programs-grid">
          <section className="tool-panel">
            <div className="section-heading compact"><span className="section-kicker">{programForm.id ? 'تعديل البرنامج' : 'برنامج جديد'}</span><h3>ربط الإجازات والشهادات بدورة</h3><p>لكل برنامج رابط عام وقوالب وطلبات مستقلة.</p></div>
            <form className="gh-program-form" onSubmit={saveProgram}>
              <label className="field full"><span>الدورة في المنصة</span><select value={programForm.dawra_id} onChange={(event) => chooseDawra(event.target.value)}><option value="">برنامج مستقل</option>{dawrat.map((dawra) => <option key={dawra.id} value={dawra.id}>{dawra.title}</option>)}</select></label>
              <label className="field full"><span>عنوان قسم الإجازة والشهادة</span><input required value={programForm.title} onChange={(event) => setProgramForm({ ...programForm, title: event.target.value })} /></label>
              <label className="field"><span>الرابط المختصر بالإنجليزية</span><input dir="ltr" required pattern="[a-z0-9]+(?:-[a-z0-9]+)*" placeholder="course-2026" value={programForm.slug} onChange={(event) => setProgramForm({ ...programForm, slug: event.target.value.toLowerCase().replace(/\s+/g, '-') })} /></label>
              <label className="field"><span>اسم المحاضر</span><input required value={programForm.instructor_name} onChange={(event) => setProgramForm({ ...programForm, instructor_name: event.target.value })} /></label>
              <label className="field full"><span>موضوع الدورة أو الكتاب</span><input required value={programForm.course_subject} onChange={(event) => setProgramForm({ ...programForm, course_subject: event.target.value })} /></label>
              <label className="field full"><span>مقدمة الاستمارة</span><textarea rows={3} value={programForm.introduction} onChange={(event) => setProgramForm({ ...programForm, introduction: event.target.value })} /></label>
              <label className="field full"><span>بيان الأمانة والثقة</span><textarea rows={2} value={programForm.trust_statement} onChange={(event) => setProgramForm({ ...programForm, trust_statement: event.target.value })} /></label>
              <label className="gh-acknowledgment full"><input type="checkbox" checked={programForm.is_active} onChange={(event) => setProgramForm({ ...programForm, is_active: event.target.checked })} /><span>الاستمارة العامة مفعّلة</span></label>
              <div className="item-actions full"><button className="primary-action" disabled={loading} type="submit">{programForm.id ? 'حفظ التعديلات' : 'إنشاء البرنامج'}</button>{programForm.id && <button className="ghost-action" type="button" onClick={() => setProgramForm({ id: '', dawra_id: '', slug: '', title: '', course_subject: '', instructor_name: '', introduction: '', trust_statement: 'تُعتمد إجابات الحضور على الأمانة العلمية والثقة.', is_active: true })}>إلغاء التعديل</button>}</div>
            </form>
          </section>
          <section className="tool-panel">
            <div className="section-heading compact"><span className="section-kicker">البرامج المحفوظة</span><h3>الدورات المرتبطة</h3></div>
            <div className="gh-program-list">
              {programs.map((program) => <article key={program.id}><div><strong>{program.title}</strong><small>{program.course_subject} · {program.instructor_name}</small><code dir="ltr">/ejaza/{program.slug}</code></div><div className="item-actions"><span className={`gh-status ${program.is_active ? 'completed' : 'not_required'}`}>{program.is_active ? 'مفعّل' : 'متوقف'}</span><button className="ghost-action small" type="button" onClick={() => editProgram(program)}>تعديل</button></div></article>)}
            </div>
          </section>
        </div>
      )}
    </div>
  );
}

function PlacementFields({ placement, setPlacement }: { placement: typeof defaultPlacements.ijazah_male; setPlacement: (value: typeof defaultPlacements.ijazah_male) => void }) {
  const numberField = (key: keyof typeof placement, label: string, step = '0.5') => (
    <label className="field"><span>{label}</span><input type="number" step={step} value={placement[key]} onChange={(event) => setPlacement({ ...placement, [key]: Number(event.target.value) })} /></label>
  );
  return <div className="gh-placement-grid">{numberField('page_index', 'رقم الصفحة', '1')}{numberField('name_x', 'X')}{numberField('name_y', 'Y')}{numberField('name_width', 'عرض المنطقة')}{numberField('name_height', 'ارتفاع المنطقة')}{numberField('font_size', 'حجم الخط')}{numberField('min_font_size', 'أدنى حجم')}<label className="field"><span>لون الخط</span><input type="color" value={placement.font_color} onChange={(event) => setPlacement({ ...placement, font_color: event.target.value })} /></label><label className="field"><span>المحاذاة</span><select value={placement.alignment} onChange={(event) => setPlacement({ ...placement, alignment: event.target.value as 'center' | 'right' | 'left' })}><option value="center">وسط</option><option value="right">يمين</option><option value="left">يسار</option></select></label></div>;
}
