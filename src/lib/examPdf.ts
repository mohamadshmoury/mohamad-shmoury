import { getCorrectAnswerLabel } from './scoring';
import type { Exam, Question, QuestionType } from '../types';

const OPTION_LABELS = ['أ', 'ب', 'ج', 'د', 'هـ', 'و'];

function escapeHtml(value: string | number | null | undefined) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function questionTypeLabel(type: QuestionType) {
  if (type === 'multiple_choice') return 'اختيار من متعدد';
  if (type === 'true_false') return 'صح أو خطأ';
  return 'إجابة قصيرة';
}

function optionLabel(index: number) {
  return OPTION_LABELS[index] || String(index + 1);
}

function renderOptions(question: Question) {
  if (question.type === 'short_answer') return '';

  const options =
    question.type === 'true_false'
      ? [
          { value: 'true', label: 'صح' },
          { value: 'false', label: 'خطأ' },
        ]
      : question.options.map((option) => ({ value: option, label: option }));

  return `
    <div class="options">
      ${options
        .map((option, index) => {
          const correct = option.value === question.correct_answer.value;
          return `
            <div class="option ${correct ? 'is-correct' : ''}">
              <span class="option-marker">${correct ? '✓' : ''}</span>
              ${
                question.type === 'multiple_choice'
                  ? `<strong>${optionLabel(index)}</strong>`
                  : ''
              }
              <span>${escapeHtml(option.label)}</span>
            </div>
          `;
        })
        .join('')}
    </div>
  `;
}

function detailedCorrectAnswer(question: Question) {
  const answer = getCorrectAnswerLabel(question);
  if (question.type !== 'multiple_choice') return answer;

  const correctIndex = question.options.findIndex(
    (option) => option === question.correct_answer.value,
  );
  return correctIndex >= 0 ? `الخيار ${optionLabel(correctIndex)}: ${answer}` : answer;
}

function renderQuestionWithAnswer(question: Question, index: number) {
  return `
    <article class="question-answer-card">
      <div class="question-heading">
        <span class="question-number">${index + 1}</span>
        <div>
          <span class="question-type">${questionTypeLabel(question.type)}</span>
          <h2>${escapeHtml(question.prompt)}</h2>
        </div>
        <span class="points">${escapeHtml(question.points)} نقطة</span>
      </div>

      ${renderOptions(question)}

      <div class="correct-answer">
        <span>الإجابة الصحيحة</span>
        <strong>${escapeHtml(detailedCorrectAnswer(question))}</strong>
      </div>

      ${
        question.explanation
          ? `<div class="explanation"><span>التوضيح</span><p>${escapeHtml(question.explanation)}</p></div>`
          : ''
      }
    </article>
  `;
}

