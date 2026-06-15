insert into public.shmoury_dawrat (
  id,
  title,
  subtitle,
  description,
  sheikh_intro,
  status,
  theme_color
) values (
  '11111111-1111-4111-8111-111111111111',
  'دورة آداب طالب العلم',
  'مسار تأسيسي مختصر',
  'دورة نموذجية يمكن تعديلها أو حذفها من قاعدة البيانات بعد تجربة المنصة.',
  'هذه الصفحة مخصصة لجمع الدورات التي تقام باسم الشيخ محمد أحمد الشموري، وربط كل دورة باختبار منظم يحفظ مشاركات الطلاب ونتائجهم.',
  'active',
  '#0f766e'
) on conflict (id) do nothing;

insert into public.shmoury_exams (
  id,
  dawra_id,
  title,
  description,
  access_code,
  passing_score,
  allow_multiple_attempts,
  is_published
) values (
  '22222222-2222-4222-8222-222222222222',
  '11111111-1111-4111-8111-111111111111',
  'اختبار تمهيدي في آداب طالب العلم',
  'اختبار قصير لتجربة طريقة الأسئلة.',
  'SHMOURY',
  70,
  false,
  true
) on conflict (id) do nothing;

insert into public.shmoury_questions (
  id,
  exam_id,
  prompt,
  type,
  options,
  correct_answer,
  points,
  sort_order
) values
(
  '33333333-3333-4333-8333-333333333331',
  '22222222-2222-4222-8222-222222222222',
  'من آداب طالب العلم أن يضبط نيته قبل الطلب.',
  'true_false',
  '[]'::jsonb,
  '{"value":"true"}'::jsonb,
  1,
  1
),
(
  '33333333-3333-4333-8333-333333333332',
  '22222222-2222-4222-8222-222222222222',
  'أي مما يأتي أقرب إلى معنى المذاكرة النافعة؟',
  'multiple_choice',
  '["تكرار المسائل بلا فهم","مراجعة العلم مع الفهم والسؤال","ترك الكتاب بعد الدرس","الاكتفاء بالسماع فقط"]'::jsonb,
  '{"value":"مراجعة العلم مع الفهم والسؤال"}'::jsonb,
  1,
  2
),
(
  '33333333-3333-4333-8333-333333333333',
  '22222222-2222-4222-8222-222222222222',
  'اكتب كلمة واحدة تدل على أساس طلب العلم.',
  'short_answer',
  '[]'::jsonb,
  '{"values":["الإخلاص","اخلاص"]}'::jsonb,
  1,
  3
) on conflict (id) do nothing;
