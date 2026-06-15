import {
  AlertCircle,
  BookOpen,
  CalendarDays,
  GraduationCap,
  KeyRound,
  Loader2,
  LockKeyhole,
  Unlock,
  Clock,
  FileText,
  Files,
  Hourglass,
  ListChecks,
  User,
  ArrowDown,
} from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { demoExams } from '../lib/demoData';
import { getPublishedExams, getAllDawrat, getSheikhProfile } from '../lib/examService';
import type { CourseStatus, Exam, Dawra, SheikhProfile } from '../types';

interface PublicSiteProps {
  onStartExam: (exam: Exam) => void;
}

interface CardState {
  code: string;
  error: string;
  unlocking: boolean;
}

function ExamStarter({
  exam,
  onStart,
}: {
  exam: Exam;
  onStart: (exam: Exam) => void;
}) {
  const requiresCode = !!exam.access_code;
  const [card, setCard] = useState<CardState>({ code: '', error: '', unlocking: false });
  const inputRef = useRef<HTMLInputElement>(null);

  function handleUnlock() {
    const entered = card.code.trim().toUpperCase();
    const expected = (exam.access_code || '').trim().toUpperCase();

    if (!entered) {
      setCard((c) => ({ ...c, error: 'أدخل رمز الدخول' }));
      inputRef.current?.focus();
      return;
    }

    if (entered !== expected) {
      setCard((c) => ({ ...c, error: 'الرمز غير صحيح', code: '' }));
      inputRef.current?.focus();
      return;
    }

    setCard((c) => ({ ...c, unlocking: true, error: '' }));
    setTimeout(() => onStart(exam), 350);
  }

  function handleCodeChange(value: string) {
    setCard((c) => ({ ...c, code: value, error: '' }));
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter') handleUnlock();
  }

  if (requiresCode) {
    return (
      <div className="access-code-form">
        <div className="access-code-input-row">
          <input
            ref={inputRef}
            className="access-code-input"
            type="text"
            value={card.code}
            onChange={(e) => handleCodeChange(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="رمز الدخول"
            maxLength={20}
            autoComplete="off"
            aria-label="رمز الدخول للاختبار"
            disabled={card.unlocking}
          />
          <button
            className="primary-action start-exam-btn"
            onClick={handleUnlock}
            disabled={card.unlocking}
            type="button"
          >
            {card.unlocking ? (
              <Loader2 size={14} className="spin" aria-hidden />
            ) : (
              <Unlock size={14} aria-hidden />
            )}
            دخول
          </button>
        </div>
        {card.error && (
          <p className="access-error" role="alert">
            <AlertCircle size={12} aria-hidden />
            {card.error}
          </p>
        )}
      </div>
    );
  }

  return (
    <button
      className="primary-action start-exam-btn"
      onClick={() => onStart(exam)}
      type="button"
    >
      <KeyRound size={14} aria-hidden />
      بدء الاختبار
    </button>
  );
}

function formatCourseDate(date: string | null) {
  if (!date) return '';
  return new Intl.DateTimeFormat('ar', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(new Date(`${date}T00:00:00`));
}

const COURSE_STATUS_LABELS: Record<CourseStatus, string> = {
  draft: 'قادمة',
  active: 'قيد التنفيذ',
  in_progress: 'قيد التنفيذ',
  completed: 'منتهية',
  archived: 'مؤرشفة',
};

const COURSE_STATUS_ORDER: Record<CourseStatus, number> = {
  in_progress: 0,
  active: 0,
  completed: 1,
  draft: 2,
  archived: 3,
};

function normalizeCourseStatus(status: CourseStatus): CourseStatus {
  return status === 'active' ? 'in_progress' : status;
}

const itemVariants = {
  hidden: { opacity: 0, y: 20 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.4 } },
};

function CourseCard({
  dawra,
  exams,
  demoMode,
  onStartExam,
}: {
  dawra: Dawra;
  exams: Exam[];
  demoMode: boolean;
  onStartExam: (exam: Exam) => void;
}) {
  const status = normalizeCourseStatus(dawra.status);
  const isInProgress = status === 'in_progress';
  const isCompleted = status === 'completed';
  const formattedStartDate = formatCourseDate(dawra.starts_on);
  const attachmentCount = dawra.attachments?.length || 0;
  const cardStateClass = isInProgress ? 'is-live' : isCompleted ? 'is-completed' : 'is-upcoming';
  const badgeClass = demoMode
    ? 'badge-demo'
    : isInProgress
      ? 'badge-published'
      : isCompleted
        ? 'badge-completed'
        : 'badge-upcoming';

  return (
    <motion.article variants={itemVariants} className={`course-card ${cardStateClass}`} aria-label={dawra.title}>
      <div className="course-card-accent" />
      <div className="course-card-body">
        <div className="course-card-meta">
          <span className={`course-badge ${badgeClass}`}>
            <BookOpen size={12} aria-hidden />
            {demoMode ? 'تجريبي' : COURSE_STATUS_LABELS[status]}
          </span>
          {formattedStartDate && (
            <span className="badge-duration">
              <CalendarDays size={12} aria-hidden />
              {formattedStartDate}
            </span>
          )}
          {!formattedStartDate && dawra.duration && (
            <span className="badge-duration">
              <Clock size={12} aria-hidden />
              {dawra.duration}
            </span>
          )}
        </div>

        <div className="course-title-block">
          <h2>{dawra.title}</h2>
          {dawra.subtitle && <p className="course-subtitle">{dawra.subtitle}</p>}
          {dawra.description && <p className="course-desc">{dawra.description}</p>}
        </div>

        <div className="course-detail-strip" aria-label="تفاصيل الدورة">
          <span>
            <ListChecks size={15} aria-hidden />
            {isInProgress ? `${exams.length} اختبار منشور` : isCompleted ? 'مواد الدورة محفوظة' : 'تظهر للزوار'}
          </span>
          <span>
            <Files size={15} aria-hidden />
            {attachmentCount ? `${attachmentCount} مرفق` : 'بدون مرفقات'}
          </span>
          {dawra.duration && (
            <span>
              <Clock size={15} aria-hidden />
              {dawra.duration}
            </span>
          )}
        </div>

        {dawra.attachments && dawra.attachments.length > 0 && (
          <div className="course-files-section">
            <span className="files-section-title">مرفقات الدورة:</span>
            <div className="attachments-grid">
              {dawra.attachments.map((file, idx) => (
                <a
                  key={idx}
                  href={file.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="attachment-download-link"
                >
                  <FileText size={14} />
                  <span>{file.name}</span>
                </a>
              ))}
            </div>
          </div>
        )}

        <div className="course-action-panel">
          {isCompleted ? (
            <div className="course-referral-panel is-completed">
              <BookOpen size={20} aria-hidden />
              <div>
                <strong>اكتملت الدورة</strong>
                <span>تبقى المعلومات والمواد متاحة للرجوع إليها.</span>
              </div>
            </div>
          ) : !isInProgress ? (
            <div className="course-referral-panel">
              <Hourglass size={20} aria-hidden />
              <div>
                <strong>الدورة قادمة</strong>
                <span>تبقى ظاهرة للزوار حتى يعرفوا ما سيُفتح لاحقًا.</span>
              </div>
            </div>
          ) : exams.length === 0 ? (
            <p className="no-exams-msg">لا توجد اختبارات منشورة لهذه الدورة حالياً.</p>
          ) : (
            <div className="nested-exams-list">
              {exams.map((exam) => (
                <div key={exam.id} className="nested-exam-row">
                  <div className="nested-exam-info">
                    <strong>{exam.title}</strong>
                    {exam.description && <p className="nested-exam-desc">{exam.description}</p>}
                    <span className="nested-exam-badge">
                      درجة النجاح: {exam.passing_score}%
                      {!exam.show_results_immediately && ' • تُعلن النتائج لاحقاً'}
                    </span>
                  </div>
                  <div className="nested-exam-action">
                    <ExamStarter exam={exam} onStart={onStartExam} />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </motion.article>
  );
}

const containerVariants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: {
      staggerChildren: 0.1,
    },
  },
};

export default function PublicSite({ onStartExam }: PublicSiteProps) {
  const [dawrat, setDawrat] = useState<Dawra[]>([]);
  const [exams, setExams] = useState<Exam[]>([]);
  const [profile, setProfile] = useState<SheikhProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [demoMode, setDemoMode] = useState(false);
  const activeCourseCount = dawrat.filter((dawra) => normalizeCourseStatus(dawra.status) === 'in_progress').length;
  const completedCourseCount = dawrat.filter((dawra) => dawra.status === 'completed').length;
  const examCount = exams.length;

  useEffect(() => {
    let mounted = true;

    async function loadData() {
      setLoading(true);
      try {
        const [profileData, examsData, dawratData] = await Promise.all([
          getSheikhProfile(),
          getPublishedExams(),
          getAllDawrat(),
        ]);
        if (!mounted) return;
        setProfile(profileData);
        setExams(examsData);
        setDawrat(
          dawratData
            .filter((dawra) => dawra.status !== 'archived')
            .sort((a, b) => {
              const statusDiff = COURSE_STATUS_ORDER[normalizeCourseStatus(a.status)] - COURSE_STATUS_ORDER[normalizeCourseStatus(b.status)];
              if (statusDiff !== 0) return statusDiff;
              return (a.starts_on || '').localeCompare(b.starts_on || '');
            }),
        );
        setDemoMode(false);
      } catch (error) {
        console.warn('Supabase fetch failed, falling back to demo mode:', error);
        if (!mounted) return;

        // Offline / Fallback parsing
        const uniqueDawras: Record<string, Dawra> = {};
        demoExams.forEach((exam) => {
          if (exam.dawra) {
            uniqueDawras[exam.dawra.id] = exam.dawra;
          }
        });

        // Try getting profile from local fallback directly
        try {
          const profileData = await getSheikhProfile();
          setProfile(profileData);
        } catch {
          setProfile({
            id: 1,
            bio: 'هذه الصفحة مخصصة لجمع الدورات التي تقام باسم الشيخ محمد أحمد الشموري، وربط كل دورة باختبار منظم يحفظ مشاركات الطلاب ونتائجهم.',
            avatar_url: '',
          });
        }

        setDawrat(Object.values(uniqueDawras));
        setExams(demoExams);
        setDemoMode(true);
      } finally {
        if (mounted) setLoading(false);
      }
    }

    loadData();
    return () => {
      mounted = false;
    };
  }, []);

  return (
    <motion.main 
      className="home-page"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.5 }}
    >
      {/* ── Hero ── */}
      <section className="hero" aria-label="مقدمة المنصة">
        <div className="hero-pattern" aria-hidden />
        <div className="hero-inner">
          <motion.span 
            className="hero-eyebrow"
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
          >
            <BookOpen size={14} aria-hidden />
            منصة دورات علمية
          </motion.span>
          <motion.h1
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: 0.3 }}
          >
            دورات الشيخ محمد أحمد الشموري
          </motion.h1>
          <motion.p 
            className="hero-tagline"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.4 }}
          >
          </motion.p>
          <motion.div 
            className="hero-actions"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.5 }}
          >
            <a className="primary-action hero-cta" href="#courses">
              <GraduationCap size={18} aria-hidden />
              استعراض الدورات
              <ArrowDown size={17} aria-hidden />
            </a>
          </motion.div>
          <motion.div 
            className="hero-metrics" 
            aria-label="ملخص الدورات"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.6 }}
          >
            <span>
              <strong>{loading ? '…' : activeCourseCount}</strong>
              <small>قيد التنفيذ</small>
            </span>
            <span>
              <strong>{loading ? '…' : completedCourseCount}</strong>
              <small>منتهية</small>
            </span>
            <span>
              <strong>{loading ? '…' : examCount}</strong>
              <small>اختبار منشور</small>
            </span>
          </motion.div>
        </div>
      </section>

      {/* ── Sheikh Profile Intro ── */}
      <motion.section 
        className="sheikh-profile-section" 
        aria-label="نبذة عن الشيخ"
        initial={{ opacity: 0, y: 20 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true }}
        transition={{ duration: 0.5 }}
      >
        <div className="sheikh-profile-card">
          <div className="sheikh-avatar-container">
            {profile?.avatar_url ? (
              <img
                src={profile.avatar_url}
                alt="الشيخ محمد أحمد الشموري"
                className="sheikh-avatar"
                onError={(e) => {
                  // Fallback if image fails to load
                  (e.target as HTMLImageElement).src = 'https://www.w3schools.com/howto/img_avatar.png';
                }}
              />
            ) : (
              <div className="sheikh-avatar-placeholder">
                <User size={36} />
              </div>
            )}
          </div>
          <div className="sheikh-profile-info">
            <span className="profile-kicker">إشراف علمي</span>
            <h2>الشيخ محمد أحمد الشموري</h2>
            <p className="sheikh-bio">
              {profile?.bio || 'مرحبًا بكم في منصة الشيخ محمد أحمد الشموري التعليمية للدورات العلمية والشرعية.'}
            </p>
          </div>
        </div>
      </motion.section>

      {/* ── Courses ── */}
      <section className="courses-section" id="courses" aria-labelledby="courses-heading">
        <div className="section-header">
          <div>
            <span className="section-label-icon" aria-hidden>
              <GraduationCap size={20} />
            </span>
            <h2 id="courses-heading" className="section-label">الدورات العلمية</h2>
          </div>
        </div>

        {loading && (
          <div className="state-center" role="status" aria-live="polite">
            <Loader2 className="spin" size={28} aria-hidden />
            <span>جاري تحميل الدورات…</span>
          </div>
        )}

        {!loading && dawrat.length === 0 && (
          <div className="state-center">
            <GraduationCap size={36} aria-hidden />
            <strong>لا توجد دورات معروضة بعد</strong>
            <span>يمكن إنشاء دورة قيد التنفيذ أو مكتملة أو قادمة من لوحة الإدارة.</span>
          </div>
        )}

        {!loading && dawrat.length > 0 && (
          <motion.div 
            className="course-grid"
            variants={containerVariants}
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true, margin: "-50px" }}
          >
            {dawrat.map((dawra) => {
              const dawraExams = exams.filter((exam) => exam.dawra_id === dawra.id);
              return (
                <CourseCard
                  key={dawra.id}
                  dawra={dawra}
                  exams={dawraExams}
                  demoMode={demoMode}
                  onStartExam={onStartExam}
                />
              );
            })}
          </motion.div>
        )}
      </section>
    </motion.main>
  );
}
