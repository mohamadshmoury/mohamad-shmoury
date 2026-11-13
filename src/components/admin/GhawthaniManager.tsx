import {
  AlertTriangle,
  Award,
  Ban,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Copy,
  Download,
  Eye,
  FileCog,
  FileUp,
  Loader2,
  PowerOff,
  RefreshCw,
  RotateCcw,
  Search,
  Settings2,
  ShieldCheck,
  Trash2,
  UserPlus,
  XCircle,
} from 'lucide-react';
import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import {
  computeProgramAvailability,
  documentLabels,
  fileAsBase64,
  ghawthaniAdmin,
  type GhawthaniDocument,
  type GhawthaniDocumentType,
  type GhawthaniFontFamily,
  type GhawthaniSubmission,
  type GhawthaniSummary,
  type GhawthaniTemplate,
  type IjazahEligibilityMethod,
  type IjazahEntitlement,
  type IjazahProgram,
} from '../../lib/ghawthaniService';
import type { Dawra } from '../../types';

export type GhawthaniAdminSection = 'eligibility' | 'submissions' | 'issued' | 'templates' | 'programs';

interface Props {
  adminToken: string;
  dawrat: Dawra[];
  selectedDawraId?: string;
  requestedSection?: GhawthaniAdminSection;
  onRequestedSectionHandled?: () => void;
  setNotice: (value: string) => void;
  setError: (value: string) => void;
  onSessionExpired: () => void;
}

type Filters = {
  search: string;
  gender: string;
  attendance_count: string;
  eligibility: string;
  generation_status: string;
  approval_status: string;
  revoked: string;
};

const templateLabels: Record<GhawthaniDocumentType, string> = {
  ijazah_male: 'إجازة الذكور',
  ijazah_female: 'إجازة الإناث',
  participation_certificate: 'شهادة المشاركة والحضور',
};

const fontFamilyLabels: Record<GhawthaniFontFamily, string> = {
  noto_naskh: 'Noto Naskh Arabic — نسخ واضح',
  amiri: 'Amiri — نسخ كلاسيكي',
  aref_ruqaa: 'Aref Ruqaa — خط الرقعة',
};

const defaultPlacements: Record<
  GhawthaniDocumentType,
  Pick<
    GhawthaniTemplate,
    'page_index' | 'name_x' | 'name_y' | 'name_width' | 'name_height' | 'font_size' | 'min_font_size' | 'font_color' | 'font_family' | 'alignment'
  >
> = {
  ijazah_male: {
    page_index: 0,
    name_x: 92,
    name_y: 452,
    name_width: 295,
    name_height: 34,
    font_size: 21,
    min_font_size: 11,
    font_color: '#171717',
    font_family: 'amiri',
    alignment: 'center',
  },
  ijazah_female: {
    page_index: 0,
    name_x: 92,
    name_y: 452,
    name_width: 295,
    name_height: 34,
    font_size: 21,
    min_font_size: 11,
    font_color: '#171717',
    font_family: 'amiri',
    alignment: 'center',
  },
  participation_certificate: {
    page_index: 0,
    name_x: 145,
    name_y: 382,
    name_width: 552,
    name_height: 50,
    font_size: 28,
    min_font_size: 14,
    font_color: '#171717',
    font_family: 'aref_ruqaa',
    alignment: 'center',
  },
};

function attendanceText(row: GhawthaniSubmission) {
  return [row.attended_day_1, row.attended_day_2, row.attended_day_3]
    .map((yes, index) => `اليوم ${index + 1}: ${yes ? 'نعم' : 'لا'}`)
    .join('، ');
}

function eligibilityText(value: string) {
  if (value === 'ijazah_and_certificate') return 'إجازة وشهادة';
  if (value === 'certificate_only') return 'شهادة فقط';
  return 'غير مستحق';
}

function submissionEligibilityText(row: GhawthaniSubmission) {
  if (row.certificate_eligible != null || row.ijazah_eligible != null) {
    if (row.certificate_eligible && row.ijazah_eligible) return 'إجازة وشهادة';
    if (row.ijazah_eligible) return 'إجازة فقط';
    if (row.certificate_eligible) return 'شهادة فقط';
    return 'غير مستحق';
  }
  return eligibilityText(row.eligibility);
}

function approvalText(status?: string) {
  if (status === 'pending_approval') return 'بانتظار الموافقة';
  if (status === 'rejected') return 'مرفوض';
  return 'معتمد';
}

function approvalBadgeClass(status?: string) {
  if (status === 'pending_approval') return 'pending';
  if (status === 'rejected') return 'failed';
  return 'completed';
}

function toLocalDateTime(value: string | null | undefined) {
  if (!value) return '';
  const date = new Date(value);
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 16);
}

const emptyProgramForm = {
  id: '',
  dawra_id: '',
  slug: '',
  title: '',
  course_subject: '',
  instructor_name: '',
  introduction: '',
  trust_statement: 'تُعتمد إجابات الحضور على الأمانة العلمية والثقة.',
  is_active: true,
  offers_certificate: true,
  offers_ijazah: true,
  eligibility_method: 'legacy_attendance' as IjazahEligibilityMethod,
  requires_approval: false,
  available_from: '',
  available_until: '',
};

function generationText(value: string) {
  return (
    ({
      pending: 'بانتظار التوليد',
      processing: 'قيد التوليد',
      completed: 'تم التوليد',
      failed: 'فشل التوليد',
      not_required: 'لا يلزم توليد',
    } as Record<string, string>)[value] || value
  );
}

function availabilityLabel(program: IjazahProgram) {
  const availability = computeProgramAvailability(program);
  if (availability.state === 'available') return { text: 'الإتاحة مفتوحة للطلبات الجديدة', badgeClass: 'completed' };
  if (availability.state === 'scheduled') return { text: 'مجدول — لم تبدأ فترة الإتاحة بعد', badgeClass: 'pending' };
  if (availability.state === 'expired') return { text: 'انتهت فترة الإتاحة للطلبات الجديدة', badgeClass: 'not_required' };
  return { text: 'متوقف إداريًا للطلبات الجديدة', badgeClass: 'failed' };
}

function isTemplateRequiredForProgram(program: IjazahProgram | undefined, type: GhawthaniDocumentType) {
  if (!program) return true;
  if (type === 'participation_certificate') return program.offers_certificate;
  return program.offers_ijazah;
}

