import type { Exam } from '../types';

export const demoExams: Exam[] = [
  {
    id: 'demo-shmoury-001',
    dawra_id: 'demo-dawra-001',
    title: 'اختبار تمهيدي في آداب طالب العلم',
    description: 'اختبار قصير يوضح طريقة عرض الأسئلة وتسليم الإجابات.',
    access_code: 'SHMOURY',
    passing_score: 70,
    allow_multiple_attempts: true,
    show_results_immediately: true,
    ends_at: null,
    show_answers_after_end: false,
    is_published: true,
    dawra: {
      id: 'demo-dawra-001',
      title: 'دورة آداب طالب العلم',
      subtitle: 'مسار تأسيسي مختصر',
      description:
        'دورة نموذجية قابلة للاستبدال من لوحة الإدارة بعد إنشاء الجداول في Supabase.',
      sheikh_intro:
        'هذه الصفحة مخصصة لجمع الدورات التي تقام باسم الشيخ محمد أحمد الشموري، وربط كل دورة باختبار منظم يحفظ مشاركات الطلاب ونتائجهم.',
      starts_on: null,
      status: 'active',
      theme_color: '#0f766e',
      duration: '4 أسابيع',
      attachments: [
        {
          id: 'demo-material-001',
          name: 'كتاب آداب طالب العلم (PDF)',
          url: 'https://example.com/book.pdf',
          kind: 'file',
          week: 'مواد عامة',
        },
        {
          id: 'demo-material-002',
          name: 'تسجيل المحاضرة الأولى',
          url: 'https://example.com/lecture-1',
          kind: 'link',
          week: 'الأسبوع الأول',
        },
        {
          id: 'demo-material-003',
          name: 'ملخص المحاضرة الثانية',
          url: 'https://example.com/week-2-notes.pdf',
          kind: 'file',
          week: 'الأسبوع الثاني',
        },
      ]
    },
    questions: [
      {
        id: 'demo-q1',
        exam_id: 'demo-shmoury-001',
        prompt: 'من آداب طالب العلم أن يضبط نيته قبل الطلب.',
        type: 'true_false',
        options: ['true', 'false'],
        correct_answer: { value: 'true' },
        points: 1,
        sort_order: 1,
        explanation: null,
      },
      {
        id: 'demo-q2',
        exam_id: 'demo-shmoury-001',
        prompt: 'أي مما يأتي أقرب إلى معنى المذاكرة النافعة؟',
        type: 'multiple_choice',
        options: ['تكرار المسائل بلا فهم', 'مراجعة العلم مع الفهم والسؤال', 'ترك الكتاب بعد الدرس', 'الاكتفاء بالسماع فقط'],
        correct_answer: { value: 'مراجعة العلم مع الفهم والسؤال' },
        points: 1,
        sort_order: 2,
        explanation: null,
      },
      {
        id: 'demo-q3',
        exam_id: 'demo-shmoury-001',
        prompt: 'اكتب كلمة واحدة تدل على أساس طلب العلم.',
        type: 'short_answer',
        options: [],
        correct_answer: { values: ['الإخلاص', 'اخلاص'] },
        points: 1,
        sort_order: 3,
        explanation: null,
      },
    ],
  },
];
