import { AlertTriangle, Award, BookOpen, GraduationCap, LayoutDashboard, Loader2 } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import AdminPanel from './components/AdminPanel';
import AssessmentFlow from './components/AssessmentFlow';
import CertificatesHub from './components/CertificatesHub';
import GhawthaniIjazahPage from './components/GhawthaniIjazahPage';
import PublicSite from './components/PublicSite';
import { getPublishedExamWithQuestions } from './lib/examService';
import { getExamReferenceFromUrl, getExamShareUrl } from './lib/examLinks';
import {
  addParticipantClaim,
  getParticipantPortfolio,
  IJAZAH_CLAIMS_CHANGED,
  loadParticipantClaims,
  removeParticipantClaims,
} from './lib/ghawthaniService';
import type { Exam } from './types';

type View = 'home' | 'assessment' | 'admin' | 'ghawthani' | 'certificates';
type DirectExamState = 'idle' | 'loading' | 'error';

export default function App() {
  const [view, setView] = useState<View>('home');
  const [activeExam, setActiveExam] = useState<Exam | null>(null);
  const [directExamState, setDirectExamState] = useState<DirectExamState>('idle');
  const [ijazahProgramSlug, setIjazahProgramSlug] = useState('ghawthani');
  const [showCertificatesTab, setShowCertificatesTab] = useState(false);
  const routeRequestRef = useRef(0);

  const openExamFromUrl = useCallback(async () => {
    const requestId = ++routeRequestRef.current;
    const normalizedPath = window.location.pathname.replace(/\/+$/, '');
    if (normalizedPath.toLowerCase() === '/certificates') {
      const params = new URLSearchParams(window.location.search);
      const claim = params.get('claim');
      const submission = params.get('submission');
      const token = params.get('token');
      const program = params.get('program') || undefined;
      if (claim && token) {
        sessionStorage.setItem('shmoury_ijazah_url_claim_attempt', `entitlement:${claim}`);
        addParticipantClaim({ kind: 'entitlement', id: claim, token, program_slug: program });
        window.history.replaceState({}, '', '/certificates');
      } else if (submission && token) {
        sessionStorage.setItem('shmoury_ijazah_url_claim_attempt', `submission:${submission}`);
        addParticipantClaim({ kind: 'submission', id: submission, token, program_slug: program || 'ghawthani' });
        window.history.replaceState({}, '', '/certificates');
      }
      setActiveExam(null);
      setDirectExamState('idle');
      setView('certificates');
      return;
    }
    const programMatch = normalizedPath.match(/^\/ejaza\/([a-z0-9-]+)$/i);
    if (normalizedPath.toLowerCase() === '/ejazaghawthani' || programMatch) {
      const slug = programMatch?.[1].toLowerCase() || 'ghawthani';
      const params = new URLSearchParams(window.location.search);
      const submission = params.get('submission');
      const token = params.get('token');
      if (submission && token) {
        addParticipantClaim({ kind: 'submission', id: submission, token, program_slug: slug });
        window.history.replaceState({}, '', normalizedPath);
      }
      setIjazahProgramSlug(slug);
      setActiveExam(null);
      setDirectExamState('idle');
      setView('ghawthani');
      return;
    }
    const examReference = getExamReferenceFromUrl();
    if (!examReference) {
      setActiveExam(null);
      setDirectExamState('idle');
      setView('home');
      return;
    }

    setDirectExamState('loading');
    setView('assessment');
    try {
      const exam = await getPublishedExamWithQuestions(examReference);
      if (requestId !== routeRequestRef.current) return;
      setActiveExam(exam);
      setDirectExamState('idle');
    } catch {
      if (requestId !== routeRequestRef.current) return;
      setActiveExam(null);
      setDirectExamState('error');
    }
  }, []);

  useEffect(() => {
    openExamFromUrl();
    window.addEventListener('popstate', openExamFromUrl);
    return () => window.removeEventListener('popstate', openExamFromUrl);
  }, [openExamFromUrl]);

  const refreshCertificatesVisibility = useCallback(async () => {
    const claims = loadParticipantClaims();
    try {
      const result = await getParticipantPortfolio(claims);
      setShowCertificatesTab(result.has_visible_items);
      const isCertificatesRoute = window.location.pathname.replace(/\/+$/, '').toLowerCase() === '/certificates';
      if (result.invalid_claims.length && !isCertificatesRoute) {
        removeParticipantClaims(result.invalid_claims);
      }
    } catch {
      // Keep navigation stable during a transient network failure.
    }
  }, []);

  useEffect(() => {
    refreshCertificatesVisibility();
    window.addEventListener(IJAZAH_CLAIMS_CHANGED, refreshCertificatesVisibility);
    window.addEventListener('storage', refreshCertificatesVisibility);
    return () => {
      window.removeEventListener(IJAZAH_CLAIMS_CHANGED, refreshCertificatesVisibility);
      window.removeEventListener('storage', refreshCertificatesVisibility);
    };
  }, [refreshCertificatesVisibility]);

  function startExam(exam: Exam) {
    routeRequestRef.current += 1;
    window.history.pushState({ examId: exam.id }, '', getExamShareUrl(exam));
    setActiveExam(exam);
    setDirectExamState('idle');
    setView('assessment');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function goHome() {
    routeRequestRef.current += 1;
    window.history.pushState({}, '', '/');
    setActiveExam(null);
    setDirectExamState('idle');
    setView('home');
    void refreshCertificatesVisibility();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function openAdmin() {
    routeRequestRef.current += 1;
    window.history.pushState({}, '', '/');
    setActiveExam(null);
    setDirectExamState('idle');
    setView('admin');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function openLegacyProgram(slug: string) {
    routeRequestRef.current += 1;
    window.history.pushState({}, '', slug === 'ghawthani' ? '/ejazaGhawthani' : `/ejaza/${slug}`);
    setIjazahProgramSlug(slug);
    setActiveExam(null);
    setDirectExamState('idle');
    setView('ghawthani');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function openCertificates() {
    routeRequestRef.current += 1;
    window.history.pushState({}, '', '/certificates');
    setActiveExam(null);
    setDirectExamState('idle');
    setView('certificates');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  return (
    <div className="app-shell">
      <header className="topbar">
        <button className="brand-button" onClick={goHome} type="button" aria-label="الصفحة الرئيسية">
          <span className="brand-mark">
            <BookOpen size={18} aria-hidden />
          </span>
          <span>
            <strong>الشيخ محمد أحمد الشموري</strong>
            <small>منصة الدورات والاختبارات</small>
          </span>
        </button>

        <nav className="topbar-nav" aria-label="التنقل الرئيسي">
          <button
            className={`nav-btn ${view === 'home' ? 'active' : ''}`}
            onClick={goHome}
            type="button"
            aria-label="الدورات"
            aria-current={view === 'home' ? 'page' : undefined}
          >
            <GraduationCap size={17} aria-hidden />
            <span>الدورات</span>
          </button>
          {showCertificatesTab && <button
            className={`nav-btn ${view === 'certificates' ? 'active' : ''}`}
            onClick={openCertificates}
            type="button"
            aria-label="الإجازات والشهادات"
            aria-current={view === 'certificates' ? 'page' : undefined}
          >
            <Award size={17} aria-hidden />
            <span>الإجازات والشهادات</span>
          </button>}
          <button
            className={`nav-btn ${view === 'admin' ? 'active' : ''}`}
            onClick={openAdmin}
            type="button"
            aria-label="الإدارة"
            aria-current={view === 'admin' ? 'page' : undefined}
          >
            <LayoutDashboard size={17} aria-hidden />
            <span>الإدارة</span>
          </button>
        </nav>
      </header>

      {view === 'home' && <PublicSite onStartExam={startExam} />}
      {view === 'ghawthani' && (
        <GhawthaniIjazahPage
          onBack={goHome}
          onOpenCertificates={openCertificates}
          programSlug={ijazahProgramSlug}
        />
      )}
      {view === 'certificates' && <CertificatesHub onBack={goHome} onOpenLegacy={openLegacyProgram} />}
      {view === 'assessment' && activeExam && (
        <AssessmentFlow
          examSummary={activeExam}
          onBack={goHome}
          onOpenCertificates={openCertificates}
        />
      )}
      {view === 'assessment' && !activeExam && directExamState === 'loading' && (
        <main className="direct-exam-state" role="status">
          <Loader2 className="spin" size={30} aria-hidden />
          <strong>جاري فتح الاختبار…</strong>
        </main>
      )}
      {view === 'assessment' && !activeExam && directExamState === 'error' && (
        <main className="direct-exam-state">
          <AlertTriangle size={34} aria-hidden />
          <strong>رابط الاختبار غير متاح</strong>
          <p>قد يكون الاختبار غير منشور أو تم حذف الرابط.</p>
          <button className="primary-action" onClick={goHome} type="button">
            العودة إلى الدورات
          </button>
        </main>
      )}
      {view === 'admin' && <AdminPanel onBack={goHome} />}
    </div>
  );
}