export default function GhawthaniManager({
  adminToken,
  dawrat,
  selectedDawraId,
  requestedSection,
  onRequestedSectionHandled,
  setNotice,
  setError,
  onSessionExpired,
}: Props) {
  const [section, setSection] = useState<GhawthaniAdminSection>('submissions');
  const [programs, setPrograms] = useState<IjazahProgram[]>([]);
  const [selectedProgramId, setSelectedProgramId] = useState('');
  const [programForm, setProgramForm] = useState(emptyProgramForm);
  const [entitlements, setEntitlements] = useState<IjazahEntitlement[]>([]);
  const [manualGrant, setManualGrant] = useState({
    full_name: '',
    gender: '' as '' | 'male' | 'female',
    certificate_eligible: true,
    ijazah_eligible: false,
  });
  const [rows, setRows] = useState<GhawthaniSubmission[]>([]);
  const [summary, setSummary] = useState<GhawthaniSummary>({
    submissions: 0,
    ijazah_eligible: 0,
    certificate_only: 0,
    generation_failures: 0,
    pending_approvals: 0,
    revoked_count: 0,
  });
  const [filters, setFilters] = useState<Filters>({
    search: '',
    gender: '',
    attendance_count: '',
    eligibility: '',
    generation_status: '',
    approval_status: '',
    revoked: '',
  });
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

  function reportAdminError(caught: unknown, fallback: string) {
    const message = caught instanceof Error ? caught.message : fallback;
    if (message.includes('انتهت جلسة الإدارة') || message.includes('غير صالحة')) {
      onSessionExpired();
      return;
    }
    setError(message);
  }

  const chooseDawra = useCallback(
    (dawraId: string) => {
      const dawra = dawrat.find((item) => item.id === dawraId);
      const suggestedSlug = dawraId ? `course-${dawraId.slice(0, 8).toLowerCase()}` : '';
      setProgramForm((current) => ({
        ...current,
        dawra_id: dawraId,
        slug: current.slug || suggestedSlug,
        title: current.title || (dawra ? `إجازة وشهادة ${dawra.title}` : ''),
        course_subject: current.course_subject || dawra?.title || '',
        instructor_name: current.instructor_name || 'الشيخ محمد أحمد الشموري',
        introduction: current.introduction || (dawra ? `هذه الاستمارة خاصة بدورة ${dawra.title}.` : ''),
      }));
    },
    [dawrat],
  );

  const editProgram = useCallback((program: IjazahProgram) => {
    setProgramForm({
      id: program.id,
      dawra_id: program.dawra_id || '',
      slug: program.slug,
      title: program.title,
      course_subject: program.course_subject,
      instructor_name: program.instructor_name,
      introduction: program.introduction,
      trust_statement: program.trust_statement,
      is_active: program.is_active,
      offers_certificate: program.offers_certificate,
      offers_ijazah: program.offers_ijazah,
      eligibility_method: program.eligibility_method,
      requires_approval: Boolean(program.requires_approval),
      available_from: toLocalDateTime(program.available_from),
      available_until: toLocalDateTime(program.available_until),
    });
    setSection('programs');
  }, []);

  const loadPrograms = useCallback(async () => {
    setLoading(true);
    try {
      const result = await ghawthaniAdmin<{ programs: IjazahProgram[] }>(adminToken, 'list_programs');
      setPrograms(result.programs);
      setSelectedProgramId((current) => current || result.programs[0]?.id || '');
    } catch (caught) {
      reportAdminError(caught, 'تعذر تحميل برامج الإجازات والشهادات.');
    } finally {
      setLoading(false);
    }
  }, [adminToken, setError]);

  useEffect(() => {
    if (!programs.length) return;
    if (selectedDawraId) {
      const matching = programs.find(
        (program) =>
          program.dawra_id === selectedDawraId
          || (!program.dawra_id && program.slug === 'ghawthani' && dawrat.find((d) => d.id === selectedDawraId)?.title.includes('الغوثاني')),
      );
      if (matching) {
        setSelectedProgramId(matching.id);
        if (requestedSection === 'programs') {
          editProgram(matching);
        } else if (requestedSection) {
          setSection(requestedSection);
        }
      } else if (requestedSection) {
        setProgramForm({
          ...emptyProgramForm,
          dawra_id: selectedDawraId,
        });
        chooseDawra(selectedDawraId);
        setSection('programs');
      }
      if (requestedSection && onRequestedSectionHandled) {
        onRequestedSectionHandled();
      }
    } else if (requestedSection) {
      setSection(requestedSection);
      onRequestedSectionHandled?.();
    }
  }, [chooseDawra, dawrat, editProgram, onRequestedSectionHandled, programs, requestedSection, selectedDawraId]);

  const loadRows = useCallback(async () => {
    if (!selectedProgramId) return;
    setLoading(true);
    setError('');
    const isIssuedView = section === 'issued';
    try {
      const result = await ghawthaniAdmin<{ rows: GhawthaniSubmission[]; count: number; summary: GhawthaniSummary }>(
        adminToken,
        'list_submissions',
        {
          page,
          program_id: selectedProgramId,
          page_size: pageSize,
          search: isIssuedView ? '' : appliedSearch,
          gender: isIssuedView ? '' : filters.gender,
          attendance_count: isIssuedView || filters.attendance_count === '' ? undefined : Number(filters.attendance_count),
          eligibility: isIssuedView ? '' : filters.eligibility,
          generation_status: isIssuedView ? 'completed' : filters.generation_status,
          approval_status: isIssuedView ? '' : filters.approval_status,
          revoked: isIssuedView ? '' : filters.revoked,
        },
      );
      setRows(result.rows);
      setCount(result.count);
      setSummary(result.summary);
      setSelected((current) => (
        current ? result.rows.find((row) => row.id === current.id) || null : null
      ));
    } catch (caught) {
      reportAdminError(caught, 'تعذر تحميل الطلبات والإصدارات.');
    } finally {
      setLoading(false);
    }
  }, [
    adminToken,
    appliedSearch,
    filters.approval_status,
    filters.attendance_count,
    filters.eligibility,
    filters.gender,
    filters.generation_status,
    filters.revoked,
    page,
    section,
    selectedProgramId,
    setError,
  ]);

  const loadTemplates = useCallback(async () => {
    if (!selectedProgramId) return;
    setLoading(true);
    setError('');
    try {
      const result = await ghawthaniAdmin<{ templates: GhawthaniTemplate[] }>(adminToken, 'list_templates', {
        program_id: selectedProgramId,
      });
      setTemplates(result.templates);
      if (selectedTemplate) setSelectedTemplate(result.templates.find((item) => item.id === selectedTemplate.id) || null);
    } catch (caught) {
      reportAdminError(caught, 'تعذر تحميل القوالب.');
    } finally {
      setLoading(false);
    }
  }, [adminToken, selectedProgramId, selectedTemplate, setError]);

  const loadEntitlements = useCallback(async () => {
    if (!selectedProgramId) return;
    setLoading(true);
    setError('');
    try {
      const result = await ghawthaniAdmin<{ rows: IjazahEntitlement[] }>(adminToken, 'list_entitlements', {
        program_id: selectedProgramId,
      });
      setEntitlements(result.rows);
    } catch (caught) {
      reportAdminError(caught, 'تعذر تحميل قائمة المستحقين.');
    } finally {
      setLoading(false);
    }
  }, [adminToken, selectedProgramId, setError]);

  useEffect(() => {
    void loadPrograms();
  }, [loadPrograms]);

  const selectedProgram = useMemo(
    () => programs.find((program) => program.id === selectedProgramId),
    [programs, selectedProgramId],
  );

  useEffect(() => {
    if (!selectedProgram) return;
    setManualGrant((current) => ({
      ...current,
      certificate_eligible: selectedProgram.offers_certificate,
      ijazah_eligible: !selectedProgram.offers_certificate && selectedProgram.offers_ijazah,
    }));
  }, [selectedProgram]);

  useEffect(() => {
    if (section === 'submissions' || section === 'issued') {
      void loadRows();
    } else if (section === 'templates') {
      void loadTemplates();
    } else if (section === 'eligibility') {
      void loadEntitlements();
      if (selectedProgram?.eligibility_method === 'legacy_attendance') {
        void loadRows();
      }
    }
    // selected entities are intentionally excluded to avoid refetch loops.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    section,
    page,
    appliedSearch,
    filters.gender,
    filters.attendance_count,
    filters.eligibility,
    filters.generation_status,
    filters.approval_status,
    filters.revoked,
    adminToken,
    selectedProgramId,
    selectedProgram?.eligibility_method,
  ]);

  const pages = Math.max(1, Math.ceil(count / pageSize));
  const activeTemplates = useMemo(() => templates.filter((template) => template.is_active), [templates]);
  const readyTemplates = useMemo(
    () => templates.filter((template) => template.is_active && template.is_validated),
    [templates],
  );

  const issuedDocumentRows = useMemo(() => {
    const items: Array<{ submission: GhawthaniSubmission; document: GhawthaniDocument }> = [];
    for (const submission of rows) {
      for (const document of submission.documents || []) {
        if (document.generation_status === 'issued') {
          items.push({ submission, document });
        }
      }
    }
    return items;
  }, [rows]);

  async function showDetails(row: GhawthaniSubmission) {
    setLoading(true);
    try {
      const result = await ghawthaniAdmin<{ submission: GhawthaniSubmission }>(adminToken, 'submission_details', {
        submission_id: row.id,
      });
      setSelected(result.submission);
    } catch (caught) {
      reportAdminError(caught, 'تعذر تحميل التفاصيل.');
    } finally {
      setLoading(false);
    }
  }

  async function retry(row: GhawthaniSubmission) {
    setLoading(true);
    setError('');
    try {
      const result = await ghawthaniAdmin<{ submission: GhawthaniSubmission }>(adminToken, 'retry', {
        submission_id: row.id,
      });
      setSelected(result.submission);
      setNotice('اكتملت إعادة محاولة توليد المستندات.');
      await loadRows();
    } catch (caught) {
      reportAdminError(caught, 'فشلت إعادة المحاولة.');
    } finally {
      setLoading(false);
    }
  }

  async function approveSubmission(row: GhawthaniSubmission) {
    setLoading(true);
    setError('');
    try {
      const result = await ghawthaniAdmin<{ submission: GhawthaniSubmission }>(adminToken, 'approve_submission', {
        submission_id: row.id,
      });
      setSelected(result.submission);
      setNotice('تم اعتماد الطلب وإصدار المستندات المستحقة.');
      await loadRows();
    } catch (caught) {
      reportAdminError(caught, 'تعذر اعتماد الطلب.');
    } finally {
      setLoading(false);
    }
  }

  async function rejectSubmission(row: GhawthaniSubmission) {
    const note = window.prompt('سبب رفض الطلب (اختياري):', row.approval_note || '');
    if (note === null) return;
    setLoading(true);
    setError('');
    try {
      const result = await ghawthaniAdmin<{ submission: GhawthaniSubmission }>(adminToken, 'reject_submission', {
        submission_id: row.id,
        note,
      });
      setSelected(result.submission);
      setNotice('تم رفض الطلب وإيقاف إصدار مستنداته.');
      await loadRows();
    } catch (caught) {
      reportAdminError(caught, 'تعذر رفض الطلب.');
    } finally {
      setLoading(false);
    }
  }

  async function revokeSubmission(row: GhawthaniSubmission) {
    if (!window.confirm(`إلغاء صلاحية المستندات الصادرة لـ «${row.full_name}»؟ يوقف تنزيلها فورًا مع حفظ سجل الإصدار.`)) {
      return;
    }
    setLoading(true);
    setError('');
    try {
      const result = await ghawthaniAdmin<{ submission: GhawthaniSubmission }>(adminToken, 'revoke_submission', {
        submission_id: row.id,
        reason: 'تم إلغاء صلاحية المستند من قبل الإدارة.',
      });
      setSelected(result.submission);
      setNotice('تم إلغاء صلاحية المستندات وإيقاف تنزيلها للمشارك.');
      await loadRows();
    } catch (caught) {
      reportAdminError(caught, 'تعذر إلغاء صلاحية المستندات.');
    } finally {
      setLoading(false);
    }
  }

  async function restoreSubmission(row: GhawthaniSubmission) {
    setLoading(true);
    setError('');
    try {
      const result = await ghawthaniAdmin<{ submission: GhawthaniSubmission }>(adminToken, 'restore_submission', {
        submission_id: row.id,
      });
      setSelected(result.submission);
      setNotice('تمت إعادة تفعيل صلاحية المستندات للمشارك.');
      await loadRows();
    } catch (caught) {
      reportAdminError(caught, 'تعذر إعادة تفعيل الصلاحية.');
    } finally {
      setLoading(false);
    }
  }

  async function openDocument(document: GhawthaniDocument, download: boolean) {
    try {
      const result = await ghawthaniAdmin<{ url: string }>(adminToken, 'document_url', {
        document_id: document.id,
        download,
      });
      window.open(result.url, '_blank', 'noopener,noreferrer');
    } catch (caught) {
      reportAdminError(caught, 'تعذر فتح المستند.');
    }
  }

  function chooseTemplate(template: GhawthaniTemplate) {
    setSelectedTemplate(template);
    setTemplateType(template.template_type);
    setPlacement({
      page_index: Number(template.page_index),
      name_x: Number(template.name_x),
      name_y: Number(template.name_y),
      name_width: Number(template.name_width),
      name_height: Number(template.name_height),
      font_size: Number(template.font_size),
      min_font_size: Number(template.min_font_size),
      font_color: template.font_color,
      font_family: template.font_family || 'noto_naskh',
      alignment: template.alignment,
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
      reportAdminError(caught, 'تعذر رفع القالب.');
    } finally {
      setLoading(false);
    }
  }

  async function saveConfig() {
    if (!selectedTemplate) return;
    setLoading(true);
    try {
      const result = await ghawthaniAdmin<{ template: GhawthaniTemplate; created_new_version: boolean }>(
        adminToken,
        'save_template_config',
        {
          template_id: selectedTemplate.id,
          ...placement,
        },
      );
      setSelectedTemplate(result.template);
      setSampleUrl('');
      setNotice(
        result.created_new_version
          ? 'حُفظ الضبط كنسخة جديدة للمحافظة على أثر النسخة المفعّلة.'
          : 'حُفظ موضع الاسم. يلزم إعادة فحص عينة.',
      );
      await loadTemplates();
    } catch (caught) {
      reportAdminError(caught, 'تعذر حفظ موضع الاسم.');
    } finally {
      setLoading(false);
    }
  }

  async function generateSample() {
    if (!selectedTemplate) return;
    setLoading(true);
    setError('');
    try {
      const result = await ghawthaniAdmin<{ sample_url: string; template: GhawthaniTemplate }>(adminToken, 'generate_sample', {
        template_id: selectedTemplate.id,
        sample_name: sampleName,
      });
      setSampleUrl(result.sample_url);
      setSelectedTemplate(result.template);
      setNotice(
        selectedTemplate.is_active
          ? 'تم إنشاء العينة وإيقاف تفعيل النسخة مؤقتًا. افحص العينة ثم اعتمدها وأعد التفعيل.'
          : 'تم إنشاء العينة. افحصها بصريًا ثم اعتمد النتيجة إذا كانت صحيحة.',
      );
      await loadTemplates();
    } catch (caught) {
      reportAdminError(caught, 'تعذر إنشاء العينة.');
    } finally {
      setLoading(false);
    }
  }

  async function validateTemplate() {
    if (!selectedTemplate || !sampleUrl) return;
    setLoading(true);
    try {
      const result = await ghawthaniAdmin<{ template: GhawthaniTemplate }>(adminToken, 'validate_template', {
        template_id: selectedTemplate.id,
      });
      setSelectedTemplate(result.template);
      setNotice('تم اعتماد نتيجة العينة. يمكن الآن تفعيل هذه النسخة.');
      await loadTemplates();
    } catch (caught) {
      reportAdminError(caught, 'تعذر اعتماد القالب.');
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
      reportAdminError(caught, 'تعذر تفعيل القالب.');
    } finally {
      setLoading(false);
    }
  }

  async function deactivateAllTemplates() {
    if (
      !activeTemplates.length
      || !window.confirm('هل تريد إلغاء تفعيل جميع القوالب الحالية؟ لن يؤثر ذلك في المستندات الصادرة سابقًا.')
    ) {
      return;
    }
    setLoading(true);
    setError('');
    try {
      const result = await ghawthaniAdmin<{ deactivated_count: number }>(adminToken, 'deactivate_templates', {
        program_id: selectedProgramId,
      });
      setNotice(`تم إلغاء تفعيل ${result.deactivated_count} قالب. يمكنك الآن رفع قوالبك وفحصها وتفعيلها.`);
      await loadTemplates();
    } catch (caught) {
      reportAdminError(caught, 'تعذر إلغاء تفعيل القوالب.');
    } finally {
      setLoading(false);
    }
  }

  async function deleteSelectedTemplate() {
    if (
      !selectedTemplate
      || !window.confirm(
        `حذف ${templateLabels[selectedTemplate.template_type]} - النسخة ${selectedTemplate.version_number}؟ لا يمكن التراجع عن هذا الإجراء.`,
      )
    ) {
      return;
    }
    setLoading(true);
    setError('');
    try {
      await ghawthaniAdmin(adminToken, 'delete_template', { template_id: selectedTemplate.id });
      setSelectedTemplate(null);
      setSampleUrl('');
      setNotice('تم حذف نسخة القالب وملفاتها.');
      await loadTemplates();
    } catch (caught) {
      reportAdminError(caught, 'تعذر حذف نسخة القالب.');
    } finally {
      setLoading(false);
    }
  }

  async function deleteSelectedSubmission() {
    if (
      !selected
      || !window.confirm(`حذف طلب ${selected.full_name} وجميع المستندات الصادرة له؟ لا يمكن التراجع عن هذا الإجراء.`)
    ) {
      return;
    }
    setLoading(true);
    setError('');
    try {
      const deletedId = selected.id;
      await ghawthaniAdmin(adminToken, 'delete_submission', { submission_id: deletedId });
      setRows((current) => current.filter((row) => row.id !== deletedId));
      setCount((current) => Math.max(0, current - 1));
      setSelected(null);
      setNotice('تم حذف الطلب ومستنداته.');
      if (page > 1 && rows.length === 1) {
        setPage((current) => Math.max(1, current - 1));
      } else {
        await loadRows();
      }
    } catch (caught) {
      reportAdminError(caught, 'تعذر حذف الطلب.');
    } finally {
      setLoading(false);
    }
  }

  async function saveProgram(event: FormEvent) {
    event.preventDefault();
    setLoading(true);
    setError('');
    try {
      const result = await ghawthaniAdmin<{ program: IjazahProgram }>(adminToken, 'save_program', {
        program_id: programForm.id || undefined,
        ...programForm,
        available_from: programForm.available_from ? new Date(programForm.available_from).toISOString() : null,
        available_until: programForm.available_until ? new Date(programForm.available_until).toISOString() : null,
      });
      setNotice(programForm.id ? 'تم تحديث إعداد البرنامج.' : 'تم إنشاء برنامج الإجازات والشهادات للدورة المختارة.');
      await loadPrograms();
      setSelectedProgramId(result.program.id);
      setProgramForm(emptyProgramForm);
    } catch (caught) {
      reportAdminError(caught, 'تعذر حفظ البرنامج.');
    } finally {
      setLoading(false);
    }
  }

  async function createManualEntitlement(event: FormEvent) {
    event.preventDefault();
    setLoading(true);
    setError('');
    try {
      const result = await ghawthaniAdmin<{ participant_url: string }>(adminToken, 'create_entitlement', {
        program_id: selectedProgramId,
        ...manualGrant,
      });
      const url = new URL(result.participant_url, window.location.origin).toString();
      try {
        await navigator.clipboard.writeText(url);
        setNotice('تمت إضافة المستفيد ونسخ رابطه الخاص.');
      } catch {
        setNotice(`تمت إضافة المستفيد. رابط الوصول: ${url}`);
      }
      setManualGrant({
        full_name: '',
        gender: '',
        certificate_eligible: selectedProgram?.offers_certificate !== false,
        ijazah_eligible: !selectedProgram?.offers_certificate && Boolean(selectedProgram?.offers_ijazah),
      });
      await loadEntitlements();
    } catch (caught) {
      reportAdminError(caught, 'تعذر إضافة المستفيد.');
    } finally {
      setLoading(false);
    }
  }

  async function copyEntitlementAccess(entitlement: IjazahEntitlement) {
    try {
      const result = await ghawthaniAdmin<{ participant_url: string }>(adminToken, 'entitlement_access', {
        entitlement_id: entitlement.id,
      });
      const url = new URL(result.participant_url, window.location.origin).toString();
      try {
        await navigator.clipboard.writeText(url);
        setNotice('تم نسخ رابط الوصول الخاص.');
      } catch {
        setNotice(`رابط الوصول الخاص: ${url}`);
      }
    } catch (caught) {
      reportAdminError(caught, 'تعذر نسخ رابط الوصول.');
    }
  }

  async function revokeEntitlement(entitlement: IjazahEntitlement) {
    if (!window.confirm(`إلغاء صلاحية ${entitlement.full_name}؟ يوقف الوصول ولا يحذف سجلات الإصدار.`)) return;
    try {
      await ghawthaniAdmin(adminToken, 'revoke_entitlement', { entitlement_id: entitlement.id });
      setNotice('تم إلغاء صلاحية الوصول مع الاحتفاظ بسجلات الإصدار.');
      await loadEntitlements();
    } catch (caught) {
      reportAdminError(caught, 'تعذر إلغاء الصلاحية.');
    }
  }

  async function restoreEntitlement(entitlement: IjazahEntitlement) {
    try {
      await ghawthaniAdmin(adminToken, 'restore_entitlement', { entitlement_id: entitlement.id });
      setNotice('تمت إعادة تفعيل صلاحية المستفيد.');
      await loadEntitlements();
    } catch (caught) {
      reportAdminError(caught, 'تعذر إعادة تفعيل الصلاحية.');
    }
  }

  const selectedAvailability = selectedProgram ? availabilityLabel(selectedProgram) : null;

  return (
    <div className="gh-admin">
      <section className="tool-panel gh-program-picker">
        <div>
          <span className="section-kicker">نطاق العمل</span>
          <h2>إجازات وشهادات</h2>
          <p>اختر الدورة أولًا؛ الإتاحة والأهلية والطلبات والموافقات والقوالب والإصدارات أدناه مستقلة لكل دورة.</p>
        </div>
        <label className="field">
          <span>برنامج الدورة</span>
          <select
            value={selectedProgramId}
            onChange={(event) => {
              setSelectedProgramId(event.target.value);
              setPage(1);
              setSelected(null);
              setSelectedTemplate(null);
            }}
          >
            {programs.map((program) => (
              <option key={program.id} value={program.id}>
                {program.title}
                {program.is_active ? '' : ' (متوقف)'}
              </option>
            ))}
          </select>
        </label>
        {selectedProgram?.eligibility_method === 'legacy_attendance' && (
          <a
            className="ghost-action small"
            href={selectedProgram.slug === 'ghawthani' ? '/ejazaGhawthani' : `/ejaza/${selectedProgram.slug}`}
            target="_blank"
            rel="noreferrer"
          >
            فتح استمارة الحضور
          </a>
        )}
      </section>

      <div className="gh-admin-tabs">
        <button
          className={section === 'eligibility' ? 'active' : ''}
          onClick={() => setSection('eligibility')}
          type="button"
        >
          <UserPlus size={16} aria-hidden /> المستحقون والإتاحة
        </button>
        <button
          className={section === 'submissions' ? 'active' : ''}
          onClick={() => setSection('submissions')}
          type="button"
        >
          الطلبات والإصدارات
        </button>
        <button
          className={section === 'issued' ? 'active' : ''}
          onClick={() => setSection('issued')}
          type="button"
        >
          <Award size={16} aria-hidden /> المستندات الصادرة
        </button>
        <button
          className={section === 'templates' ? 'active' : ''}
          onClick={() => setSection('templates')}
          type="button"
        >
          إدارة القوالب
        </button>
        <button
          className={section === 'programs' ? 'active' : ''}
          onClick={() => setSection('programs')}
          type="button"
        >
          <Settings2 size={16} aria-hidden /> إعداد الدورات
        </button>
      </div>

      {section === 'eligibility' && selectedProgram && (
        <div className="gh-eligibility-layout">
          <section className="tool-panel gh-eligibility-overview">
            <div className="section-heading compact">
              <span className="section-kicker">حالة الإتاحة والأهلية</span>
              <h3>{selectedProgram.title}</h3>
              <p>
                الإتاحة تحكم الطلبات الجديدة والإصدار فقط. المستندات الصادرة سابقًا تبقى قابلة للتنزيل بعد انتهاء المدة ما لم تُلغَ صلاحيتها صراحةً.
              </p>
            </div>
            <dl className="gh-config-summary">
              <div>
                <dt>حالة الإتاحة الحالية</dt>
                <dd>
                  <span className={`gh-status ${selectedAvailability?.badgeClass || 'completed'}`}>
                    {selectedAvailability?.text}
                  </span>
                </dd>
              </div>
              <div>
                <dt>المستندات المفعّلة</dt>
                <dd>
                  {[selectedProgram.offers_certificate && 'شهادة مشاركة', selectedProgram.offers_ijazah && 'إجازة']
                    .filter(Boolean)
                    .join(' و ')}
                </dd>
              </div>
              <div>
                <dt>مصدر الاستحقاق</dt>
                <dd>
                  {selectedProgram.eligibility_method === 'legacy_attendance'
                    ? 'إقرار حضور الغوثاني (3 أيام)'
                    : selectedProgram.eligibility_method === 'passed_exam'
                      ? 'النجاح في اختبار الدورة'
                      : 'إضافة يدوية من الإدارة'}
                </dd>
              </div>
              <div>
                <dt>آلية الاعتماد والإصدار</dt>
                <dd>{selectedProgram.requires_approval ? 'يتطلب موافقة الإدارة قبل الإصدار' : 'إصدار فوري عند استيفاء الشروط'}</dd>
              </div>
              <div>
                <dt>بداية الإتاحة</dt>
                <dd>
                  {selectedProgram.available_from
                    ? new Date(selectedProgram.available_from).toLocaleString('ar-LB')
                    : 'فورًا'}
                </dd>
              </div>
              <div>
                <dt>نهاية الإتاحة</dt>
                <dd>
                  {selectedProgram.available_until
                    ? new Date(selectedProgram.available_until).toLocaleString('ar-LB')
                    : 'مفتوحة دون تاريخ انتهاء'}
                </dd>
              </div>
            </dl>
            <button className="secondary-action" type="button" onClick={() => editProgram(selectedProgram)}>
              <Settings2 size={17} aria-hidden /> تعديل إعدادات الإتاحة والأهلية
            </button>
          </section>

          {selectedProgram.eligibility_method === 'manual' && (
            <section className="tool-panel">
              <div className="section-heading compact">
                <span className="section-kicker">استحقاق يدوي</span>
                <h3>إضافة مستفيد مؤهل</h3>
                <p>بعد الحفظ يُنسخ رابط وصول خاص للمستفيد. لا يلزم إنشاء حساب للمشارك.</p>
              </div>
              <form className="gh-manual-grant" onSubmit={createManualEntitlement}>
                <label className="field full">
                  <span>الاسم الكامل</span>
                  <input
                    required
                    minLength={3}
                    value={manualGrant.full_name}
                    onChange={(event) => setManualGrant({ ...manualGrant, full_name: event.target.value })}
                  />
                </label>
                <label className="field">
                  <span>الجنس</span>
                  <select
                    value={manualGrant.gender}
                    onChange={(event) => setManualGrant({ ...manualGrant, gender: event.target.value as 'male' | 'female' })}
                  >
                    <option value="">يحدده المستفيد عند الطلب</option>
                    <option value="male">ذكر</option>
                    <option value="female">أنثى</option>
                  </select>
                </label>
                <fieldset className="full">
                  <legend>نوع المستندات المؤهلة</legend>
                  {selectedProgram.offers_certificate && (
                    <label>
                      <input
                        type="checkbox"
                        checked={manualGrant.certificate_eligible}
                        onChange={(event) => setManualGrant({ ...manualGrant, certificate_eligible: event.target.checked })}
                      />{' '}
                      شهادة
                    </label>
                  )}
                  {selectedProgram.offers_ijazah && (
                    <label>
                      <input
                        type="checkbox"
                        checked={manualGrant.ijazah_eligible}
                        onChange={(event) => setManualGrant({ ...manualGrant, ijazah_eligible: event.target.checked })}
                      />{' '}
                      إجازة
                    </label>
                  )}
                </fieldset>
                <button className="primary-action" disabled={loading} type="submit">
                  <UserPlus size={17} aria-hidden /> إضافة ونسخ الرابط
                </button>
              </form>
            </section>
          )}

          {selectedProgram.eligibility_method === 'legacy_attendance' ? (
            <section className="tool-panel full gh-entitlements-panel">
              <div className="section-heading compact">
                <span className="section-kicker">استحقاق مبني على استمارة الحضور</span>
                <h3>المشاركون المؤهلون عبر استمارة الحضور</h3>
                <p>
                  في هذا البرنامج تتحدد أهلية المشارك مباشرةً عند تعبئة إقرار الحضور للأيام الثلاثة، وتُدار الطلبات والموافقات والإصدارات من تبويب «الطلبات والإصدارات».
                </p>
              </div>
              <div className="gh-summary-grid">
                <div>
                  <strong>{summary.submissions}</strong>
                  <span>إجمالي الإقرارات</span>
                </div>
                <div>
                  <strong>{summary.ijazah_eligible}</strong>
                  <span>مؤهلون للإجازة</span>
                </div>
                <div>
                  <strong>{summary.certificate_only}</strong>
                  <span>مؤهلون للشهادة فقط</span>
                </div>
                <div>
                  <strong>{summary.pending_approvals || 0}</strong>
                  <span>بانتظار الموافقة</span>
                </div>
              </div>
              <div className="item-actions">
                <button className="primary-action" type="button" onClick={() => setSection('submissions')}>
                  مراجعة الطلبات والموافقات ({summary.submissions})
                </button>
                <button className="secondary-action" type="button" onClick={() => setSection('issued')}>
                  مراجعة المستندات الصادرة
                </button>
              </div>
            </section>
          ) : (
            <section className="tool-panel full gh-entitlements-panel">
              <div className="section-heading compact">
                <span className="section-kicker">الأهلية مستقلة عن الطلب والإصدار</span>
                <h3>المستحقون وحالة طلباتهم وإصداراتهم</h3>
                <p>
                  يميز هذا الجدول بين أصل الاستحقاق (الأهلية)، وحالة تقديم الطلب، وحالة الموافقة الإدارية، وحالة إصدار المستند، وصلاحية الوصول.
                </p>
              </div>
              {loading && (
                <div className="gh-inline-loader">
                  <Loader2 className="spin" size={20} aria-hidden /> جاري التحميل…
                </div>
              )}
              <div className="responsive-table">
                <table>
                  <thead>
                    <tr>
                      <th>المستفيد</th>
                      <th>مصدر الأهلية</th>
                      <th>المستندات المؤهلة</th>
                      <th>حالة الطلب</th>
                      <th>حالة الموافقة</th>
                      <th>حالة الإصدار</th>
                      <th>الصلاحية</th>
                      <th>إجراء</th>
                    </tr>
                  </thead>
                  <tbody>
                    {entitlements.map((entitlement) => (
                      <tr key={entitlement.id}>
                        <td>
                          <strong>{entitlement.full_name}</strong>
                        </td>
                        <td>{entitlement.source_type === 'exam_submission' ? 'اختبار ناجح' : 'إضافة إدارية'}</td>
                        <td>
                          {[entitlement.certificate_eligible && 'شهادة', entitlement.ijazah_eligible && 'إجازة']
                            .filter(Boolean)
                            .join(' و ')}
                        </td>
                        <td>
                          <span className={`gh-status ${entitlement.request ? 'completed' : 'not_required'}`}>
                            {entitlement.request ? 'تم تقديم الطلب' : 'لم يطلب بعد'}
                          </span>
                        </td>
                        <td>
                          {entitlement.request ? (
                            <span className={`gh-status ${approvalBadgeClass(entitlement.request.approval_status)}`}>
                              {approvalText(entitlement.request.approval_status)}
                            </span>
                          ) : (
                            <span className="gh-status not_required">بعد تقديم الطلب</span>
                          )}
                        </td>
                        <td>
                          {entitlement.request ? (
                            <span className={`gh-status ${entitlement.request.generation_status}`}>
                              {entitlement.request.approval_status === 'pending_approval'
                                ? 'ينتظر الموافقة'
                                : generationText(entitlement.request.generation_status)}
                            </span>
                          ) : (
                            <span className="gh-status not_required">لم يبدأ</span>
                          )}
                        </td>
                        <td>
                          <span className={`gh-status ${entitlement.revoked_at ? 'failed' : 'completed'}`}>
                            {entitlement.revoked_at ? 'ملغاة' : 'سارية'}
                          </span>
                        </td>
                        <td>
                          <div className="item-actions">
                            <button
                              className="ghost-action small"
                              disabled={Boolean(entitlement.revoked_at)}
                              type="button"
                              onClick={() => copyEntitlementAccess(entitlement)}
                            >
                              <Copy size={15} aria-hidden /> نسخ الرابط
                            </button>
                            {entitlement.revoked_at ? (
                              <button
                                className="secondary-action small"
                                type="button"
                                onClick={() => restoreEntitlement(entitlement)}
                              >
                                <RotateCcw size={15} aria-hidden /> تفعيل
                              </button>
                            ) : (
                              <button
                                className="danger-action small"
                                type="button"
                                onClick={() => revokeEntitlement(entitlement)}
                              >
                                إلغاء
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                    {!entitlements.length && !loading && (
                      <tr>
                        <td colSpan={8}>لا توجد استحقاقات مسجلة بعد.</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </section>
          )}
        </div>
      )}

      {section === 'submissions' && (
        <>
          <div className="gh-summary-grid">
            <div>
              <strong>{summary.submissions}</strong>
              <span>كل الطلبات</span>
            </div>
            <div>
              <strong>{summary.ijazah_eligible}</strong>
              <span>مستحقو الإجازة</span>
            </div>
            <div>
              <strong>{summary.certificate_only}</strong>
              <span>شهادة فقط</span>
            </div>
            <div className={summary.pending_approvals ? 'warning' : ''}>
              <strong>{summary.pending_approvals || 0}</strong>
              <span>بانتظار الموافقة</span>
            </div>
            <div className={summary.generation_failures ? 'danger' : ''}>
              <strong>{summary.generation_failures}</strong>
              <span>فشل توليد</span>
            </div>
          </div>

          <section className="tool-panel gh-admin-panel">
            <form
              className="gh-filter-bar"
              onSubmit={(event) => {
                event.preventDefault();
                setPage(1);
                setAppliedSearch(filters.search.trim());
              }}
            >
              <label className="search-field">
                <Search size={17} aria-hidden />
                <input
                  value={filters.search}
                  onChange={(event) => setFilters({ ...filters, search: event.target.value })}
                  placeholder="بحث باسم المستفيد"
                />
              </label>
              <select
                aria-label="الجنس"
                value={filters.gender}
                onChange={(event) => {
                  setPage(1);
                  setFilters({ ...filters, gender: event.target.value });
                }}
              >
                <option value="">كل الأجناس</option>
                <option value="male">ذكر</option>
                <option value="female">أنثى</option>
              </select>
              {selectedProgram?.eligibility_method === 'legacy_attendance' && (
                <select
                  aria-label="عدد أيام الحضور"
                  value={filters.attendance_count}
                  onChange={(event) => {
                    setPage(1);
                    setFilters({ ...filters, attendance_count: event.target.value });
                  }}
                >
                  <option value="">كل الحضور</option>
                  <option value="0">0 أيام</option>
                  <option value="1">يوم واحد</option>
                  <option value="2">يومان</option>
                  <option value="3">3 أيام</option>
                </select>
              )}
              {selectedProgram?.eligibility_method === 'legacy_attendance' && (
                <select
                  aria-label="الاستحقاق"
                  value={filters.eligibility}
                  onChange={(event) => {
                    setPage(1);
                    setFilters({ ...filters, eligibility: event.target.value });
                  }}
                >
                  <option value="">كل الاستحقاقات</option>
                  <option value="ijazah_and_certificate">إجازة وشهادة</option>
                  <option value="certificate_only">شهادة فقط</option>
                  <option value="none">غير مستحق</option>
                </select>
              )}
              <select
                aria-label="حالة الموافقة"
                value={filters.approval_status}
                onChange={(event) => {
                  setPage(1);
                  setFilters({ ...filters, approval_status: event.target.value });
                }}
              >
                <option value="">كل حالات الموافقة</option>
                <option value="pending_approval">بانتظار الموافقة</option>
                <option value="approved">معتمد</option>
                <option value="rejected">مرفوض</option>
              </select>
              <select
                aria-label="حالة التوليد"
                value={filters.generation_status}
                onChange={(event) => {
                  setPage(1);
                  setFilters({ ...filters, generation_status: event.target.value });
                }}
              >
                <option value="">كل حالات التوليد</option>
                <option value="completed">تم التوليد</option>
                <option value="failed">فشل</option>
                <option value="processing">قيد التوليد</option>
                <option value="pending">بانتظار التوليد</option>
                <option value="not_required">لا يلزم</option>
              </select>
              <select
                aria-label="حالة الصلاحية"
                value={filters.revoked}
                onChange={(event) => {
                  setPage(1);
                  setFilters({ ...filters, revoked: event.target.value });
                }}
              >
                <option value="">كل حالات الصلاحية</option>
                <option value="active">سارية</option>
                <option value="revoked">ملغاة</option>
              </select>
              <button className="secondary-action small" type="submit">
                تطبيق البحث
              </button>
            </form>

            {loading && (
              <div className="gh-inline-loader">
                <Loader2 className="spin" size={20} aria-hidden /> جاري التحميل…
              </div>
            )}

            <div className="responsive-table">
              <table>
                <thead>
                  <tr>
                    <th>المستفيد</th>
                    <th>الجنس</th>
                    <th>مصدر الأهلية</th>
                    <th>المستندات المستحقة</th>
                    <th>حالة الموافقة</th>
                    <th>حالة الإصدار</th>
                    <th>الصلاحية</th>
                    <th>تاريخ الطلب</th>
                    <th>إجراء</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => (
                    <tr key={row.id}>
                      <td>
                        <strong>{row.full_name}</strong>
                      </td>
                      <td>{row.gender === 'male' ? 'ذكر' : 'أنثى'}</td>
                      <td title={row.eligibility_source === 'legacy_attendance' ? attendanceText(row) : undefined}>
                        {row.eligibility_source === 'legacy_attendance'
                          ? `حضور ${row.attendance_count}/3`
                          : row.eligibility_source === 'passed_exam'
                            ? 'اختبار ناجح'
                            : 'استحقاق إداري'}
                      </td>
                      <td>{submissionEligibilityText(row)}</td>
                      <td>
                        <span className={`gh-status ${approvalBadgeClass(row.approval_status)}`}>
                          {approvalText(row.approval_status)}
                        </span>
                      </td>
                      <td>
                        <span className={`gh-status ${row.generation_status}`}>
                          {row.approval_status === 'pending_approval'
                            ? 'ينتظر الموافقة'
                            : generationText(row.generation_status)}
                        </span>
                      </td>
                      <td>
                        <span className={`gh-status ${row.revoked_at ? 'failed' : 'completed'}`}>
                          {row.revoked_at ? 'ملغاة' : 'سارية'}
                        </span>
                      </td>
                      <td>{new Date(row.submitted_at).toLocaleString('ar-LB')}</td>
                      <td>
                        <button className="ghost-action small" type="button" onClick={() => showDetails(row)}>
                          التفاصيل
                        </button>
                      </td>
                    </tr>
                  ))}
                  {!rows.length && !loading && (
                    <tr>
                      <td colSpan={9}>لا توجد طلبات مطابقة.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            <div className="gh-pagination">
              <button
                className="ghost-action small"
                disabled={page <= 1}
                onClick={() => setPage(page - 1)}
                type="button"
              >
                <ChevronRight size={16} aria-hidden /> السابق
              </button>
              <span>
                صفحة {page} من {pages} - {count} طلبًا
              </span>
              <button
                className="ghost-action small"
                disabled={page >= pages}
                onClick={() => setPage(page + 1)}
                type="button"
              >
                التالي <ChevronLeft size={16} aria-hidden />
              </button>
            </div>
          </section>

          {selected && (
            <section className="tool-panel gh-details">
              <div className="section-heading compact">
                <span className="section-kicker">تفاصيل الطلب والإصدار</span>
                <h3>{selected.full_name}</h3>
              </div>
              <div className="details-grid">
                <span>الجنس: {selected.gender === 'male' ? 'ذكر' : 'أنثى'}</span>
                <span>
                  مصدر الأهلية:{' '}
                  {selected.eligibility_source === 'legacy_attendance'
                    ? `حضور ${selected.attendance_count}/3`
                    : selected.eligibility_source === 'passed_exam'
                      ? 'النجاح في الاختبار'
                      : 'إضافة إدارية'}
                </span>
                <span>الأهلية: {submissionEligibilityText(selected)}</span>
                <span>حالة الطلب: مسجل</span>
                <span>حالة الموافقة: {approvalText(selected.approval_status)}</span>
                <span>حالة الإصدار: {generationText(selected.generation_status)}</span>
                <span>حالة الصلاحية: {selected.revoked_at ? 'ملغاة إداريًا' : 'سارية'}</span>
              </div>
              {selected.eligibility_source === 'legacy_attendance' && (
                <p className="gh-attendance-detail">{attendanceText(selected)}</p>
              )}
              {selected.approval_note && (
                <div className="gh-alert">
                  <AlertTriangle size={18} aria-hidden /> ملاحظة الإدارة: {selected.approval_note}
                </div>
              )}
              {selected.revoked_at && (
                <div className="gh-alert error">
                  <Ban size={18} aria-hidden />
                  تم إلغاء صلاحية المستندات في {new Date(selected.revoked_at).toLocaleString('ar-LB')}
                  {selected.revoked_reason ? ` — ${selected.revoked_reason}` : ''}
                </div>
              )}
              {selected.generation_error && (
                <div className="gh-alert error">
                  <AlertTriangle size={18} aria-hidden />
                  {selected.generation_error}
                </div>
              )}
              <div className="gh-admin-documents">
                {(selected.documents || []).map((document) => (
                  <div key={document.id}>
                    <span>
                      <strong>{documentLabels[document.document_type]}</strong>
                      <small>
                        {document.generation_status === 'issued'
                          ? `صدر ${document.issued_at ? new Date(document.issued_at).toLocaleString('ar-LB') : ''}${selected.revoked_at ? ' (موقوف التنزيل للمشارك)' : ''}`
                          : document.generation_error || 'غير جاهز'}
                      </small>
                    </span>
                    <div className="item-actions">
                      <button
                        className="ghost-action small"
                        disabled={document.generation_status !== 'issued'}
                        onClick={() => openDocument(document, false)}
                        type="button"
                      >
                        <Eye size={16} aria-hidden /> معاينة
                      </button>
                      <button
                        className="secondary-action small"
                        disabled={document.generation_status !== 'issued'}
                        onClick={() => openDocument(document, true)}
                        type="button"
                      >
                        <Download size={16} aria-hidden /> تنزيل
                      </button>
                    </div>
                  </div>
                ))}
                {!(selected.documents || []).length && <p>لم يصدر أي مستند لهذا الطلب بعد.</p>}
              </div>
              <div className="item-actions">
                {selected.approval_status !== 'approved' && (
                  <button
                    className="primary-action"
                    disabled={loading || Boolean(selected.revoked_at)}
                    onClick={() => approveSubmission(selected)}
                    type="button"
                  >
                    <ShieldCheck size={17} aria-hidden /> اعتماد وإصدار المستندات
                  </button>
                )}
                {selected.approval_status === 'pending_approval' && (
                  <button
                    className="danger-action"
                    disabled={loading}
                    onClick={() => rejectSubmission(selected)}
                    type="button"
                  >
                    <XCircle size={17} aria-hidden /> رفض الطلب
                  </button>
                )}
                <button
                  className="secondary-action"
                  disabled={
                    loading
                    || Boolean(selected.revoked_at)
                    || selected.approval_status !== 'approved'
                    || !['failed', 'pending'].includes(selected.generation_status)
                  }
                  onClick={() => retry(selected)}
                  type="button"
                >
                  <RefreshCw size={17} aria-hidden /> إعادة محاولة التوليد
                </button>
                {selected.revoked_at ? (
                  <button
                    className="secondary-action"
                    disabled={loading}
                    onClick={() => restoreSubmission(selected)}
                    type="button"
                  >
                    <RotateCcw size={17} aria-hidden /> إعادة تفعيل الصلاحية
                  </button>
                ) : (
                  <button
                    className="danger-action"
                    disabled={loading}
                    onClick={() => revokeSubmission(selected)}
                    type="button"
                  >
                    <Ban size={17} aria-hidden /> إلغاء صلاحية المستندات
                  </button>
                )}
                <button className="ghost-action" onClick={() => setSelected(null)} type="button">
                  إغلاق التفاصيل
                </button>
                <button className="danger-action" disabled={loading} onClick={deleteSelectedSubmission} type="button">
                  <Trash2 size={17} aria-hidden /> حذف الطلب نهائيًا
                </button>
              </div>
            </section>
          )}
        </>
      )}

      {section === 'issued' && (
        <section className="tool-panel gh-admin-panel">
          <div className="section-heading compact">
            <span className="section-kicker">سجل الإصدارات</span>
            <h3>المستندات الصادرة ({issuedDocumentRows.length})</h3>
            <p>
              تبقى جميع المستندات الصادرة محفوظة وقابلة للتنزيل من قبل أصحابها حتى بعد انتهاء فترة إتاحة الدورة، ولا يتوقف تنزيلها إلا عند إلغاء الصلاحية صراحةً من الإدارة.
            </p>
          </div>
          {loading && (
            <div className="gh-inline-loader">
              <Loader2 className="spin" size={20} aria-hidden /> جاري التحميل…
            </div>
          )}
          <div className="responsive-table">
            <table>
              <thead>
                <tr>
                  <th>المستفيد</th>
                  <th>نوع المستند</th>
                  <th>مصدر الأهلية</th>
                  <th>تاريخ الإصدار</th>
                  <th>حالة الصلاحية</th>
                  <th>إجراءات المستند</th>
                </tr>
              </thead>
              <tbody>
                {issuedDocumentRows.map(({ submission, document }) => (
                  <tr key={document.id}>
                    <td>
                      <strong>{submission.full_name}</strong>
                    </td>
                    <td>{documentLabels[document.document_type]}</td>
                    <td>
                      {submission.eligibility_source === 'legacy_attendance'
                        ? 'إقرار حضور الغوثاني'
                        : submission.eligibility_source === 'passed_exam'
                          ? 'النجاح في الاختبار'
                          : 'استحقاق إداري'}
                    </td>
                    <td>{document.issued_at ? new Date(document.issued_at).toLocaleString('ar-LB') : '—'}</td>
                    <td>
                      <span className={`gh-status ${submission.revoked_at ? 'failed' : 'completed'}`}>
                        {submission.revoked_at ? 'ملغاة إداريًا' : 'سارية وقابلة للتنزيل'}
                      </span>
                    </td>
                    <td>
                      <div className="item-actions">
                        <button
                          className="ghost-action small"
                          onClick={() => openDocument(document, false)}
                          type="button"
                        >
                          <Eye size={15} aria-hidden /> معاينة
                        </button>
                        <button
                          className="secondary-action small"
                          onClick={() => openDocument(document, true)}
                          type="button"
                        >
                          <Download size={15} aria-hidden /> تنزيل
                        </button>
                        {submission.revoked_at ? (
                          <button
                            className="secondary-action small"
                            onClick={() => restoreSubmission(submission)}
                            type="button"
                          >
                            <RotateCcw size={15} aria-hidden /> تفعيل الصلاحية
                          </button>
                        ) : (
                          <button
                            className="danger-action small"
                            onClick={() => revokeSubmission(submission)}
                            type="button"
                          >
                            <Ban size={15} aria-hidden /> إلغاء الصلاحية
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
                {!issuedDocumentRows.length && !loading && (
                  <tr>
                    <td colSpan={6}>لا توجد مستندات صادرة لهذه الدورة بعد.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          <div className="gh-pagination">
            <button
              className="ghost-action small"
              disabled={page <= 1}
              onClick={() => setPage(page - 1)}
              type="button"
            >
              <ChevronRight size={16} aria-hidden /> السابق
            </button>
            <span>
              صفحة {page} من {pages} - {count} طلبًا مُصدرًا
            </span>
            <button
              className="ghost-action small"
              disabled={page >= pages}
              onClick={() => setPage(page + 1)}
              type="button"
            >
              التالي <ChevronLeft size={16} aria-hidden />
            </button>
          </div>
        </section>
      )}

      {section === 'templates' && (
        <>
          <div className="gh-template-toolbar">
            <p>القوالب المفعّلة فقط هي التي تستخدم للطلبات الجديدة. إلغاء التفعيل لا يحذف الإصدارات السابقة.</p>
            <button
              className="danger-action"
              disabled={loading || !activeTemplates.length}
              onClick={deactivateAllTemplates}
              type="button"
            >
              <PowerOff size={17} aria-hidden /> إلغاء تفعيل القوالب الحالية
            </button>
          </div>
          <div className="gh-template-status">
            {(Object.keys(templateLabels) as GhawthaniDocumentType[]).map((type) => {
              const active = readyTemplates.find((template) => template.template_type === type);
              const inconsistent = activeTemplates.find(
                (template) => template.template_type === type && !template.is_validated,
              );
              const requiredForProgram = isTemplateRequiredForProgram(selectedProgram, type);
              return (
                <div
                  key={type}
                  className={active ? 'ready' : requiredForProgram ? 'missing' : 'neutral'}
                >
                  {active ? <CheckCircle2 size={19} aria-hidden /> : <AlertTriangle size={19} aria-hidden />}
                  <span>
                    <strong>{templateLabels[type]}</strong>
                    <small>
                      {active
                        ? `النسخة ${active.version_number} مفعّلة`
                        : inconsistent
                          ? `النسخة ${inconsistent.version_number} مفعّلة لكنها غير معتمدة`
                          : requiredForProgram
                          ? 'لا توجد نسخة مفعّلة'
                          : 'غير مطلوب في إعداد هذه الدورة'}
                    </small>
                  </span>
                  {active && (
                    <button className="ghost-action small" onClick={() => chooseTemplate(active)} type="button">
                      إدارة
                    </button>
                  )}
                </div>
              );
            })}
          </div>

          <div className="gh-template-grid">
            <section className="tool-panel">
              <div className="section-heading compact">
                <span className="section-kicker">نسخة جديدة</span>
                <h3>رفع قالب PDF</h3>
                <p>يُحفظ القالب كنسخة غير مفعّلة حتى توليد عينة وفحصها.</p>
              </div>
              <form className="gh-template-form" onSubmit={uploadTemplate}>
                <label className="field full">
                  <span>غرض القالب</span>
                  <select
                    value={templateType}
                    onChange={(event) => changeTemplateType(event.target.value as GhawthaniDocumentType)}
                  >
                    {Object.entries(templateLabels).map(([value, label]) => (
                      <option key={value} value={value}>
                        {label}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="field full">
                  <span>ملف PDF</span>
                  <input
                    type="file"
                    accept="application/pdf,.pdf"
                    onChange={(event) => setTemplateFile(event.target.files?.[0] || null)}
                  />
                </label>
                <PlacementFields placement={placement} setPlacement={setPlacement} />
                <button className="primary-action" disabled={loading || !templateFile} type="submit">
                  {loading ? <Loader2 className="spin" size={17} aria-hidden /> : <FileUp size={17} aria-hidden />} رفع نسخة القالب
                </button>
              </form>
            </section>

            <section className="tool-panel">
              <div className="section-heading compact">
                <span className="section-kicker">النسخ المحفوظة</span>
                <h3>القوالب والإصدارات</h3>
              </div>
              <div className="gh-template-list">
                {templates.map((template) => (
                  <button
                    type="button"
                    key={template.id}
                    className={`${selectedTemplate?.id === template.id ? 'selected' : ''}`}
                    onClick={() => chooseTemplate(template)}
                  >
                    <FileCog size={18} aria-hidden />
                    <span>
                      <strong>
                        {templateLabels[template.template_type]} - النسخة {template.version_number}
                      </strong>
                      <small>
                        {template.is_active && template.is_validated
                          ? 'مفعّلة'
                          : template.is_active
                            ? 'مفعّلة لكنها غير معتمدة'
                          : template.is_validated
                            ? 'مفحوصة وغير مفعّلة'
                            : 'بانتظار الفحص'}{' '}
                        · {fontFamilyLabels[template.font_family || 'noto_naskh']} ·{' '}
                        {new Date(template.created_at).toLocaleDateString('ar-LB')}
                      </small>
                    </span>
                  </button>
                ))}
                {!templates.length && !loading && <p>لا توجد قوالب. ارفع القوالب المطلوبة للبدء.</p>}
              </div>
            </section>
          </div>

          {selectedTemplate && (
            <section className="tool-panel gh-template-editor">
              <div className="section-heading compact">
                <span className="section-kicker">ضبط وفحص</span>
                <h3>
                  {templateLabels[selectedTemplate.template_type]} - النسخة {selectedTemplate.version_number}
                </h3>
                <p>
                  الإحداثيات بوحدة نقطة PDF ومن الزاوية السفلية اليسرى للصفحة. أبعاد الصفحة{' '}
                  {Number(selectedTemplate.page_width).toFixed(1)} × {Number(selectedTemplate.page_height).toFixed(1)}{' '}
                  نقطة.
                </p>
              </div>
              <div className="gh-template-preview">
                <iframe title="معاينة القالب الحالي" src={selectedTemplate.preview_url} />
                <a className="secondary-action small" href={selectedTemplate.preview_url} target="_blank" rel="noreferrer">
                  <Eye size={16} aria-hidden /> فتح القالب في نافذة
                </a>
              </div>
              <PlacementFields placement={placement} setPlacement={setPlacement} />
              <div className="item-actions">
                <button className="secondary-action" onClick={saveConfig} disabled={loading} type="button">
                  حفظ موضع الاسم {selectedTemplate.is_active ? 'كنسخة جديدة' : ''}
                </button>
              </div>
              <div className="gh-sample-controls">
                <label className="field">
                  <span>اسم عربي للاختبار</span>
                  <input value={sampleName} onChange={(event) => setSampleName(event.target.value)} />
                </label>
                <button className="primary-action" onClick={generateSample} disabled={loading} type="button">
                  إنشاء عينة
                </button>
              </div>
              {sampleUrl && (
                <div className="gh-sample-preview">
                  <iframe title="عينة الاسم على القالب" src={sampleUrl} />
                  <div className="item-actions">
                    <a className="secondary-action" href={sampleUrl} target="_blank" rel="noreferrer">
                      <Eye size={17} aria-hidden /> فحص العينة بالحجم الكامل
                    </a>
                    <button
                      className="primary-action"
                      onClick={validateTemplate}
                      disabled={loading || selectedTemplate.is_validated}
                      type="button"
                    >
                      <CheckCircle2 size={17} aria-hidden /> اعتماد نتيجة العينة
                    </button>
                  </div>
                </div>
              )}
              <div className="gh-activation">
                <span>
                  {selectedTemplate.is_active
                    ? 'هذه النسخة مفعّلة حاليًا.'
                    : selectedTemplate.is_validated
                      ? 'العينة معتمدة والنسخة جاهزة للتفعيل.'
                      : 'يجب إنشاء عينة وفحصها واعتمادها قبل التفعيل.'}
                </span>
                <button
                  className="primary-action"
                  onClick={activateTemplate}
                  disabled={loading || selectedTemplate.is_active || !selectedTemplate.is_validated}
                  type="button"
                >
                  تفعيل هذه النسخة
                </button>
              </div>
              <div className="gh-danger-zone">
                <span>
                  <strong>حذف نسخة القالب</strong>
                  <small>يمكن حذفها فقط إذا لم تكن مرتبطة بمستندات صادرة.</small>
                </span>
                <button className="danger-action" disabled={loading} onClick={deleteSelectedTemplate} type="button">
                  <Trash2 size={17} aria-hidden /> حذف النسخة
                </button>
              </div>
            </section>
          )}
        </>
      )}

      {section === 'programs' && (
        <div className="gh-programs-grid">
          <section className="tool-panel">
            <div className="section-heading compact">
              <span className="section-kicker">{programForm.id ? 'تعديل البرنامج' : 'برنامج جديد'}</span>
              <h3>ربط الإجازات والشهادات بدورة</h3>
              <p>حدد ما تقدمه الدورة، وكيف يثبت المشارك أهليته، ومتى يفتح الطلب.</p>
            </div>
            <form className="gh-program-form" onSubmit={saveProgram}>
              <label className="field full">
                <span>الدورة في المنصة</span>
                <select value={programForm.dawra_id} onChange={(event) => chooseDawra(event.target.value)}>
                  <option value="">برنامج مستقل</option>
                  {dawrat.map((dawra) => (
                    <option key={dawra.id} value={dawra.id}>
                      {dawra.title}
                    </option>
                  ))}
                </select>
              </label>
              <label className="field full">
                <span>عنوان قسم الإجازة والشهادة</span>
                <input
                  required
                  value={programForm.title}
                  onChange={(event) => setProgramForm({ ...programForm, title: event.target.value })}
                />
              </label>
              <label className="field">
                <span>الرابط المختصر بالإنجليزية</span>
                <input
                  dir="ltr"
                  required
                  pattern="[a-z0-9]+(?:-[a-z0-9]+)*"
                  placeholder="course-2026"
                  value={programForm.slug}
                  onChange={(event) =>
                    setProgramForm({ ...programForm, slug: event.target.value.toLowerCase().replace(/\s+/g, '-') })
                  }
                />
              </label>
              <label className="field">
                <span>اسم المحاضر</span>
                <input
                  required
                  value={programForm.instructor_name}
                  onChange={(event) => setProgramForm({ ...programForm, instructor_name: event.target.value })}
                />
              </label>
              <label className="field full">
                <span>موضوع الدورة أو الكتاب</span>
                <input
                  required
                  value={programForm.course_subject}
                  onChange={(event) => setProgramForm({ ...programForm, course_subject: event.target.value })}
                />
              </label>
              <label className="field full">
                <span>مقدمة الاستمارة</span>
                <textarea
                  rows={3}
                  value={programForm.introduction}
                  onChange={(event) => setProgramForm({ ...programForm, introduction: event.target.value })}
                />
              </label>
              <label className="field full">
                <span>بيان الأمانة والثقة</span>
                <textarea
                  rows={2}
                  value={programForm.trust_statement}
                  onChange={(event) => setProgramForm({ ...programForm, trust_statement: event.target.value })}
                />
              </label>
              <fieldset className="full gh-program-options">
                <legend>ماذا تقدم هذه الدورة؟</legend>
                <label>
                  <input
                    type="checkbox"
                    checked={programForm.offers_certificate}
                    onChange={(event) => setProgramForm({ ...programForm, offers_certificate: event.target.checked })}
                  />{' '}
                  شهادة مشاركة
                </label>
                <label>
                  <input
                    type="checkbox"
                    checked={programForm.offers_ijazah}
                    onChange={(event) => setProgramForm({ ...programForm, offers_ijazah: event.target.checked })}
                  />{' '}
                  إجازة
                </label>
                <small>يجب تفعيل نوع واحد على الأقل، وتظهر للمشارك الأنواع المستحقة فقط.</small>
              </fieldset>
              <label className="field full">
                <span>مصدر استحقاق المشارك</span>
                <select
                  value={programForm.eligibility_method}
                  onChange={(event) =>
                    setProgramForm({ ...programForm, eligibility_method: event.target.value as IjazahEligibilityMethod })
                  }
                >
                  <option value="legacy_attendance">أسئلة حضور الغوثاني</option>
                  <option value="passed_exam">النجاح في اختبار مرتبط بالدورة</option>
                  <option value="manual">إضافة يدوية من الإدارة</option>
                </select>
                <small>
                  {programForm.eligibility_method === 'legacy_attendance'
                    ? 'تظهر أسئلة الأيام الثلاثة؛ استخدمها لبرامج الغوثاني المعنية فقط.'
                    : programForm.eligibility_method === 'passed_exam'
                      ? 'يظهر الاستحقاق تلقائيًا لمن ينجح في أي اختبار مرتبط بهذه الدورة.'
                      : 'تضيف الإدارة كل مستفيد وترسل له رابطًا خاصًا.'}
                </small>
              </label>
              <label className="field">
                <span>بداية الإتاحة</span>
                <input
                  type="datetime-local"
                  value={programForm.available_from}
                  onChange={(event) => setProgramForm({ ...programForm, available_from: event.target.value })}
                />
                <small>اتركها فارغة للإتاحة فورًا.</small>
              </label>
              <label className="field">
                <span>نهاية الإتاحة</span>
                <input
                  type="datetime-local"
                  value={programForm.available_until}
                  onChange={(event) => setProgramForm({ ...programForm, available_until: event.target.value })}
                />
                <small>اتركها فارغة لإبقاء الطلب مفتوحًا دون تاريخ انتهاء.</small>
              </label>
              <label className="gh-acknowledgment full">
                <input
                  type="checkbox"
                  checked={programForm.requires_approval}
                  onChange={(event) => setProgramForm({ ...programForm, requires_approval: event.target.checked })}
                />
                <span>يتطلب موافقة الإدارة على كل طلب قبل توليد المستندات وإصدارها</span>
              </label>
              <label className="gh-acknowledgment full">
                <input
                  type="checkbox"
                  checked={programForm.is_active}
                  onChange={(event) => setProgramForm({ ...programForm, is_active: event.target.checked })}
                />
                <span>البرنامج مفعّل للطلبات والإصدارات الجديدة</span>
              </label>
              <aside className="gh-availability-note full">
                <AlertTriangle size={18} aria-hidden />
                <span>
                  إيقاف البرنامج أو انتهاء المدة يمنع الطلب والإصدار الجديد، لكنه لا يحذف المستندات الصادرة ولا يوقف تنزيلها.
                </span>
              </aside>
              <div className="item-actions full">
                <button
                  className="primary-action"
                  disabled={loading || (!programForm.offers_certificate && !programForm.offers_ijazah)}
                  type="submit"
                >
                  {programForm.id ? 'حفظ التعديلات' : 'إنشاء البرنامج'}
                </button>
                {programForm.id && (
                  <button className="ghost-action" type="button" onClick={() => setProgramForm(emptyProgramForm)}>
                    إلغاء التعديل
                  </button>
                )}
              </div>
            </form>
          </section>

          <section className="tool-panel">
            <div className="section-heading compact">
              <span className="section-kicker">البرامج المحفوظة</span>
              <h3>الدورات المرتبطة</h3>
            </div>
            <div className="gh-program-list">
              {programs.map((program) => {
                const avail = availabilityLabel(program);
                return (
                  <article key={program.id}>
                    <div>
                      <strong>{program.title}</strong>
                      <small>
                        {program.course_subject} · {program.instructor_name}
                      </small>
                      <small>
                        {[program.offers_certificate && 'شهادة', program.offers_ijazah && 'إجازة']
                          .filter(Boolean)
                          .join(' و ')}{' '}
                        ·{' '}
                        {program.eligibility_method === 'legacy_attendance'
                          ? 'أسئلة الحضور'
                          : program.eligibility_method === 'passed_exam'
                            ? 'نتيجة الاختبار'
                            : 'إضافة يدوية'}
                        {program.requires_approval ? ' · بموافقة الإدارة' : ''}
                      </small>
                      {program.eligibility_method === 'legacy_attendance' && (
                        <code dir="ltr">/ejaza/{program.slug}</code>
                      )}
                    </div>
                    <div className="item-actions">
                      <span className={`gh-status ${avail.badgeClass}`}>{avail.text}</span>
                      <button className="ghost-action small" type="button" onClick={() => editProgram(program)}>
                        تعديل
                      </button>
                    </div>
                  </article>
                );
              })}
            </div>
          </section>
        </div>
      )}
    </div>
  );
}

function PlacementFields({
  placement,
  setPlacement,
}: {
  placement: typeof defaultPlacements.ijazah_male;
  setPlacement: (value: typeof defaultPlacements.ijazah_male) => void;
}) {
  const numberField = (key: keyof typeof placement, label: string, help: string, step = '0.5') => (
    <label className="field gh-placement-field">
      <span>{label}</span>
      <input
        type="number"
        step={step}
        value={placement[key]}
        onChange={(event) => setPlacement({ ...placement, [key]: Number(event.target.value) })}
      />
      <small>{help}</small>
    </label>
  );
  return (
    <>
      <aside className="gh-placement-guide">
        <strong>كيف تضبط موضع الاسم؟</strong>
        <div>
          <p>
            <b>لتحريكه يمينًا:</b> زِد X، مثلًا من <span dir="ltr">{placement.name_x}</span> إلى{' '}
            <span dir="ltr">{placement.name_x + 10}</span>. لتحريكه يسارًا أنقص X.
          </p>
          <p>
            <b>لتحريكه لأعلى:</b> زِد Y، مثلًا من <span dir="ltr">{placement.name_y}</span> إلى{' '}
            <span dir="ltr">{placement.name_y + 10}</span>. لتحريكه لأسفل أنقص Y.
          </p>
        </div>
        <small>عدّل بمقدار 5–10 نقاط في كل مرة، ثم اضغط «حفظ موضع الاسم» وأنشئ عينة جديدة لمراجعتها.</small>
      </aside>
      <div className="gh-placement-grid">
        {numberField('page_index', 'رقم الصفحة', '0 يعني الصفحة الأولى، و1 يعني الثانية.', '1')}
        {numberField('name_x', 'X — الموضع الأفقي', 'زيادته تحرّك المنطقة يمينًا، وإنقاصه يحرّكها يسارًا.')}
        {numberField('name_y', 'Y — الموضع العمودي', 'زيادته ترفع المنطقة، وإنقاصه ينزلها.')}
        {numberField('name_width', 'عرض المنطقة', 'مساحة الاسم أفقيًا؛ زِدها للأسماء الطويلة.')}
        {numberField('name_height', 'ارتفاع المنطقة', 'مساحة الاسم عموديًا، وتسمح بسطرين عند الحاجة.')}
        {numberField('font_size', 'حجم الخط', 'الحجم المفضّل؛ يصغر تلقائيًا إذا لم يتّسع الاسم.')}
        <label className="field gh-placement-field">
          <span>نوع الخط العربي</span>
          <select
            value={placement.font_family}
            onChange={(event) => setPlacement({ ...placement, font_family: event.target.value as GhawthaniFontFamily })}
          >
            {Object.entries(fontFamilyLabels).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
          <small>يغيّر شكل الكتابة وعرضها؛ راجع العينة بعد تغييره.</small>
        </label>
        <label className="field gh-placement-field">
          <span>لون الخط</span>
          <input
            type="color"
            value={placement.font_color}
            onChange={(event) => setPlacement({ ...placement, font_color: event.target.value })}
          />
          <small>لون الاسم الذي سيظهر على القالب.</small>
        </label>
        <label className="field gh-placement-field">
          <span>المحاذاة</span>
          <select
            value={placement.alignment}
            onChange={(event) =>
              setPlacement({ ...placement, alignment: event.target.value as 'center' | 'right' | 'left' })
            }
          >
            <option value="center">وسط</option>
            <option value="right">يمين</option>
            <option value="left">يسار</option>
          </select>
          <small>موضع الاسم داخل المنطقة؛ لا تنقل المنطقة نفسها.</small>
        </label>
      </div>
    </>
  );
}
