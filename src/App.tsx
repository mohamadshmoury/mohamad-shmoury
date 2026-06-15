import { BookOpen, GraduationCap, LayoutDashboard } from 'lucide-react';
import { useState } from 'react';
import AdminPanel from './components/AdminPanel';
import AssessmentFlow from './components/AssessmentFlow';
import PublicSite from './components/PublicSite';
import type { Exam } from './types';

type View = 'home' | 'assessment' | 'admin';

export default function App() {
  const [view, setView] = useState<View>('home');
  const [activeExam, setActiveExam] = useState<Exam | null>(null);

  function startExam(exam: Exam) {
    setActiveExam(exam);
    setView('assessment');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function goHome() {
    setActiveExam(null);
    setView('home');
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
            className={`nav-btn ${view === 'admin' ? 'active' : ''}`}
            onClick={() => setView('admin')}
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
      {view === 'assessment' && activeExam && (
        <AssessmentFlow examSummary={activeExam} onBack={goHome} />
      )}
      {view === 'admin' && <AdminPanel onBack={goHome} />}
    </div>
  );
}
