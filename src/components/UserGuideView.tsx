import React, { useState, useEffect, useRef, useMemo } from 'react';
import {
  BookOpen,
  Play,
  Pause,
  RotateCcw,
  CheckCircle2,
  Database,
  ShieldCheck,
  Wheat,
  Scale,
  FileBarChart,
  Search,
  ArrowLeft,
  Sparkles,
  RefreshCw,
  Printer,
  Building2,
  Layers,
  Video,
  Image as ImageIcon,
  HelpCircle,
} from 'lucide-react';

import guideBakeriesImg from '../assets/images/guide_bakeries_management_1794698515009.jpg';
import guideDebtsImg from '../assets/images/guide_debts_installments_1794698514622.jpg';
import guideCloudSyncImg from '../assets/images/guide_cloud_sync_1794698515328.jpg';
import guideReportsImg from '../assets/images/guide_reports_analytics_1794698514544.jpg';

export interface UserGuideViewProps {
  onNavigateTab: (tab: 'dashboard' | 'charts' | 'bakeries' | 'debts' | 'reports' | 'user-guide') => void;
  onOpenModal?: (
    modal:
      | 'add-bakery'
      | 'add-debt'
      | 'backup-sync'
      | 'villages-units'
      | 'branches'
      | 'users'
      | 'audit'
  ) => void;
  bakeriesCount: number;
  debtsCount: number;
  villagesCount: number;
}

interface VideoChapter {
  id: string;
  number: string;
  title: string;
  durationSec: number;
  summary: string;
  voiceoverSteps: string[];
  accentColor: string;
  imageSrc: string;
  metricsPreview: Array<{ label: string; value: string }>;
}

interface IllustratedGuideSection {
  id: string;
  category: 'bakeries' | 'debts' | 'sync' | 'reports' | 'admin';
  categoryLabel: string;
  title: string;
  subtitle: string;
  imageSrc: string;
  imageCaption: string;
  steps: Array<{
    stepNumber: string;
    heading: string;
    detail: string;
  }>;
  formulaOrRuleTitle: string;
  formulaOrRuleItems: string[];
  actionLabel: string;
  onTriggerAction: (
    onNavigateTab: UserGuideViewProps['onNavigateTab'],
    onOpenModal?: UserGuideViewProps['onOpenModal']
  ) => void;
}

const VIDEO_CHAPTERS: VideoChapter[] = [
  {
    id: 'ch-bakeries',
    number: '01',
    title: 'تسجيل المخابز والحصص التموينية والحسابات التلقائية',
    durationSec: 18,
    summary:
      'شرح عملي لكيفية إضافة مخبز جديد، ربطه بالوحدة المحلية والقرية، وحساب الحصة التأمينية وعدد الأرغفة ومتوسط نصيب الفرد آلياً.',
    voiceoverSteps: [
      '1. من القائمة الجانبية، اختر «إضافة مخبز جديد» أو انتقل إلى سجل المخابز.',
      '2. أدخل رقم الماكينة واسم صاحب المخبز وحدد القرية والوحدة المحلية التابع لها.',
      '3. بمجرد كتابة المبلغ التأميني وسعر الشيكارة، يحسب النظام الحصة التأمينية تلقائياً = (المبلغ ÷ السعر) ÷ 3.',
      '4. عند إدخال الحصة الفعلية وعدد السكان والمستفيدين (2023 و2024 و2025)، يحسب النظام عدد الأرغفة ومتوسط الفرد وفروق المتوسطات فوراً.',
    ],
    accentColor: '#10b981',
    imageSrc: guideBakeriesImg,
    metricsPreview: [
      { label: 'معادلة الحصة التأمينية', value: '(التأمين ÷ السعر) ÷ 3' },
      { label: 'معادلة الأرغفة اليومية', value: 'الحصة الفعلية × 1250' },
      { label: 'متوسط نصيب الفرد', value: 'الأرغفة ÷ عدد السكان' },
    ],
  },
  {
    id: 'ch-debts',
    number: '02',
    title: 'إدارة المديونيات والمخالفات وتحصيل الأقساط الأسبوعية',
    durationSec: 18,
    summary:
      'طريقة تسجيل المخالفات وفروق الأسعار وشيكارات التصرف، وجدولة وتحصيل الأقساط الأسبوعية مع خصمها الفوري من الرصيد المتبقي.',
    voiceoverSteps: [
      '1. افتح قسم «سجل المديونيات والتحصيل» أو اضغط «إضافة مديونية جديدة» من القائمة الجانبية.',
      '2. اختر المخبز برقم الماكينة أو الاسم ليتم جلب بيانات القرية والوحدة المحلية تلقائياً.',
      '3. سجل أصل المخالفات أو شيكارات التصرف، وسيحسب النظام الإجمالي والمتبقي الصافي آلياً.',
      '4. عند سداد قسط أسبوعي، اضغط «تحصيل قسط» ليتم خصم المبلغ فوراً وتحديث نسبة التحصيل في كافة التقارير.',
    ],
    accentColor: '#f59e0b',
    imageSrc: guideDebtsImg,
    metricsPreview: [
      { label: 'قيمة التصرف التمويني', value: 'الشيكارات × السعر × المضاعف' },
      { label: 'صافي المديونية المتبقية', value: 'إجمالي المستحقات − المسدد' },
      { label: 'تحديث الأقساط', value: 'خصم فوري وتوثيق بالتاريخ' },
    ],
  },
  {
    id: 'ch-sync',
    number: '03',
    title: 'المزامنة الفورية بين الأجهزة والحماية الدائمة للبيانات عند تغيير الخادم',
    durationSec: 20,
    summary:
      'كيف يعمل نظام Supabase Realtime لنقل التعديلات في نفس اللحظة بين جميع الأجهزة، وكيف يحتفظ النظام بالبيانات المسجلة للأبد حتى عند تغيير الخادم.',
    voiceoverSteps: [
      '1. أي عملية إضافة أو تعديل على جهازك تُرسل فوراً عبر قناة Supabase Realtime وخادم المزامنة اللحظية.',
      '2. تظهر التعديلات على جميع الأجهزة الأخرى المفتوح عليها النظام خلال أجزاء من الثانية دون الحاجة لعمل Refresh.',
      '3. يحتفظ النظام بنسخة محمية دائمة (Permanent Safety Vault) لكافة المخابز والمديونيات والفروع.',
      '4. عند تغيير خادم Supabase في أي وقت، يقوم النظام تلقائياً بدمج وترحيل كافة البيانات المسجلة إلى الخادم الجديد دون حذف أي سجل.',
    ],
    accentColor: '#0ea5e9',
    imageSrc: guideCloudSyncImg,
    metricsPreview: [
      { label: 'زمن المزامنة بين الأجهزة', value: 'أقل من 1 ثانية (Realtime)' },
      { label: 'حماية البيانات المسجلة', value: 'منع الحذف النهائي 100%' },
      { label: 'تغيير الخادم (Migration)', value: 'نقل تلقائي للخادم الجديد' },
    ],
  },
  {
    id: 'ch-reports',
    number: '04',
    title: 'مركز التقارير، إجماليات الوحدات المحلية، والطباعة وتصدير Excel',
    durationSec: 16,
    summary:
      'استعراض الجداول التموينية، صف إجمالي الوحدة المحلية المميز باللون الأسود، وصف الإجماليات العام، مع الطباعة الرسمية والتصدير.',
    voiceoverSteps: [
      '1. في جدول المخابز، يتم تجميع كل وحدة محلية بصف «إجمالي الوحدة المحلية» مع ذكر اسم الوحدة المحلية بوضوح.',
      '2. يظهر الصف النهائي «الإجماليات (TOTAL)» كمجموع شامل لصفوف الوحدات المحلية على مستوى القرية بالكامل.',
      '3. الخانات الوصفية من عمود «نوع المخابز» حتى نهاية الصف في صفوف الإجماليات تظهر باللون الأسود الصافي بدون قيم رقمية.',
      '4. يمكنك تصدير أي جدول أو تقرير إلى ملف Excel رسمي أو طباعته مباشرة بضغطة زر واحدة.',
    ],
    accentColor: '#8b5cf6',
    imageSrc: guideReportsImg,
    metricsPreview: [
      { label: 'صف إجمالي الوحدة المحلية', value: 'تجميع تلقائي + اسم الوحدة' },
      { label: 'صف الإجماليات العام', value: 'مجموع الوحدات المحلية' },
      { label: 'التصدير والطباعة', value: 'Excel + PDF + HTML' },
    ],
  },
];