export function buildExamPrintHtml(exam: Exam) {
  const questions = exam.questions || [];
  const totalPoints = questions.reduce(
    (total, question) => total + Number(question.points || 0),
    0,
  );
  const generatedOn = new Intl.DateTimeFormat('ar-LB', {
    dateStyle: 'long',
    timeStyle: 'short',
  }).format(new Date());

  return `<!doctype html>
    <html lang="ar" dir="rtl">
      <head>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <title>${escapeHtml(exam.title)} - الأسئلة والإجابات</title>
        <style>
          :root {
            color-scheme: light;
            font-family: "Noto Naskh Arabic", "Geeza Pro", Tahoma, Arial, sans-serif;
            color: #17211f;
            background: #edf2ef;
          }

          * { box-sizing: border-box; }
          body { margin: 0; background: #edf2ef; }

          .print-toolbar {
            position: sticky;
            top: 0;
            z-index: 10;
            display: flex;
            justify-content: center;
            align-items: center;
            gap: 10px;
            padding: 12px;
            background: #17211f;
            color: #fff;
            box-shadow: 0 5px 20px rgba(0, 0, 0, 0.15);
          }

          .print-toolbar span { margin-left: 12px; font-size: 14px; }
          .print-toolbar button {
            border: 0;
            border-radius: 9px;
            padding: 9px 16px;
            font: inherit;
            font-weight: 800;
            cursor: pointer;
          }
          .print-button { background: #0d7a6f; color: #fff; }
          .close-button { background: #fff; color: #17211f; }

          .print-sheet {
            width: min(210mm, calc(100% - 24px));
            min-height: 297mm;
            margin: 20px auto;
            padding: 14mm;
            background: #fff;
            box-shadow: 0 12px 45px rgba(24, 47, 41, 0.14);
          }

          .document-header {
            display: grid;
            grid-template-columns: 1fr auto;
            gap: 14px;
            align-items: start;
            padding-bottom: 14px;
            border-bottom: 3px solid #0d7a6f;
          }

          .brand { color: #0d7a6f; font-size: 14px; font-weight: 900; }
          h1 { margin: 5px 0 3px; font-size: 25px; line-height: 1.45; }
          .course-title { color: #52635f; font-size: 14px; font-weight: 700; }
          .document-label {
            border: 1px solid #0d7a6f;
            border-radius: 999px;
            padding: 6px 11px;
            color: #0d7a6f;
            font-size: 12px;
            font-weight: 900;
            white-space: nowrap;
          }

          .exam-description {
            margin: 12px 0 0;
            color: #52635f;
            line-height: 1.8;
            white-space: pre-wrap;
          }

          .meta-grid {
            display: grid;
            grid-template-columns: repeat(3, 1fr);
            gap: 8px;
            margin: 15px 0 18px;
          }

          .meta-item {
            border: 1px solid #dce6e1;
            border-radius: 10px;
            padding: 9px 10px;
            background: #f7faf8;
          }

          .meta-item span {
            display: block;
            margin-bottom: 2px;
            color: #667772;
            font-size: 11px;
          }
          .meta-item strong { font-size: 13px; }

          .section-heading {
            display: flex;
            align-items: center;
            justify-content: space-between;
            gap: 12px;
            margin: 0 0 10px;
          }
          .section-heading h2 { margin: 0; font-size: 19px; }
          .section-heading span { color: #667772; font-size: 12px; font-weight: 700; }

          .question-list { display: grid; gap: 11px; }
          .question-answer-card {
            break-inside: avoid;
            page-break-inside: avoid;
            border: 1px solid #dce6e1;
            border-radius: 11px;
            padding: 12px;
          }

          .question-heading {
            display: grid;
            grid-template-columns: 28px 1fr auto;
            gap: 9px;
            align-items: start;
          }

          .question-number {
            display: grid;
            place-items: center;
            width: 28px;
            height: 28px;
            border-radius: 50%;
            background: #0d7a6f;
            color: #fff;
            font-size: 13px;
            font-weight: 900;
          }

          .question-type {
            color: #0d7a6f;
            font-size: 10px;
            font-weight: 900;
          }

          .question-heading h2 {
            margin: 2px 0 0;
            font-size: 15px;
            line-height: 1.7;
          }

          .points {
            color: #667772;
            font-size: 10px;
            font-weight: 800;
            white-space: nowrap;
          }

          .options {
            display: grid;
            grid-template-columns: repeat(2, minmax(0, 1fr));
            gap: 7px 12px;
            margin: 10px 37px 0 0;
          }

          .option {
            display: flex;
            align-items: flex-start;
            gap: 7px;
            border: 1px solid transparent;
            border-radius: 7px;
            padding: 5px 7px;
            color: #43514e;
            font-size: 12px;
            line-height: 1.55;
          }

          .option.is-correct {
            border-color: #9bcfc7;
            background: #eef9f6;
            color: #075f57;
            font-weight: 800;
          }

          .option-marker {
            display: grid;
            place-items: center;
            flex: 0 0 auto;
            width: 16px;
            height: 16px;
            margin-top: 1px;
            border: 1px solid #7b8985;
            border-radius: 50%;
            font-size: 11px;
          }

          .option.is-correct .option-marker {
            border-color: #0d7a6f;
            background: #0d7a6f;
            color: #fff;
          }

          .correct-answer {
            display: grid;
            grid-template-columns: auto 1fr;
            gap: 10px;
            align-items: baseline;
            margin: 11px 37px 0 0;
            border-right: 4px solid #0d7a6f;
            border-radius: 7px;
            padding: 8px 10px;
            background: #eef9f6;
          }

          .correct-answer span {
            color: #52635f;
            font-size: 11px;
            font-weight: 800;
          }
          .correct-answer strong {
            color: #075f57;
            font-size: 14px;
            line-height: 1.65;
          }

          .explanation {
            margin: 8px 37px 0 0;
            padding: 7px 10px;
            border-radius: 7px;
            background: #fff8e8;
            color: #6b5323;
          }
          .explanation span { font-size: 10px; font-weight: 900; }
          .explanation p { margin: 2px 0 0; font-size: 12px; line-height: 1.65; }

          .document-footer {
            margin-top: 18px;
            padding-top: 9px;
            border-top: 1px solid #dce6e1;
            color: #74817d;
            font-size: 10px;
            text-align: center;
          }

          @page { size: A4; margin: 12mm; }

          @media print {
            :root, body { background: #fff; }
            .print-toolbar { display: none !important; }
            .print-sheet {
              width: auto;
              min-height: auto;
              margin: 0;
              padding: 0;
              box-shadow: none;
            }
          }

          @media screen and (max-width: 680px) {
            .print-sheet { padding: 18px; }
            .meta-grid, .options { grid-template-columns: 1fr; }
            .print-toolbar span { display: none; }
          }
        </style>
      </head>
      <body>
        <div class="print-toolbar">
          <span>كل سؤال متبوع بإجابته الصحيحة. اختر "حفظ بتنسيق PDF" من نافذة الطباعة.</span>
          <button class="print-button" id="print-exam" type="button">طباعة / حفظ PDF</button>
          <button class="close-button" id="close-preview" type="button">إغلاق</button>
        </div>

        <main class="print-sheet">
          <header class="document-header">
            <div>
              <div class="brand">منصة الشيخ محمد أحمد الشموري</div>
              <h1>${escapeHtml(exam.title)}</h1>
              <div class="course-title">${escapeHtml(exam.dawra?.title || 'اختبار مستقل')}</div>
            </div>
            <span class="document-label">الأسئلة والإجابات</span>
          </header>

          ${
            exam.description
              ? `<p class="exam-description">${escapeHtml(exam.description)}</p>`
              : ''
          }

          <div class="meta-grid">
            <div class="meta-item"><span>عدد الأسئلة</span><strong>${questions.length}</strong></div>
            <div class="meta-item"><span>الدرجة الكاملة</span><strong>${totalPoints} نقطة</strong></div>
            <div class="meta-item"><span>درجة النجاح</span><strong>${escapeHtml(exam.passing_score)}%</strong></div>
          </div>

          <div class="section-heading">
            <h2>الأسئلة مع الإجابات الصحيحة</h2>
            <span>الإجابة تظهر مباشرة تحت كل سؤال</span>
          </div>

          <div class="question-list">
            ${questions.map(renderQuestionWithAnswer).join('')}
          </div>

          <footer class="document-footer">
            تم إنشاء هذا المستند من لوحة الإدارة بتاريخ ${escapeHtml(generatedOn)}
          </footer>
        </main>
      </body>
    </html>`;
}

