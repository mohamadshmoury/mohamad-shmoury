import { AlertTriangle, Award, BookOpen, GraduationCap, LayoutDashboard, Loader2 } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import AdminPanel from './components/AdminPanel';
import AssessmentFlow from './components/AssessmentFlow';
import GhawthaniIjazahPage from './components/GhawthaniIjazahPage';
import PublicSite from './components/PublicSite';
import { getPublishedExamWithQuestions } from './lib/examService';
import { getExamReferenceFromUrl, getExamShareUrl } from './lib/examLinks';
import type { Exam } from './types';

type View = 'home' | 'assessment' | 'admin' | 'ghawthani';
type DirectExamState = 'idle' | 'loading' | 'error';

export default function App() {
  const [view, setView] = useState<View>('home');
  const [activeExam, setActiveExam] = useState<Exam | null>(null);
  const [directExamState, setDirectExamState] = useState<DirectExamState>('idle');
  const routeRequestRef = useRef(0);

  const openExamFromUrl = useCallback(async () => {
    const requestId = ++routeRequestRef.current;
    if (window.location.pathname.replace(/\/+$/, '').toLowerCase() === '/ejazaghawthani') {
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

  function openGhawthani() {
    routeRequestRef.current += 1;
    window.history.pushState({}, '', '/ejazaGhawthani');
    setActiveExam(null);
    setDirectExamState('idle');
    setView('ghawthani');
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
          <button
            className={`nav-btn ${view === 'ghawthani' ? 'active' : ''}`}
            onClick={openGhawthani}
            type="button"
            aria-label="إجازة وشهادة الغوثاني"
            aria-current={view === 'ghawthani' ? 'page' : undefined}
          >
            <Award size={17} aria-hidden />
            <span>الإجازة والشهادة</span>
          </button>
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
      {view === 'ghawthani' && <GhawthaniIjazahPage onBack={goHome} />}
      {view === 'assessment' && activeExam && (
        <AssessmentFlow examSummary={activeExam} onBack={goHome} />
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