const ILLUSTRATED_SECTIONS: IllustratedGuideSection[] = [
  {
    id: 'sec-bakeries',
    category: 'bakeries',
    categoryLabel: 'إدارة المخابز والحصص',
    title: 'دليل تسجيل المخابز والحسابات التموينية التلقائية',
    subtitle:
      'إدارة شاملة لبيانات المخابز البلدية والسياحية، حصص الدقيق التأمينية والفعلية، وبيانات السكان والمستفيدين لأعوام 2023 و2024 و2025.',
    imageSrc: guideBakeriesImg,
    imageCaption: 'شاشة سجل المخابز والحصص التموينية مع الحساب الآلي للحصة التأمينية والأرغفة ومتوسط الفرد',
    steps: [
      {
        stepNumber: '1',
        heading: 'فتح نافذة إضافة أو تعديل مخبز',
        detail:
          'اضغط على «إضافة مخبز جديد» من القائمة الجانبية اليمنى أو من أعلى جدول المخابز، أو اضغط على أيقونة التعديل بجوار أي مخبز مسجل.',
      },
      {
        stepNumber: '2',
        heading: 'تحديد الموقع الإداري (القرية والوحدة المحلية)',
        detail:
          'اختر القرية والوحدة المحلية من القوائم المعتمدة. يقوم النظام بتجميع المخابز تلقائياً تحت كل وحدة محلية وعرض صف «إجمالي الوحدة المحلية» متبوعاً باسمها.',
      },
      {
        stepNumber: '3',
        heading: 'إدخال التأمين والحصة الفعلية وعدد المستفيدين',
        detail:
          'أدخل المبلغ التأميني وسعر الشيكارة والحصة الفعلية وعدد السكان والمستفيدين، وسيقوم النظام بحساب كافة المتوسطات والفروق آلياً وبدقة.',
      },
      {
        stepNumber: '4',
        heading: 'صفوف الإجماليات المعتمدة باللون الأسود',
        detail:
          'يظهر صف إجمالي الوحدة المحلية وصف الإجماليات الكلي (TOTAL) مع تلوين الأعمدة من «نوع المخابز» حتى نهاية الصف باللون الأسود الكامل دون إظهار قيم بها حسب التعليمات الرسمية.',
      },
    ],
    formulaOrRuleTitle: 'المعادلات الحسابية التلقائية في سجل المخابز',
    formulaOrRuleItems: [
      'الحصة التأمينية = (المبلغ التأميني ÷ سعر الشيكارة) ÷ 3',
      'عدد الأرغفة اليومية = الحصة الفعلية × 1250 رغيف',
      'متوسط نصيب الفرد بالقرية = عدد الأرغفة ÷ عدد سكان القرية',
      'متوسط نصيب الفرد (2023 / 2024 / 2025) = عدد الأرغفة ÷ عدد المستفيدين للسنة',
      'فرق المتوسط = متوسط 2024 − متوسط 2023',
    ],
    actionLabel: 'انتقل إلى سجل المخابز الآن',
    onTriggerAction: (onNavigateTab) => onNavigateTab('bakeries'),
  },
  {
    id: 'sec-debts',
    category: 'debts',
    categoryLabel: 'المديونيات والأقساط',
    title: 'دليل إدارة المديونيات والمخالفات وتحصيل الأقساط الأسبوعية',
    subtitle:
      'متابعة دقيقة لأصل المخالفات، المبالغ المضافة، شيكارات التصرف، والأقساط الأسبوعية المحصلة مع إشعارات المديونيات المرتفعة.',
    imageSrc: guideDebtsImg,
    imageCaption: 'شاشة متابعة المديونيات وجدولة الأقساط الأسبوعية وحساب المتبقي الصافي تلقائياً',
    steps: [
      {
        stepNumber: '1',
        heading: 'تسجيل مديونية أو مخالفة جديدة على مخبز',
        detail:
          'من القائمة الجانبية، اختر «إضافة مديونية جديدة» وحدد المخبز ليتم ربط المديونية برقم الماكينة والوحدة المحلية تلقائياً.',
      },
      {
        stepNumber: '2',
        heading: 'حساب قيمة شيكارات التصرف والمخالفات السابقة',
        detail:
          'أدخل عدد شيكارات التصرف وسعر الشيكارة ومضاعف الغرامة، ليحسب النظام قيمة التصرف ويضيفها إلى إجمالي المستحقات.',
      },
      {
        stepNumber: '3',
        heading: 'تحصيل الأقساط الأسبوعية وتحديث الرصيد فوراً',
        detail:
          'اضغط على زر «تحصيل قسط» أمام المخبز لتسجيل المبلغ المدفوع وطريقة السداد، ليتم خصمه فوراً من صافي المديونية المتبقية على كافة الأجهزة.',
      },
      {
        stepNumber: '4',
        heading: 'تنبيهات المديونيات المرتفعة اللحظية',
        detail:
          'يرسل النظام إشعاراً فورياً في جرس التنبيهات العلوي عند تجاوز مديونية أي مخبز الحد التحذيري المعتمد.',
      },
    ],
    formulaOrRuleTitle: 'قواعد حساب المديونيات والأقساط',
    formulaOrRuleItems: [
      'إجمالي المخالفات = أصل المخالفة الحالية + المخالفات السابقة',
      'المتبقي من المخالفات = إجمالي المخالفات − المسدد من المخالفات',
      'قيمة التصرف = عدد شيكارات التصرف × سعر الشيكارة × المضاعف',
      'صافي المديونية المتبقية = متبقي المخالفات + متبقي المضاف + متبقي التصرف',
    ],
    actionLabel: 'انتقل إلى سجل المديونيات الآن',
    onTriggerAction: (onNavigateTab) => onNavigateTab('debts'),
  },
  {
    id: 'sec-sync',
    category: 'sync',
    categoryLabel: 'المزامنة وحماية البيانات',
    title: 'دليل المزامنة اللحظية بين الأجهزة والحفاظ الدائم على البيانات المسجلة',
    subtitle:
      'ربط مباشر مع قاعدة بيانات Supabase وقناة البث اللحظي WebSocket مع خزنة الأمان الدائمة التي تمنع حذف أي بيانات وتنقلها تلقائياً لأي خادم جديد.',
    imageSrc: guideCloudSyncImg,
    imageCaption: 'منظومة المزامنة الفورية عبر Supabase Realtime والاحتفاظ الدائم بالبيانات عند تغيير الخادم',
    steps: [
      {
        stepNumber: '1',
        heading: 'مزامنة تلقائية فورية بين جميع الأجهزة في نفس اللحظة',
        detail:
          'بمجرد تسجيل أو تعديل أي مخبز أو مديونية أو قرية على جهازك، يتم بث التحديث فوراً عبر Supabase Realtime وWebSocket ليظهر على جميع الأجهزة الأخرى تلقائياً بدون تحديث الصفحة.',
      },
      {
        stepNumber: '2',
        heading: 'الاحتفاظ الدائم بالبيانات وعدم حذفها تحت أي ظرف',
        detail:
          'تُحفظ كافة السجلات في قاعدة بيانات Supabase وفي خزنة الأمان الدائمة (Permanent Safety Vault)، ويمنع النظام المسح الشامل للبيانات المسجلة مهما حدث.',
      },
      {
        stepNumber: '3',
        heading: 'الترحيل التلقائي للبيانات عند تغيير الخادم (Server Migration)',
        detail:
          'إذا قمت بتغيير رابط أو مفاتيح خادم Supabase من نافذة «إعدادات المزامنة والنسخ الاحتياطي»، يقوم النظام بدمج البيانات المسجلة وترحيلها تلقائياً إلى الخادم الجديد دون فقدان أي سجل.',
      },
      {
        stepNumber: '4',
        heading: 'العمل أثناء انقطاع الإنترنت (Offline Queue)',
        detail:
          'في حال انقطاع الإنترنت مؤقتاً، يحتفظ النظام بالتعديلات في قائمة انتظار آمنة ويعيد إرسالها ومزامنتها تلقائياً فور عودة الاتصال.',
      },
    ],
    formulaOrRuleTitle: 'ضمانات حماية البيانات والمزامنة اللحظية',
    formulaOrRuleItems: [
      'بث فوري مزدوج: Supabase Realtime + خادم المزامنة اللحظية (/api/supabase/live-db)',
      'فحص مراجعات تلقائي كل 2.5 ثانية لضمان وصول التحديثات حتى عبر الشبكات المقيدة',
      'حماية صارمة ضد الحذف: الاحتفاظ الدائم ببيانات المخابز والمديونيات والفروع',
      'ترحيل ذكي غير إتلافي (Non-Destructive Migration) عند الانتقال إلى أي خادم جديد',
    ],
    actionLabel: 'فتح إعدادات المزامنة وخادم Supabase',
    onTriggerAction: (_onNavigateTab, onOpenModal) => {
      if (onOpenModal) onOpenModal('backup-sync');
    },
  },
  {
    id: 'sec-reports',
    category: 'reports',
    categoryLabel: 'التقارير والطباعة',
    title: 'دليل مركز التقارير والرسوم البيانية والطباعة الرسمية وتصدير Excel',
    subtitle:
      'إصدار كشوف حصر المخابز، تقارير المديونيات، مقارنات الأعوام 2023 و2024 و2025، والرسوم البيانية التفاعلية.',
    imageSrc: guideReportsImg,
    imageCaption: 'لوحة المؤشرات والرسوم البيانية ومركز التقارير الرسمية القابلة للطباعة والتصدير',
    steps: [
      {
        stepNumber: '1',
        heading: 'استعراض لوحة التحكم والرسوم البيانية',
        detail:
          'اضغط على «لوحة التحكم» أو «الرسوم البيانية» من القائمة الجانبية لمشاهدة توزيع المخابز والحصص ونسب التحصيل حسب كل وحدة محلية.',
      },
      {
        stepNumber: '2',
        heading: 'تخصيص وفلترة التقارير في مركز التقارير',
        detail:
          'انتقل إلى «مركز التقارير» لاختيار نوع التقرير (مخابز، مديونيات، وحدات محلية، مقارنات مستفيدين) وتحديد القرية أو حالة النشاط.',
      },
      {
        stepNumber: '3',
        heading: 'تصدير الكشوف إلى Excel والطباعة الورقية المعتمدة',
        detail:
          'استخدم أزرار «تصدير Excel» أو «طباعة التقرير» للحصول على كشوف رسمية منسقة بترويسة مديرية التموين والتجارة الداخلية جاهزة للاعتماد.',
      },
      {
        stepNumber: '4',
        heading: 'إدارة الفروع والوحدات المحلية والصلاحيات',
        detail:
          'من القائمة الجانبية، يمكنك إدارة القرى والوحدات المحلية، التبديل بين الفروع التموينية، ومراجعة سجل المراقبة (Audit Log) لكافة العمليات.',
      },
    ],
    formulaOrRuleTitle: 'مميزات التقارير والكشوف الرسمية',
    formulaOrRuleItems: [
      'إظهار صف إجمالي الوحدة المحلية مع اسم الوحدة المحلية وتلوين الخانات الوصفية بالأسود',
      'إظهار صف الإجماليات الكلي (TOTAL) كمجموع شامل لكافة الوحدات المحلية بالقرية',
      'تصدير مباشر بصيغ Excel (.xlsx) وملف منظومة مستقل (HTML) ونسخ احتياطية JSON',
      'ترويسة رسمية قابلة للتخصيص باسم المديرية والإدارة التموينية',
    ],
    actionLabel: 'انتقل إلى مركز التقارير الآن',
    onTriggerAction: (onNavigateTab) => onNavigateTab('reports'),
  },
];

