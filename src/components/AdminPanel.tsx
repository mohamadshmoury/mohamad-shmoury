import {
  AlertTriangle,
  BookOpen,
  BookPlus,
  FileQuestion,
  Loader2,
  LockKeyhole,
  LogOut,
  RefreshCw,
  User,
} from 'lucide-react';
import { FormEvent, useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  getAllDawrat,
  getAllExams,
  getQuestions,
  getSubmissions,
} from '../lib/examService';
import type { Dawra, Exam, Question, Submission, CourseStatus } from '../types';

import {
  CourseManager,
  ExamManager,
  QuestionManager,
  SubmissionsManager,
  ProfileManager,
} from './admin';

interface AdminPanelProps {
  onBack: () => void;
}

type AdminTab = 'courses' | 'exams' | 'questions' | 'submissions' | 'profile';

const ADMIN_SESSION_KEY = 'shmoury_admin_authenticated';
const adminCode = import.meta.env.VITE_ADMIN_ACCESS_CODE || '123456';

function normalizeCourseStatus(status: CourseStatus): CourseStatus {
  return status === 'active' ? 'in_progress' : status;
}

export default function AdminPanel({ onBack }: AdminPanelProps) {
  const [authenticated, setAuthenticated] = useState(
    () => sessionStorage.getItem(ADMIN_SESSION_KEY) === 'true',
  );
  const [loginCode, setLoginCode] = useState('');
  const [loginError, setLoginError] = useState('');
  const [activeTab, setActiveTab] = useState<AdminTab>('courses');
  
  const [dawrat, setDawrat] = useState<Dawra[]>([]);
  const [exams, setExams] = useState<Exam[]>([]);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [submissions, setSubmissions] = useState<Submission[]>([]);
  
  const [selectedDawraId, setSelectedDawraId] = useState('');
  const [selectedExamId, setSelectedExamId] = useState('');
  
  const [loading, setLoading] = useState(false);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');

  const activeCourseCount = dawrat.filter((dawra) => normalizeCourseStatus(dawra.status) === 'in_progress').length;
  const completedCourseCount = dawrat.filter((dawra) => dawra.status === 'completed').length;
  const publishedExamCount = exams.filter((exam) => exam.is_published).length;

  useEffect(() => {
    let mounted = true;
    async function loadAllData() {
      if (!authenticated) return;
      setLoading(true);
      setError('');
      try {
        const [dRes, eRes, sRes] = await Promise.all([
          getAllDawrat(),
          getAllExams(),
          getSubmissions(),
        ]);
        if (!mounted) return;
        setDawrat(dRes.filter(d => d.status !== 'archived'));
        setExams(eRes);
        setSubmissions(sRes);
      } catch (err) {
        if (!mounted) return;
        setError(err instanceof Error ? `تعذر تحميل البيانات: ${err.message}` : 'تعذر تحميل البيانات.');
      } finally {
        if (mounted) setLoading(false);
      }
    }
    loadAllData();
    return () => {
      mounted = false;
    };
  }, [authenticated]);

  useEffect(() => {
    let mounted = true;
    async function loadQuestions() {
      if (!authenticated || !selectedExamId) {
        setQuestions([]);
        return;
      }
      setLoading(true);
      try {
        const qRes = await getQuestions(selectedExamId);
        if (!mounted) return;
        setQuestions(qRes);
      } catch (err) {
        if (!mounted) return;
        setError('تعذر تحميل الأسئلة.');
      } finally {
        if (mounted) setLoading(false);
      }
    }
    loadQuestions();
    return () => {
      mounted = false;
    };
  }, [selectedExamId, authenticated]);

  function handleLogin(e: FormEvent) {
    e.preventDefault();
    if (loginCode === adminCode) {
      sessionStorage.setItem(ADMIN_SESSION_KEY, 'true');
      setAuthenticated(true);
      setLoginError('');
    } else {
      setLoginError('الرمز غير صحيح.');
    }
  }

  function logout() {
    sessionStorage.removeItem(ADMIN_SESSION_KEY);
    setAuthenticated(false);
  }

  function handleRefresh() {
    setLoading(true);
    setError('');
    setNotice('');
    Promise.all([getAllDawrat(), getAllExams(), getSubmissions()])
      .then(([dRes, eRes, sRes]) => {
        setDawrat(dRes.filter(d => d.status !== 'archived'));
        setExams(eRes);
        setSubmissions(sRes);
        if (selectedExamId) return getQuestions(selectedExamId);
        return [];
      })
      .then((qRes) => {
        if (qRes.length > 0) setQuestions(qRes);
        setNotice('تم تحديث البيانات.');
      })
      .catch((err) => {
        setError('تعذر تحديث البيانات.');
      })
      .finally(() => setLoading(false));
  }

  if (!authenticated) {
    return (
      <main className="admin-login">
        <form className="login-card" onSubmit={handleLogin}>
          <div className="login-icon">
            <LockKeyhole size={24} aria-hidden />
          </div>
          <h2>دخول الإدارة</h2>
          <p>يرجى إدخال رمز الوصول الخاص بالإدارة للوصول إلى لوحة التحكم.</p>
          <label className="field full">
            <span>رمز الوصول</span>
            <input
              type="password"
              value={loginCode}
              onChange={(e) => setLoginCode(e.target.value)}
              autoFocus
            />
          </label>
          {loginError && <p className="login-error">{loginError}</p>}
          <div className="flow-actions full">
            <button className="secondary-action" onClick={onBack} type="button">
              العودة للرئيسية
            </button>
            <button className="primary-action" type="submit">
              تسجيل الدخول
            </button>
          </div>
        </form>
      </main>
    );
  }

  const tabVariants = {
    hidden: { opacity: 0, y: 10 },
    enter: { opacity: 1, y: 0, transition: { duration: 0.3 } },
    exit: { opacity: 0, y: -10, transition: { duration: 0.2 } },
  };

  return (
    <main className="admin-dashboard">
      <header className="dashboard-header">
        <div className="dashboard-title">
          <BookPlus size={24} aria-hidden />
          <h1>لوحة الإدارة</h1>
        </div>
        <div className="dashboard-actions">
          <button className="secondary-action small" onClick={onBack} type="button">
            العودة للرئيسية
          </button>
          <button className="ghost-action small" onClick={logout} type="button">
            <LogOut size={16} aria-hidden />
            خروج
          </button>
        </div>
      </header>

      <div className="dashboard-overview">
        <div className="overview-stat">
          <span className="stat-value">{activeCourseCount}</span>
          <span className="stat-label">دورة جارية</span>
        </div>
        <div className="overview-stat">
          <span className="stat-value">{completedCourseCount}</span>
          <span className="stat-label">دورة منتهية</span>
        </div>
        <div className="overview-stat">
          <span className="stat-value">{publishedExamCount}</span>
          <span className="stat-label">اختبار منشور</span>
        </div>
        <div className="overview-stat">
          <span className="stat-value">{submissions.length}</span>
          <span className="stat-label">تسليمات</span>
        </div>
      </div>

      <nav className="dashboard-nav" aria-label="أقسام الإدارة">
        <button
          className={activeTab === 'courses' ? 'active' : ''}
          onClick={() => setActiveTab('courses')}
        >
          <BookOpen size={16} aria-hidden />
          الدورات
        </button>
        <button
          className={activeTab === 'exams' ? 'active' : ''}
          onClick={() => setActiveTab('exams')}
        >
          <FileQuestion size={16} aria-hidden />
          الاختبارات
        </button>
        <button
          className={activeTab === 'questions' ? 'active' : ''}
          onClick={() => setActiveTab('questions')}
        >
          <FileQuestion size={16} aria-hidden />
          الأسئلة
        </button>
        <button
          className={activeTab === 'submissions' ? 'active' : ''}
          onClick={() => setActiveTab('submissions')}
        >
          <BookOpen size={16} aria-hidden />
          الإجابات والنتائج
        </button>
        <button
          className={activeTab === 'profile' ? 'active' : ''}
          onClick={() => setActiveTab('profile')}
        >
          <User size={16} aria-hidden />
          نبذة الشيخ
        </button>
      </nav>

      <div className="dashboard-controls">
        <button className="ghost-action small" onClick={handleRefresh} disabled={loading} type="button">
          {loading ? <Loader2 className="spin" size={16} aria-hidden /> : <RefreshCw size={16} aria-hidden />}
          تحديث البيانات
        </button>
        {notice && <span className="notice-banner">{notice}</span>}
        {error && (
          <span className="error-banner">
            <AlertTriangle size={16} aria-hidden />
            {error}
          </span>
        )}
      </div>

      <AnimatePresence mode="wait">
        <motion.div
          key={activeTab}
          variants={tabVariants}
          initial="hidden"
          animate="enter"
          exit="exit"
          className="dashboard-tab-content"
        >
          {activeTab === 'courses' && (
            <CourseManager
              dawrat={dawrat}
              setDawrat={setDawrat}
              exams={exams}
              setExams={setExams}
              selectedDawraId={selectedDawraId}
              selectDawra={setSelectedDawraId}
              setActiveTab={setActiveTab}
              setSelectedExamId={setSelectedExamId}
              loading={loading}
              setLoading={setLoading}
              setNotice={setNotice}
              setError={setError}
            />
          )}

          {activeTab === 'exams' && (
            <ExamManager
              dawrat={dawrat}
              exams={exams}
              selectedDawraId={selectedDawraId}
              selectDawra={setSelectedDawraId}
              setExams={setExams}
              setSelectedExamId={setSelectedExamId}
              setActiveTab={setActiveTab}
              loading={loading}
              setLoading={setLoading}
              setNotice={setNotice}
              setError={setError}
            />
          )}

          {activeTab === 'questions' && (
            <QuestionManager
              exams={exams}
              selectedExamId={selectedExamId}
              setSelectedExamId={setSelectedExamId}
              questions={questions}
              setQuestions={setQuestions}
              loading={loading}
              setLoading={setLoading}
              setNotice={setNotice}
              setError={setError}
            />
          )}

          {activeTab === 'submissions' && (
            <SubmissionsManager
              exams={exams}
              selectedExamId={selectedExamId}
              setSelectedExamId={setSelectedExamId}
              submissions={submissions}
              setSubmissions={setSubmissions}
              loading={loading}
              setLoading={setLoading}
              setNotice={setNotice}
              setError={setError}
            />
          )}

          {activeTab === 'profile' && (
            <ProfileManager
              loading={loading}
              setLoading={setLoading}
              setNotice={setNotice}
              setError={setError}
            />
          )}
        </motion.div>
      </AnimatePresence>
    </main>
  );
}