export function openExamPrintWindow() {
  const printWindow = window.open('', '_blank', 'popup,width=980,height=820');
  if (!printWindow) return null;

  printWindow.document.open();
  printWindow.document.write(`<!doctype html>
    <html lang="ar" dir="rtl">
      <head><meta charset="utf-8"><title>جاري تجهيز الأسئلة والإجابات</title></head>
      <body style="font-family: Tahoma, Arial, sans-serif; display:grid; place-items:center; min-height:90vh;">
        <p>جاري تجهيز ملف الأسئلة والإجابات...</p>
      </body>
    </html>`);
  printWindow.document.close();
  return printWindow;
}

export function renderExamPrintPreview(printWindow: Window, exam: Exam) {
  printWindow.document.open();
  printWindow.document.write(buildExamPrintHtml(exam));
  printWindow.document.close();

  printWindow.document
    .getElementById('print-exam')
    ?.addEventListener('click', () => printWindow.print());
  printWindow.document
    .getElementById('close-preview')
    ?.addEventListener('click', () => printWindow.close());

  const openPrintDialog = async () => {
    await printWindow.document.fonts?.ready;
    printWindow.focus();
    printWindow.print();
  };

  printWindow.setTimeout(openPrintDialog, 300);
}

export function renderExamPrintError(printWindow: Window, message: string) {
  printWindow.document.open();
  printWindow.document.write(`<!doctype html>
    <html lang="ar" dir="rtl">
      <head><meta charset="utf-8"><title>تعذر تجهيز الأسئلة والإجابات</title></head>
      <body style="font-family: Tahoma, Arial, sans-serif; display:grid; place-items:center; min-height:90vh; color:#8f2f2f;">
        <div style="text-align:center">
          <h1 style="font-size:22px">تعذر تجهيز ملف الأسئلة والإجابات</h1>
          <p>${escapeHtml(message)}</p>
        </div>
      </body>
    </html>`);
  printWindow.document.close();
}