export const UserGuideView: React.FC<UserGuideViewProps> = ({
  onNavigateTab,
  onOpenModal,
  bakeriesCount,
  debtsCount,
  villagesCount,
}) => {
  const [selectedChapterIdx, setSelectedChapterIdx] = useState<number>(0);
  const [isPlaying, setIsPlaying] = useState<boolean>(true);
  const [elapsedSec, setElapsedSec] = useState<number>(0);
  const [playbackSpeed, setPlaybackSpeed] = useState<number>(1);
  const [activeCategory, setActiveCategory] = useState<
    'all' | 'bakeries' | 'debts' | 'sync' | 'reports'
  >('all');
  const [searchQuery, setSearchQuery] = useState<string>('');

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const loadedImagesRef = useRef<Record<string, HTMLImageElement>>({});

  const currentChapter = VIDEO_CHAPTERS[selectedChapterIdx] || VIDEO_CHAPTERS[0];

  // Preload chapter images for smooth 60fps HTML5 canvas video rendering
  useEffect(() => {
    VIDEO_CHAPTERS.forEach((ch) => {
      if (!loadedImagesRef.current[ch.id]) {
        const img = new Image();
        img.src = ch.imageSrc;
        img.onload = () => {
          loadedImagesRef.current[ch.id] = img;
        };
      }
    });
  }, []);

  // Advance video playback timer
  useEffect(() => {
    if (!isPlaying) return;
    const intervalMs = 100;
    const timer = setInterval(() => {
      setElapsedSec((prev) => {
        const next = prev + (intervalMs / 1000) * playbackSpeed;
        if (next >= currentChapter.durationSec) {
          // Automatically advance to next chapter
          setSelectedChapterIdx((idx) => (idx + 1) % VIDEO_CHAPTERS.length);
          return 0;
        }
        return next;
      });
    }, intervalMs);
    return () => clearInterval(timer);
  }, [isPlaying, playbackSpeed, currentChapter.durationSec]);

  // Render animated tutorial video frames onto the HTML5 Canvas
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const width = canvas.width;
    const height = canvas.height;
    const progress = Math.min(1, Math.max(0, elapsedSec / currentChapter.durationSec));
    const stepIndex = Math.min(
      currentChapter.voiceoverSteps.length - 1,
      Math.floor(progress * currentChapter.voiceoverSteps.length)
    );
    const activeVoiceover = currentChapter.voiceoverSteps[stepIndex] || '';

    // 1. Deep navy slate background
    const grad = ctx.createLinearGradient(0, 0, width, height);
    grad.addColorStop(0, '#090d16');
    grad.addColorStop(1, '#111827');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, width, height);

    // 2. Draw illustrated feature visual on the right half (RTL layout) with subtle Ken Burns motion
    const img = loadedImagesRef.current[currentChapter.id];
    const imgBoxX = 36;
    const imgBoxY = 74;
    const imgBoxW = 540;
    const imgBoxH = 325;

    ctx.save();
    ctx.beginPath();
    ctx.roundRect(imgBoxX, imgBoxY, imgBoxW, imgBoxH, 12);
    ctx.clip();

    if (img && img.complete && img.naturalWidth > 0) {
      const zoom = 1 + progress * 0.06;
      const drawW = imgBoxW * zoom;
      const drawH = imgBoxH * zoom;
      const offsetX = imgBoxX - (drawW - imgBoxW) / 2;
      const offsetY = imgBoxY - (drawH - imgBoxH) / 2;
      ctx.drawImage(img, offsetX, offsetY, drawW, drawH);
    } else {
      ctx.fillStyle = '#1e293b';
      ctx.fillRect(imgBoxX, imgBoxY, imgBoxW, imgBoxH);
    }

    // Subtle dark gradient overlay at bottom of image
    const imgOverlay = ctx.createLinearGradient(0, imgBoxY + imgBoxH - 90, 0, imgBoxY + imgBoxH);
    imgOverlay.addColorStop(0, 'rgba(9, 13, 22, 0)');
    imgOverlay.addColorStop(1, 'rgba(9, 13, 22, 0.88)');
    ctx.fillStyle = imgOverlay;
    ctx.fillRect(imgBoxX, imgBoxY + imgBoxH - 90, imgBoxW, 90);
    ctx.restore();

    // Border around image frame
    ctx.strokeStyle = currentChapter.accentColor;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.roundRect(imgBoxX, imgBoxY, imgBoxW, imgBoxH, 12);
    ctx.stroke();

    // Animated spotlight pulse on image showing active step
    const pulseX = imgBoxX + 90 + ((stepIndex * 135) % (imgBoxW - 180));
    const pulseY = imgBoxY + 95 + ((stepIndex * 65) % (imgBoxH - 160));
    const pulseRadius = 18 + Math.sin(elapsedSec * 5) * 5;
    ctx.save();
    ctx.strokeStyle = currentChapter.accentColor;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(pulseX, pulseY, pulseRadius, 0, Math.PI * 2);
    ctx.stroke();
    ctx.fillStyle = currentChapter.accentColor;
    ctx.beginPath();
    ctx.arc(pulseX, pulseY, 6, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    // 3. Top Header Bar inside Video Frame
    ctx.fillStyle = 'rgba(30, 41, 59, 0.85)';
    ctx.fillRect(0, 0, width, 54);
    ctx.fillStyle = currentChapter.accentColor;
    ctx.fillRect(0, 52, width, 2);

    ctx.direction = 'rtl';
    ctx.textAlign = 'right';
    ctx.fillStyle = '#f8fafc';
    ctx.font = 'bold 18px Cairo, sans-serif';
    ctx.fillText(
      `الفصل ${currentChapter.number}: ${currentChapter.title}`,
      width - 24,
      34
    );

    ctx.textAlign = 'left';
    ctx.fillStyle = '#94a3b8';
    ctx.font = 'bold 13px Cairo, sans-serif';
    ctx.fillText(
      `شرح تفاعلي مصور بالفيديو • خطوة ${stepIndex + 1} من ${currentChapter.voiceoverSteps.length}`,
      24,
      33
    );

    // 4. Right column (in canvas coordinates: x from 600 to width - 24) showing live steps & formulas
    const rightColX = width - 24;
    const rightColW = width - 620;

    ctx.direction = 'rtl';
    ctx.textAlign = 'right';

    currentChapter.voiceoverSteps.forEach((stepText, idx) => {
      const boxY = 74 + idx * 70;
      const isCurrent = idx === stepIndex;
      const isDone = idx < stepIndex;

      ctx.save();
      ctx.fillStyle = isCurrent
        ? 'rgba(16, 185, 129, 0.16)'
        : isDone
        ? 'rgba(30, 41, 59, 0.75)'
        : 'rgba(15, 23, 42, 0.65)';
      ctx.strokeStyle = isCurrent
        ? currentChapter.accentColor
        : isDone
        ? 'rgba(148, 163, 184, 0.35)'
        : 'rgba(51, 65, 85, 0.5)';
      ctx.lineWidth = isCurrent ? 2 : 1;
      ctx.beginPath();
      ctx.roundRect(width - rightColW - 24, boxY, rightColW, 60, 10);
      ctx.fill();
      ctx.stroke();

      ctx.fillStyle = isCurrent ? '#ffffff' : isDone ? '#cbd5e1' : '#94a3b8';
      ctx.font = isCurrent ? 'bold 13.5px Cairo, sans-serif' : '13px Cairo, sans-serif';

      // Wrap step text into 2 lines max
      const words = stepText.split(' ');
      let line1 = '';
      let line2 = '';
      for (const w of words) {
        if ((line1 + ' ' + w).length <= 58) {
          line1 = (line1 + ' ' + w).trim();
        } else {
          line2 = (line2 + ' ' + w).trim();
        }
      }
      ctx.fillText(line1, rightColX - 14, boxY + 26);
      if (line2) {
        ctx.fillText(line2, rightColX - 14, boxY + 46);
      }
      ctx.restore();
    });

    // 5. Bottom Subtitle / Voiceover Bar
    ctx.save();
    ctx.fillStyle = 'rgba(15, 23, 42, 0.95)';
    ctx.strokeStyle = 'rgba(148, 163, 184, 0.25)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.roundRect(24, height - 78, width - 48, 56, 10);
    ctx.fill();
    ctx.stroke();

    ctx.direction = 'rtl';
    ctx.textAlign = 'right';
    ctx.fillStyle = currentChapter.accentColor;
    ctx.font = 'bold 13px Cairo, sans-serif';
    ctx.fillText('الشرح الصوتي النصي المباشر:', width - 42, height - 54);

    ctx.fillStyle = '#f8fafc';
    ctx.font = 'bold 14.5px Cairo, sans-serif';
    ctx.fillText(activeVoiceover, width - 42, height - 32);
    ctx.restore();

    // 6. Bottom Progress Bar
    ctx.fillStyle = '#1e293b';
    ctx.fillRect(0, height - 6, width, 6);
    ctx.fillStyle = currentChapter.accentColor;
    ctx.fillRect(0, height - 6, width * progress, 6);
  }, [elapsedSec, currentChapter]);

  const filteredSections = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return ILLUSTRATED_SECTIONS.filter((sec) => {
      if (activeCategory !== 'all' && sec.category !== activeCategory) return false;
      if (!q) return true;
      const haystack = [
        sec.title,
        sec.subtitle,
        sec.categoryLabel,
        ...sec.steps.map((s) => `${s.heading} ${s.detail}`),
        ...sec.formulaOrRuleItems,
      ]
        .join(' ')
        .toLowerCase();
      return haystack.includes(q);
    });
  }, [activeCategory, searchQuery]);

  const handleSelectChapter = (idx: number) => {
    setSelectedChapterIdx(idx);
    setElapsedSec(0);
    setIsPlaying(true);
  };

  return (
    <div className="space-y-6 pb-12" dir="rtl">
      {/* Top Banner & Quick Overview */}
      <div className="bg-slate-900 text-white rounded-xl border border-slate-800 p-6 shadow-sm">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-6">
          <div className="space-y-2 max-w-3xl">
            <div className="inline-flex items-center gap-2 text-emerald-400 text-xs font-bold tracking-wide">
              <BookOpen className="w-4 h-4" />
              <span>الدليل الإرشادي الشامل — تعليمات مصورة وشرح بالفيديو خطوة بخطوة</span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-black text-white leading-tight">
              دليل المستخدم المصور والفيديو لمنظومة إدارة المخابز والمديونيات
            </h1>
            <p className="text-slate-300 text-sm leading-relaxed">
              يوضح هذا الدليل بالصور التوضيحية والفيديو التفاعلي كيفية استخدام كافة مميزات المنظومة:
              تسجيل المخابز والحصص التموينية، إدارة المديونيات والأقساط الأسبوعية، المزامنة الفورية
              بين جميع الأجهزة عبر <span className="text-emerald-300 font-bold">Supabase Realtime</span>،
              والحماية الدائمة للبيانات المسجلة حتى عند تغيير الخادم.
            </p>
          </div>

          {/* Live System Counter Summary */}
          <div className="grid grid-cols-3 gap-3 shrink-0">
            <div className="bg-slate-800/90 border border-slate-700 rounded-lg px-4 py-3 text-center">
              <div className="text-xs text-slate-400 font-bold">المخابز المسجلة</div>
              <div className="text-xl font-black text-emerald-400 tabular-nums mt-0.5">
                {bakeriesCount}
              </div>
              <div className="text-[11px] text-slate-400">محفوظة دائماً</div>
            </div>
            <div className="bg-slate-800/90 border border-slate-700 rounded-lg px-4 py-3 text-center">
              <div className="text-xs text-slate-400 font-bold">سجلات المديونيات</div>
              <div className="text-xl font-black text-amber-400 tabular-nums mt-0.5">
                {debtsCount}
              </div>
              <div className="text-[11px] text-slate-400">مزامنة لحظية</div>
            </div>
            <div className="bg-slate-800/90 border border-slate-700 rounded-lg px-4 py-3 text-center">
              <div className="text-xs text-slate-400 font-bold">القرى والوحدات</div>
              <div className="text-xl font-black text-sky-400 tabular-nums mt-0.5">
                {villagesCount}
              </div>
              <div className="text-[11px] text-slate-400">مرتبطة سحابياً</div>
            </div>
          </div>
        </div>
      </div>

      {/* Section 1: Interactive Video Tutorial Player */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="border-b border-slate-200 bg-slate-50 px-6 py-4 flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-emerald-600 text-white flex items-center justify-center shadow-sm">
              <Video className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg font-black text-slate-900">
                الفيديو التفاعلي المصور لشرح المنظومة (4 فصول تدريبية)
              </h2>
              <p className="text-xs text-slate-600 font-medium">
                اختر الفصل التدريبي لمشاهدة خطوات العمل الفعلية والمعادلات الحسابية والمزامنة اللحظية بين الأجهزة
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setIsPlaying((p) => !p)}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg font-bold text-xs bg-emerald-600 hover:bg-emerald-700 text-white transition shadow-sm cursor-pointer"
            >
              {isPlaying ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
              <span>{isPlaying ? 'إيقاف مؤقت' : 'تشغيل فيديو الشرح'}</span>
            </button>
            <button
              type="button"
              onClick={() => {
                setElapsedSec(0);
                setIsPlaying(true);
              }}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg font-bold text-xs bg-slate-200 hover:bg-slate-300 text-slate-800 transition cursor-pointer"
              title="إعادة تشغيل الفصل الحالي"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>إعادة</span>
            </button>
            <button
              type="button"
              onClick={() => setPlaybackSpeed((s) => (s === 1 ? 1.5 : 1))}
              className="px-3 py-2 rounded-lg font-bold text-xs bg-slate-900 text-white hover:bg-slate-800 transition tabular-nums cursor-pointer"
            >
              السرعة: {playbackSpeed}x
            </button>
          </div>
        </div>

        <div className="p-6 grid grid-cols-1 xl:grid-cols-12 gap-6 items-start">
          {/* Video Canvas Player (8 cols on XL) */}
          <div className="xl:col-span-8 space-y-4">
            <div className="relative rounded-xl overflow-hidden border border-slate-800 bg-slate-950 shadow-md">
              <canvas
                ref={canvasRef}
                width={1120}
                height={500}
                onClick={() => setIsPlaying((p) => !p)}
                className="w-full h-auto block cursor-pointer"
              />
            </div>

            {/* Scrubber & Metrics Bar */}
            <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 space-y-3">
              <div className="flex items-center justify-between text-xs font-bold text-slate-700">
                <span>
                  الفصل الحالي: {currentChapter.number} — {currentChapter.title}
                </span>
                <span className="tabular-nums text-slate-500">
                  {Math.floor(elapsedSec)} ثانية / {currentChapter.durationSec} ثانية
                </span>
              </div>

              <input
                type="range"
                min={0}
                max={currentChapter.durationSec}
                step={0.2}
                value={elapsedSec}
                onChange={(e) => setElapsedSec(Number(e.target.value))}
                className="w-full accent-emerald-600 cursor-pointer"
              />

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-1">
                {currentChapter.metricsPreview.map((m, i) => (
                  <div
                    key={i}
                    className="bg-white border border-slate-200 rounded-lg px-3 py-2 flex items-center justify-between"
                  >
                    <span className="text-xs font-bold text-slate-500">{m.label}:</span>
                    <span className="text-xs font-black text-slate-900">{m.value}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Chapters Playlist (4 cols on XL) */}
          <div className="xl:col-span-4 space-y-3">
            <div className="text-sm font-black text-slate-900 flex items-center justify-between">
              <span>فصول الفيديو التعليمي (اضغط للتشغيل)</span>
              <span className="text-xs font-bold text-emerald-700">4 فصول كاملة</span>
            </div>

            <div className="space-y-2.5">
              {VIDEO_CHAPTERS.map((ch, idx) => {
                const isSelected = idx === selectedChapterIdx;
                return (
                  <button
                    key={ch.id}
                    type="button"
                    onClick={() => handleSelectChapter(idx)}
                    className={`w-full text-right p-3.5 rounded-xl border transition flex items-start gap-3 cursor-pointer ${
                      isSelected
                        ? 'bg-slate-900 text-white border-slate-900 shadow-sm'
                        : 'bg-white hover:bg-slate-50 text-slate-800 border-slate-200'
                    }`}
                  >
                    <div
                      className={`w-8 h-8 rounded-lg flex items-center justify-center font-black text-xs shrink-0 mt-0.5 tabular-nums ${
                        isSelected
                          ? 'bg-emerald-500 text-slate-950'
                          : 'bg-slate-100 text-slate-700'
                      }`}
                    >
                      {ch.number}
                    </div>
                    <div className="flex-1 min-w-0 space-y-1">
                      <div className="font-black text-sm leading-snug">{ch.title}</div>
                      <p
                        className={`text-xs leading-relaxed line-clamp-2 ${
                          isSelected ? 'text-slate-300' : 'text-slate-500'
                        }`}
                      >
                        {ch.summary}
                      </p>
                      <div
                        className={`text-[11px] font-bold flex items-center gap-2 pt-0.5 ${
                          isSelected ? 'text-emerald-400' : 'text-slate-400'
                        }`}
                      >
                        <Play className="w-3 h-3" />
                        <span>المدة: {ch.durationSec} ثانية • 4 خطوات عملية</span>
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      {/* Guarantee Banner for Cross-Device Sync & Permanent Data Retention */}
      <div className="bg-emerald-950 text-white rounded-xl border border-emerald-800 p-5 shadow-sm">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-start gap-3.5">
            <div className="w-11 h-11 rounded-xl bg-emerald-500/20 border border-emerald-400/30 flex items-center justify-center shrink-0 text-emerald-300">
              <ShieldCheck className="w-6 h-6" />
            </div>
            <div className="space-y-1">
              <h3 className="text-base font-black text-white">
                ضمان المزامنة اللحظية بين جميع الأجهزة والاحتفاظ الدائم بالبيانات المسجلة
              </h3>
              <p className="text-xs text-emerald-100 leading-relaxed max-w-4xl">
                تم تزويد المنظومة بنظام مزامنة فوري مزدوج (Supabase Realtime + WebSocket + فحص التحديثات كل 2.5 ثانية)
                بحيث تظهر أي بيانات تسجلها على جهازك في نفس اللحظة على كافة الأجهزة الأخرى دون تحديث الصفحة. كما تم
                تفعيل <span className="font-black text-amber-300">خزنة الأمان الدائمة (Permanent Safety Vault)</span> التي
                تمنع حذف البيانات المسجلة نهائياً وتنقلها تلقائياً إلى أي خادم جديد عند تغيير الإعدادات.
              </p>
            </div>
          </div>
          {onOpenModal && (
            <button
              type="button"
              onClick={() => onOpenModal('backup-sync')}
              className="shrink-0 inline-flex items-center gap-2 px-4 py-2.5 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-black text-xs transition cursor-pointer"
            >
              <RefreshCw className="w-4 h-4" />
              <span>إعدادات خادم Supabase والمزامنة</span>
            </button>
          )}
        </div>
      </div>

      {/* Section 2: Search & Filter Bar for Illustrated Guides */}
      <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm flex flex-col md:flex-row items-stretch md:items-center justify-between gap-4">
        <div className="flex flex-wrap items-center gap-2">
          {[
            { id: 'all', label: 'جميع الأقسام المصورة', icon: Layers },
            { id: 'bakeries', label: 'إدارة المخابز والحصص', icon: Wheat },
            { id: 'debts', label: 'المديونيات والأقساط', icon: Scale },
            { id: 'sync', label: 'المزامنة وحماية البيانات', icon: Database },
            { id: 'reports', label: 'التقارير والطباعة', icon: FileBarChart },
          ].map((tab) => {
            const Icon = tab.icon;
            const active = activeCategory === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveCategory(tab.id as any)}
                className={`inline-flex items-center gap-2 px-3.5 py-2 rounded-lg text-xs font-bold transition cursor-pointer ${
                  active
                    ? 'bg-slate-900 text-white shadow-sm'
                    : 'bg-slate-100 hover:bg-slate-200 text-slate-700'
                }`}
              >
                <Icon className="w-3.5 h-3.5" />
                <span>{tab.label}</span>
              </button>
            );
          })}
        </div>

        <div className="relative min-w-[260px]">
          <Search className="w-4 h-4 text-slate-400 absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="ابحث في التعليمات المصورة أو المعادلات..."
            className="w-full pr-9 pl-3 py-2 text-xs font-bold bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:border-slate-900"
          />
        </div>
      </div>

      {/* Section 3: Detailed Illustrated Step-by-Step Guide Cards */}
      <div className="space-y-6">
        {filteredSections.map((section) => (
          <div
            key={section.id}
            className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden"
          >
            {/* Card Header */}
            <div className="border-b border-slate-200 bg-slate-50/80 px-6 py-4 flex flex-wrap items-center justify-between gap-4">
              <div className="space-y-1">
                <div className="inline-flex items-center gap-2 text-xs font-bold text-emerald-700">
                  <ImageIcon className="w-3.5 h-3.5" />
                  <span>{section.categoryLabel}</span>
                </div>
                <h3 className="text-lg font-black text-slate-900">{section.title}</h3>
                <p className="text-xs text-slate-600 font-medium">{section.subtitle}</p>
              </div>

              <button
                type="button"
                onClick={() => section.onTriggerAction(onNavigateTab, onOpenModal)}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs transition cursor-pointer"
              >
                <span>{section.actionLabel}</span>
                <ArrowLeft className="w-3.5 h-3.5" />
              </button>
            </div>

            {/* Card Body: Illustrated Visual + Step-by-Step Instructions */}
            <div className="p-6 grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
              {/* Illustrated Diagram (5 cols) */}
              <div className="lg:col-span-5 space-y-3">
                <div className="rounded-xl overflow-hidden border border-slate-200 bg-slate-950 shadow-sm">
                  <img
                    src={section.imageSrc}
                    alt={section.title}
                    className="w-full h-64 object-cover block"
                  />
                  <div className="bg-slate-900 text-slate-200 px-4 py-2.5 text-xs font-bold border-t border-slate-800">
                    {section.imageCaption}
                  </div>
                </div>

                {/* Formula / Rule Reference Box */}
                <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 space-y-2.5">
                  <div className="flex items-center gap-2 text-xs font-black text-slate-900">
                    <Sparkles className="w-4 h-4 text-amber-600" />
                    <span>{section.formulaOrRuleTitle}</span>
                  </div>
                  <ul className="space-y-1.5">
                    {section.formulaOrRuleItems.map((item, idx) => (
                      <li
                        key={idx}
                        className="text-xs font-bold text-slate-700 flex items-start gap-2"
                      >
                        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0 mt-0.5" />
                        <span>{item}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>

              {/* Numbered Step-by-Step Instructions (7 cols) */}
              <div className="lg:col-span-7 space-y-3">
                <div className="text-xs font-black text-slate-500 uppercase tracking-wider">
                  خطوات الاستخدام التفصيلية ({section.steps.length} خطوات):
                </div>

                <div className="grid grid-cols-1 gap-3">
                  {section.steps.map((st) => (
                    <div
                      key={st.stepNumber}
                      className="border border-slate-200 rounded-xl p-4 bg-white hover:bg-slate-50/60 transition flex items-start gap-3.5"
                    >
                      <div className="w-8 h-8 rounded-lg bg-slate-900 text-white font-black text-xs flex items-center justify-center shrink-0 tabular-nums mt-0.5">
                        {st.stepNumber}
                      </div>
                      <div className="space-y-1">
                        <h4 className="text-sm font-black text-slate-900">{st.heading}</h4>
                        <p className="text-xs text-slate-600 leading-relaxed font-medium">
                          {st.detail}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Section 4: Quick Shortcuts Grid to All System Tools */}
      <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm space-y-4">
        <div className="flex items-center gap-2">
          <HelpCircle className="w-5 h-5 text-slate-800" />
          <h3 className="text-base font-black text-slate-900">
            اختصارات الوصول السريع لكافة نوافذ وأقسام المنظومة
          </h3>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          <button
            type="button"
            onClick={() => onNavigateTab('bakeries')}
            className="p-4 rounded-xl border border-slate-200 hover:border-slate-900 text-right transition flex items-center justify-between group cursor-pointer"
          >
            <div>
              <div className="text-xs font-black text-slate-900">سجل المخابز والحصص</div>
              <div className="text-[11px] text-slate-500 mt-0.5">
                إدارة المخابز وإجماليات الوحدات المحلية
              </div>
            </div>
            <Wheat className="w-5 h-5 text-emerald-600 group-hover:scale-110 transition" />
          </button>

          <button
            type="button"
            onClick={() => onNavigateTab('debts')}
            className="p-4 rounded-xl border border-slate-200 hover:border-slate-900 text-right transition flex items-center justify-between group cursor-pointer"
          >
            <div>
              <div className="text-xs font-black text-slate-900">سجل المديونيات والأقساط</div>
              <div className="text-[11px] text-slate-500 mt-0.5">
                تسجيل المخالفات وتحصيل الأقساط الأسبوعية
              </div>
            </div>
            <Scale className="w-5 h-5 text-amber-600 group-hover:scale-110 transition" />
          </button>

          <button
            type="button"
            onClick={() => onNavigateTab('reports')}
            className="p-4 rounded-xl border border-slate-200 hover:border-slate-900 text-right transition flex items-center justify-between group cursor-pointer"
          >
            <div>
              <div className="text-xs font-black text-slate-900">مركز التقارير والطباعة</div>
              <div className="text-[11px] text-slate-500 mt-0.5">
                تقارير رسمية وتصدير Excel مباشر
              </div>
            </div>
            <Printer className="w-5 h-5 text-purple-600 group-hover:scale-110 transition" />
          </button>

          <button
            type="button"
            onClick={() => {
              if (onOpenModal) onOpenModal('villages-units');
            }}
            className="p-4 rounded-xl border border-slate-200 hover:border-slate-900 text-right transition flex items-center justify-between group cursor-pointer"
          >
            <div>
              <div className="text-xs font-black text-slate-900">القرى والوحدات المحلية</div>
              <div className="text-[11px] text-slate-500 mt-0.5">
                إضافة وتعديل القرى والوحدات المحلية
              </div>
            </div>
            <Building2 className="w-5 h-5 text-sky-600 group-hover:scale-110 transition" />
          </button>
        </div>
      </div>
    </div>
  );
};
