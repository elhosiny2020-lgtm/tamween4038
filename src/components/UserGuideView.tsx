import React, { useState, useEffect, useRef, useMemo } from 'react';
import {
  BookOpen,
  Play,
  Pause,
  RotateCcw,
  CheckCircle2,
  ShieldCheck,
  Search,
  Printer,
  FileDown,
  HardDrive,
  FolderOpen,
  FlaskConical,
  Calculator,
  LayoutGrid,
  MousePointerClick,
  Video,
  AlertTriangle,
  Loader2,
  ChevronDown,
  ChevronUp,
  ArrowLeft,
  RefreshCw,
} from 'lucide-react';
import { MINISTRY_LOGO_URL } from '../services/modulesStorage';
import { ErrorBoundary } from './ErrorBoundary';
import { Button } from './common/Button';
import {
  LOCAL_PARTITION_OPTIONS,
  MANUAL_DEPARTMENTS,
  MANUAL_EQUATION_GROUPS,
  ManualScope,
  buildManualPdfFilename,
  buildUserManualPrintableHtml,
  filterManualButtons,
  filterManualDepartments,
  filterManualEquations,
  getManualStatsSummary,
} from '../utils/userManualData';
import {
  FileSystemDirectoryHandleLike,
  PartitionReadinessReport,
  generateHtmlStringToPdfBlob,
  pickLocalPartitionDirectory,
  printHtmlStringA4,
  savePdfBlobToPartitionOrDownload,
  testLocalPartitionReadiness,
} from '../utils/pdfHelper';

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
  logoBase64?: string;
  administrationTitle?: string;
  directorateTitle?: string;
  preparedBy?: string;
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

const VIDEO_CHAPTERS: VideoChapter[] = [
  {
    id: 'ch-bakeries',
    number: '01',
    title: 'تسجيل المخابز والحصص التموينية والمعادلات السبع',
    durationSec: 18,
    summary:
      'شرح عملي لكيفية إضافة مخبز جديد، ربطه بالوحدة المحلية والقرية، وحساب الحصة التأمينية والأرغفة ومتوسط نصيب الفرد آلياً.',
    voiceoverSteps: [
      '1. من القائمة الجانبية، اختر «إضافة مخبز جديد» أو انتقل إلى سجل بيانات المخابز.',
      '2. أدخل رقم الماكينة واسم صاحب المخبز وحدد القرية والوحدة المحلية التابع لها.',
      '3. بمجرد كتابة المبلغ التأميني وسعر الشيكارة، يحسب النظام الحصة التأمينية = (التأمين ÷ السعر) ÷ 3.',
      '4. عند إدخال الحصة الفعلية وعدد السكان والمستفيدين، يحسب النظام الأرغفة والمتوسطات والفروق فوراً.',
    ],
    accentColor: '#0d9488',
    imageSrc: guideBakeriesImg,
    metricsPreview: [
      { label: 'الحصة التأمينية', value: '(التأمين ÷ السعر) ÷ 3' },
      { label: 'الأرغفة اليومية', value: 'الحصة الفعلية × 1250' },
      { label: 'متوسط الفرد', value: 'الأرغفة ÷ المستفيدين' },
    ],
  },
  {
    id: 'ch-debts',
    number: '02',
    title: 'إدارة المديونيات وغرامات نقص الوزن وتحصيل الأقساط',
    durationSec: 18,
    summary:
      'طريقة تسجيل المخالفات وشيكارات التصرف وحساب غرامة نقص وزن الرغيف وتحصيل الأقساط الأسبوعية.',
    voiceoverSteps: [
      '1. افتح «قسم سجل المديونيات» أو اضغط «إضافة مديونية أو جدولة سداد» من القائمة الجانبية.',
      '2. اختر المخبز برقم الماكينة ليتم جلب القرية والوحدة المحلية تلقائياً.',
      '3. استخدم حاسبة غرامات نقص وزن الرغيف لتطبيق شرائح لائحة 5 نوفمبر 2024 بدقة.',
      '4. عند سداد قسط، اضغط «تحصيل قسط» للخصم الفوري وتحديث نسبة التحصيل في كافة التقارير.',
    ],
    accentColor: '#d97706',
    imageSrc: guideDebtsImg,
    metricsPreview: [
      { label: 'قيمة التصرف', value: 'الشيكارات × السعر × المضاعف' },
      { label: 'صافي المديونية', value: 'إجمالي المستحقات − المسدد' },
      { label: 'تنبيه التأخير', value: 'أكثر من 14 يوماً أو > 20 ألف' },
    ],
  },
  {
    id: 'ch-sync',
    number: '03',
    title: 'المزامنة الفورية بين الأجهزة وسجل التغييرات التاريخي',
    durationSec: 18,
    summary:
      'آلية المزامنة اللحظية عبر Supabase وحفظ سجل التغييرات التاريخي للمخابز القابل للبحث بالاسم والتاريخ.',
    voiceoverSteps: [
      '1. أي تعديل على مخبز يُسجل تلقائياً في اللوحة الجانبية «سجل التغييرات التاريخي للمخابز».',
      '2. يمكن البحث في التعديلات باسم صاحب المخبز وبتاريخ التعديل أو نطاق زمني محدد.',
      '3. تُرسل التحديثات لحظياً لجميع الأجهزة عبر Supabase Realtime دون الحاجة لتحديث الصفحة.',
      '4. تحمي خزنة الأمان قسم الحفظ والنسخ والنسخ الاحتياطي والاستعادة.',
    ],
    accentColor: '#0284c7',
    imageSrc: guideCloudSyncImg,
    metricsPreview: [
      { label: 'المزامنة اللحظية', value: 'Supabase Realtime' },
      { label: 'السجل التاريخي', value: 'بحث بالاسم والتاريخ' },
      { label: 'توحيد السكان', value: 'علامة — في الوحدة المحلية' },
    ],
  },
  {
    id: 'ch-reports',
    number: '04',
    title: 'التقارير الرسمية بشعار الوزارة وتصدير PDF واختيار البارتيشن',
    durationSec: 16,
    summary:
      'استخدام شريط التقارير الموحد ReportToolbar وإصدار تقارير PDF وA4 مرتبطة تلقائياً بشعار وزارة التموين.',
    voiceoverSteps: [
      '1. في صف إجمالي الوحدة المحلية، إذا كان عدد السكان أو المستفيدين موحداً يظهر الرمز (—) ولا يتكرر جمعه.',
      '2. في صف إجمالي القرية والإجمالي العام تُجمع القيمة الموحدة مرة واحدة لكل وحدة محلية بدقة.',
      '3. جميع تقارير الطباعة وPDF مرتبطة تلقائياً بشعار وزارة التموين بالترويسة الرسمية.',
      '4. يمكنك تصدير دليل المستخدم أو التقارير بصيغة PDF واختيار واختبار بارتيشن الحفظ على جهازك.',
    ],
    accentColor: '#0f2342',
    imageSrc: guideReportsImg,
    metricsPreview: [
      { label: 'شعار الوزارة', value: 'مربوط بكل التقارير' },
      { label: 'شريط ReportToolbar', value: 'PDF + طباعة A4 + Excel' },
      { label: 'حماية الجداول', value: 'ErrorBoundary + Button' },
    ],
  },
];

type GuideActiveTab = 'departments' | 'buttons' | 'equations' | 'video';

export const UserGuideView: React.FC<UserGuideViewProps> = ({
  onNavigateTab,
  onOpenModal,
  bakeriesCount,
  debtsCount,
  villagesCount,
  logoBase64,
  administrationTitle = 'إدارة تموين مركز المحلة الكبرى',
  directorateTitle = 'مديرية التموين والتجارة الداخلية بالغربية',
  preparedBy = 'مسؤول المنظومة التموينية',
}) => {
  const manualStats = useMemo(() => getManualStatsSummary(), []);
  const effectiveLogo = logoBase64 || MINISTRY_LOGO_URL;

  const [activeGuideTab, setActiveGuideTab] = useState<GuideActiveTab>('departments');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [selectedDeptFilter, setSelectedDeptFilter] = useState<string>('all');
  const [selectedEqGroupFilter, setSelectedEqGroupFilter] = useState<string>('all');
  const [expandedDeptIds, setExpandedDeptIds] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(MANUAL_DEPARTMENTS.map((d) => [d.id, true]))
  );

  const [showPartitionPanel, setShowPartitionPanel] = useState<boolean>(true);
  const [selectedPartitionId, setSelectedPartitionId] = useState<string>(LOCAL_PARTITION_OPTIONS[0].id);
  const [selectedDirHandle, setSelectedDirHandle] = useState<FileSystemDirectoryHandleLike | null>(null);
  const [selectedDirName, setSelectedDirName] = useState<string | null>(null);
  const [manualScope, setManualScope] = useState<ManualScope>('full');
  const [paperSize, setPaperSize] = useState<'a4' | 'a3'>('a4');
  const [orientation, setOrientation] = useState<'portrait' | 'landscape'>('portrait');
  const [customFilename, setCustomFilename] = useState<string>(() =>
    buildManualPdfFilename('', 'full')
  );

  const [isExportingPdf, setIsExportingPdf] = useState<boolean>(false);
  const [isTestingPartition, setIsTestingPartition] = useState<boolean>(false);
  const [exportStatusMsg, setExportStatusMsg] = useState<{
    type: 'info' | 'success' | 'warning' | 'error';
    text: string;
  } | null>(null);
  const [partitionReport, setPartitionReport] = useState<PartitionReadinessReport | null>(null);

  const [selectedChapterIdx, setSelectedChapterIdx] = useState<number>(0);
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [elapsedSec, setElapsedSec] = useState<number>(0);
  const [playbackSpeed, setPlaybackSpeed] = useState<number>(1);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const loadedImagesRef = useRef<Record<string, HTMLImageElement>>({});
  const partitionPanelRef = useRef<HTMLDivElement | null>(null);

  const selectedPartition = useMemo(
    () =>
      LOCAL_PARTITION_OPTIONS.find((p) => p.id === selectedPartitionId) ||
      LOCAL_PARTITION_OPTIONS[0],
    [selectedPartitionId]
  );

  const effectiveFilename = useMemo(
    () => buildManualPdfFilename(customFilename, manualScope),
    [customFilename, manualScope]
  );

  const targetPathPreview = useMemo(() => {
    if (selectedDirName) {
      return `${selectedPartition.driveLetter}${selectedDirName}\\${effectiveFilename}`;
    }
    return `${selectedPartition.defaultFolder}\\${effectiveFilename}`;
  }, [selectedDirName, selectedPartition, effectiveFilename]);

  const filteredDepartments = useMemo(
    () => filterManualDepartments(searchQuery, selectedDeptFilter),
    [searchQuery, selectedDeptFilter]
  );

  const filteredButtonGroups = useMemo(
    () => filterManualButtons(searchQuery),
    [searchQuery]
  );

  const filteredEquationGroups = useMemo(
    () => filterManualEquations(searchQuery, selectedEqGroupFilter),
    [searchQuery, selectedEqGroupFilter]
  );

  const currentChapter = VIDEO_CHAPTERS[selectedChapterIdx] || VIDEO_CHAPTERS[0];

  useEffect(() => {
    if (activeGuideTab !== 'video') return;
    VIDEO_CHAPTERS.forEach((ch) => {
      if (!loadedImagesRef.current[ch.id]) {
        const img = new Image();
        img.src = ch.imageSrc;
        img.onload = () => {
          loadedImagesRef.current[ch.id] = img;
        };
      }
    });
  }, [activeGuideTab]);

  useEffect(() => {
    if (activeGuideTab !== 'video' || !isPlaying) return;
    const intervalMs = 120;
    const timer = setInterval(() => {
      setElapsedSec((prev) => {
        const next = prev + (intervalMs / 1000) * playbackSpeed;
        if (next >= currentChapter.durationSec) {
          setSelectedChapterIdx((idx) => (idx + 1) % VIDEO_CHAPTERS.length);
          return 0;
        }
        return next;
      });
    }, intervalMs);
    return () => clearInterval(timer);
  }, [activeGuideTab, isPlaying, playbackSpeed, currentChapter.durationSec]);

  useEffect(() => {
    if (activeGuideTab !== 'video') return;
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

    const grad = ctx.createLinearGradient(0, 0, width, height);
    grad.addColorStop(0, '#0a1628');
    grad.addColorStop(1, '#111827');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, width, height);

    const img = loadedImagesRef.current[currentChapter.id];
    const imgBoxX = 36;
    const imgBoxY = 74;
    const imgBoxW = 540;
    const imgBoxH = 325;

    ctx.save();
    ctx.beginPath();
    ctx.roundRect(imgBoxX, imgBoxY, imgBoxW, imgBoxH, 10);
    ctx.clip();
    if (img && img.complete && img.naturalWidth > 0) {
      const zoom = 1 + progress * 0.05;
      const drawW = imgBoxW * zoom;
      const drawH = imgBoxH * zoom;
      ctx.drawImage(img, imgBoxX - (drawW - imgBoxW) / 2, imgBoxY - (drawH - imgBoxH) / 2, drawW, drawH);
    } else {
      ctx.fillStyle = '#1e293b';
      ctx.fillRect(imgBoxX, imgBoxY, imgBoxW, imgBoxH);
    }
    ctx.restore();

    ctx.strokeStyle = currentChapter.accentColor;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.roundRect(imgBoxX, imgBoxY, imgBoxW, imgBoxH, 10);
    ctx.stroke();

    ctx.fillStyle = 'rgba(15, 35, 66, 0.92)';
    ctx.fillRect(0, 0, width, 54);
    ctx.fillStyle = currentChapter.accentColor;
    ctx.fillRect(0, 52, width, 2);

    ctx.direction = 'rtl';
    ctx.textAlign = 'right';
    ctx.fillStyle = '#f8fafc';
    ctx.font = 'bold 18px Cairo, sans-serif';
    ctx.fillText(`الفصل ${currentChapter.number}: ${currentChapter.title}`, width - 24, 34);

    ctx.textAlign = 'left';
    ctx.fillStyle = '#94a3b8';
    ctx.font = 'bold 13px Cairo, sans-serif';
    ctx.fillText(`خطوة ${stepIndex + 1} من ${currentChapter.voiceoverSteps.length}`, 24, 33);

    const rightColX = width - 24;
    const rightColW = width - 620;
    ctx.direction = 'rtl';
    ctx.textAlign = 'right';

    currentChapter.voiceoverSteps.forEach((stepText, idx) => {
      const boxY = 74 + idx * 70;
      const isCurrent = idx === stepIndex;
      ctx.save();
      ctx.fillStyle = isCurrent ? 'rgba(13, 148, 136, 0.22)' : 'rgba(15, 23, 42, 0.7)';
      ctx.strokeStyle = isCurrent ? currentChapter.accentColor : 'rgba(51, 65, 85, 0.6)';
      ctx.lineWidth = isCurrent ? 2 : 1;
      ctx.beginPath();
      ctx.roundRect(width - rightColW - 24, boxY, rightColW, 60, 8);
      ctx.fill();
      ctx.stroke();

      ctx.fillStyle = isCurrent ? '#ffffff' : '#cbd5e1';
      ctx.font = isCurrent ? 'bold 13.5px Cairo, sans-serif' : '13px Cairo, sans-serif';
      const words = stepText.split(' ');
      let line1 = '';
      let line2 = '';
      for (const w of words) {
        if ((line1 + ' ' + w).length <= 56) line1 = (line1 + ' ' + w).trim();
        else line2 = (line2 + ' ' + w).trim();
      }
      ctx.fillText(line1, rightColX - 14, boxY + 26);
      if (line2) ctx.fillText(line2, rightColX - 14, boxY + 46);
      ctx.restore();
    });

    ctx.fillStyle = 'rgba(15, 23, 42, 0.96)';
    ctx.fillRect(24, height - 76, width - 48, 54);
    ctx.direction = 'rtl';
    ctx.textAlign = 'right';
    ctx.fillStyle = '#5eead4';
    ctx.font = 'bold 12px Cairo, sans-serif';
    ctx.fillText('الشرح النصي للخطوة الحالية:', width - 40, height - 54);
    ctx.fillStyle = '#f8fafc';
    ctx.font = 'bold 14px Cairo, sans-serif';
    ctx.fillText(activeVoiceover, width - 40, height - 32);

    ctx.fillStyle = '#1e293b';
    ctx.fillRect(0, height - 6, width, 6);
    ctx.fillStyle = currentChapter.accentColor;
    ctx.fillRect(0, height - 6, width * progress, 6);
  }, [activeGuideTab, elapsedSec, currentChapter]);

  const handlePickNativeFolder = async () => {
    setExportStatusMsg({ type: 'info', text: 'جاري فتح مستعرض البارتيشن والمجلدات على جهازك...' });
    const res = await pickLocalPartitionDirectory();
    if (res.ok && res.handle) {
      setSelectedDirHandle(res.handle);
      setSelectedDirName(res.folderName);
      setExportStatusMsg({
        type: 'success',
        text: `تم اختيار المجلد المحلي بنجاح: (${res.folderName}). يمكنك الآن إجراء اختبار الجاهزية أو حفظ ملف PDF مباشرة بداخله.`,
      });
    } else {
      setExportStatusMsg({
        type: 'warning',
        text: res.reason || 'لم يتم تحديد مجلد؛ سيتم تنزيل ملف PDF مباشرة إلى جهازك المحلي.',
      });
    }
  };

  const handleTestPartitionReadiness = async () => {
    setIsTestingPartition(true);
    setExportStatusMsg({
      type: 'info',
      text: `جاري اختبار جاهزية البارتيشن (${selectedDirName || selectedPartition.driveLetter}) ومساحة التخزين للتحميل...`,
    });
    try {
      const report = await testLocalPartitionReadiness(selectedDirHandle, targetPathPreview);
      setPartitionReport(report);
      setExportStatusMsg({
        type: report.status === 'error' ? 'error' : report.status === 'ready' ? 'success' : 'info',
        text: report.summary,
      });
    } finally {
      setIsTestingPartition(false);
    }
  };

  const handlePrintUserManual = () => {
    const html = buildUserManualPrintableHtml({
      logoUrl: effectiveLogo,
      administrationTitle,
      directorateTitle,
      preparedBy,
      scope: manualScope,
      targetPartitionLabel: targetPathPreview,
      stats: { bakeriesCount, debtsCount, villagesCount },
    });
    printHtmlStringA4(html, `دليل المستخدم الشامل - ${administrationTitle}`, {
      paperSize,
      orientation,
      margins: 'normal',
      fontClass: 'report-font-standard',
    });
    setExportStatusMsg({
      type: 'success',
      text: `تم تجهيز نسخة الطباعة الرسمية (${paperSize.toUpperCase()} — ${orientation === 'portrait' ? 'عمودي' : 'أفقي'}) بشعار وزارة التموين وفتح نافذة الطباعة.`,
    });
  };

  const handleExportUserManualPdf = async (useSaveAsPicker: boolean = true) => {
    if (isExportingPdf) return;
    setIsExportingPdf(true);
    setExportStatusMsg({
      type: 'info',
      text: 'جاري تجميع فصول الدليل والمعادلات الحسابية وتحويلها إلى ملف PDF عربي...',
    });

    try {
      const html = buildUserManualPrintableHtml({
        logoUrl: effectiveLogo,
        administrationTitle,
        directorateTitle,
        preparedBy,
        scope: manualScope,
        targetPartitionLabel: targetPathPreview,
        stats: { bakeriesCount, debtsCount, villagesCount },
      });

      const pdfBlob = await generateHtmlStringToPdfBlob(html, {
        filename: effectiveFilename,
        title: `دليل المستخدم الشامل - ${administrationTitle}`,
        paperSize,
        orientation,
        margins: 'normal',
        onProgress: (stage) => setExportStatusMsg({ type: 'info', text: stage }),
      });

      if (pdfBlob && pdfBlob.size > 0) {
        const saved = await savePdfBlobToPartitionOrDownload(pdfBlob, {
          filename: effectiveFilename,
          directoryHandle: selectedDirHandle,
          useSaveAsPicker,
        });
        setExportStatusMsg({
          type: saved.ok ? 'success' : 'warning',
          text: saved.message,
        });
      } else {
        printHtmlStringA4(html, `دليل المستخدم الشامل - ${administrationTitle}`, {
          paperSize,
          orientation,
          margins: 'normal',
        });
        setExportStatusMsg({
          type: 'warning',
          text: 'تم فتح نافذة الطباعة الرسمية لحفظ دليل المستخدم كملف PDF مباشرة على أي بارتيشن بجهازك (اختر Save as PDF).',
        });
      }
    } catch (err) {
      console.error('User manual PDF export error:', err);
      setExportStatusMsg({
        type: 'error',
        text: 'حدث خطأ أثناء تحويل الدليل إلى PDF. يمكنك استخدام زر «طباعة دليل المستخدم» واختيار الحفظ كـ PDF.',
      });
    } finally {
      setIsExportingPdf(false);
    }
  };

  const handleScopeChange = (nextScope: ManualScope) => {
    setManualScope(nextScope);
    setCustomFilename(buildManualPdfFilename('', nextScope));
  };

  const toggleDeptExpand = (deptId: string) => {
    setExpandedDeptIds((prev) => ({ ...prev, [deptId]: !prev[deptId] }));
  };

  return (
    <div className="space-y-5 pb-12" dir="rtl" data-testid="user-guide-root">
      {/* Official Header Bar with Ministry Logo & Primary Actions */}
      <section className="bg-white rounded-xl border border-slate-200 p-5 shadow-xs space-y-4">
        <div className="flex items-start gap-4 min-w-0">
          <div className="w-14 h-14 rounded-lg border border-slate-200 bg-slate-50 p-1.5 flex items-center justify-center shrink-0">
            <img
              src={effectiveLogo}
              alt="شعار وزارة التموين والتجارة الداخلية"
              referrerPolicy="no-referrer"
              className="w-full h-full object-contain"
            />
          </div>
          <div className="min-w-0 flex-1 space-y-1 text-start">
            <div className="flex flex-wrap items-center gap-2 text-xs font-bold text-slate-500">
              <span>وزارة التموين والتجارة الداخلية</span>
              <span aria-hidden="true">·</span>
              <span>{directorateTitle}</span>
              <span aria-hidden="true">·</span>
              <span className="text-[#0D9488]">{administrationTitle}</span>
            </div>
            <h1 className="text-xl sm:text-2xl font-black text-[#0F2342] leading-snug">
              دليل المستخدم الشامل والمرجع الحسابي للمنظومة
            </h1>
            <p className="text-xs sm:text-sm text-slate-600 leading-relaxed">
              تعريف كامل لكل قسم وتبويبة ووظيفة وزر داخل المنظومة، وشرح تفصيلي لجميع المعادلات الحسابية المعتمدة
              مع إمكانية التحويل الفوري إلى ملف PDF وتصديره على الجهاز المحلي واختيار واختبار بارتيشن الحفظ والطباعة الرسمية.
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2.5 pt-3 border-t border-slate-100">
          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant="primary"
              size="md"
              data-testid="manual-export-pdf-top-btn"
              onClick={() => handleExportUserManualPdf(true)}
              disabled={isExportingPdf}
              className="bg-[#0F2342] hover:bg-[#1E3A8A] text-white"
            >
              {isExportingPdf ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <FileDown className="w-4 h-4" />
              )}
              <span>{isExportingPdf ? 'جاري إنشاء PDF...' : 'تصدير PDF للجهاز المحلي'}</span>
            </Button>

            <Button
              variant="secondary"
              size="md"
              data-testid="manual-print-top-btn"
              onClick={handlePrintUserManual}
            >
              <Printer className="w-4 h-4 text-[#0D9488]" />
              <span>طباعة دليل المستخدم</span>
            </Button>

            <Button
              variant="secondary"
              size="md"
              data-testid="manual-toggle-partition-btn"
              onClick={() => {
                setShowPartitionPanel((prev) => !prev);
                setTimeout(() => {
                  partitionPanelRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
                }, 60);
              }}
            >
              <HardDrive className="w-4 h-4 text-amber-600" />
              <span>اختيار واختبار البارتيشن</span>
              {showPartitionPanel ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
            </Button>
          </div>

          <div className="text-xs font-bold text-slate-500">
            إصدار موثّق يشمل {manualStats.departmentsCount} أقسام · {manualStats.tabsCount} تبويبة · {manualStats.equationsCount} معادلة
          </div>
        </div>
      </section>

      {/* Unified 4-Card KPI Grid */}
      <section aria-label="إحصائيات محتوى دليل المستخدم" className="grid grid-cols-2 lg:grid-cols-4 gap-3.5">
        <div className="bg-white rounded-xl border border-slate-200 p-4 text-start">
          <div className="text-xs font-bold text-slate-500">الأقسام الرئيسية بالقائمة</div>
          <div className="mt-1.5 text-2xl font-black text-[#0F2342] tabular-nums">
            {manualStats.departmentsCount}
          </div>
          <div className="mt-1 text-xs text-slate-500">مرتبة من المخابز حتى الحفظ والنسخ</div>
        </div>

        <div className="bg-white rounded-xl border border-slate-200 p-4 text-start">
          <div className="text-xs font-bold text-slate-500">التبويبات والوظائف المشروحة</div>
          <div className="mt-1.5 text-2xl font-black text-[#0D9488] tabular-nums">
            {manualStats.tabsCount}
          </div>
          <div className="mt-1 text-xs text-slate-500">تغطية كاملة لكل شاشات المنظومة</div>
        </div>

        <div className="bg-white rounded-xl border border-slate-200 p-4 text-start">
          <div className="text-xs font-bold text-slate-500">الأزرار وعناصر التحكم</div>
          <div className="mt-1.5 text-2xl font-black text-[#1E3A8A] tabular-nums">
            {manualStats.buttonsCount}
          </div>
          <div className="mt-1 text-xs text-slate-500">أزرار الصفوف وشريط التقارير والتصدير</div>
        </div>

        <div className="bg-white rounded-xl border border-slate-200 p-4 text-start">
          <div className="text-xs font-bold text-slate-500">المعادلات الحسابية الموثقة</div>
          <div className="mt-1.5 text-2xl font-black text-amber-700 tabular-nums">
            {manualStats.equationsCount}
          </div>
          <div className="mt-1 text-xs text-slate-500">موزعة على 7 محركات حسابية بأمثلة</div>
        </div>
      </section>

      {/* Local Device PDF Export & Partition Selection / Testing Panel */}
      {showPartitionPanel && (
        <section
          ref={partitionPanelRef}
          aria-label="إعدادات تصدير PDF واختيار واختبار بارتيشن الحفظ"
          data-testid="manual-partition-panel"
          className="bg-white rounded-xl border border-slate-200 p-5 space-y-4"
        >
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3 border-b border-slate-200 pb-3.5">
            <div className="text-start">
              <h2 className="text-base font-black text-[#0F2342]">
                إعدادات تصدير PDF واختيار واختبار بارتيشن التحميل على الجهاز المحلي
              </h2>
              <p className="text-xs text-slate-600 mt-0.5">
                حدد البارتيشن أو المجلد المستهدف، اختبر جاهزية القرص للتحميل، واضبط نطاق الدليل ومقاس الطباعة قبل التصدير.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2 shrink-0">
              <Button
                variant="secondary"
                size="sm"
                data-testid="manual-pick-folder-btn"
                onClick={handlePickNativeFolder}
              >
                <FolderOpen className="w-4 h-4 text-[#0D9488]" />
                <span>اختيار مجلد / بارتيشن من الجهاز</span>
              </Button>
              <Button
                variant="secondary"
                size="sm"
                data-testid="manual-test-partition-btn"
                onClick={handleTestPartitionReadiness}
                disabled={isTestingPartition}
              >
                {isTestingPartition ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <FlaskConical className="w-4 h-4 text-amber-600" />
                )}
                <span>اختبار جاهزية البارتيشن للتحميل</span>
              </Button>
            </div>
          </div>

          {/* Partition Presets Grid */}
          <div className="space-y-2">
            <div className="text-xs font-bold text-slate-700 text-start">
              اختر البارتيشن المستهدف على الجهاز المحلي (Drive / Partition):
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
              {LOCAL_PARTITION_OPTIONS.map((part) => {
                const isSelected = part.id === selectedPartitionId;
                return (
                  <button
                    key={part.id}
                    type="button"
                    data-testid={`partition-option-${part.id}`}
                    onClick={() => setSelectedPartitionId(part.id)}
                    className={`text-start p-3 rounded-lg border transition cursor-pointer ${
                      isSelected
                        ? 'bg-slate-900 text-white border-slate-900'
                        : 'bg-slate-50 hover:bg-slate-100 text-slate-800 border-slate-200'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-black text-sm tabular-nums" dir="ltr">
                        {part.driveLetter}
                      </span>
                      <span
                        className={`text-[11px] font-bold ${
                          isSelected ? 'text-emerald-300' : 'text-slate-500'
                        }`}
                      >
                        {isSelected ? 'محدد حالياً' : 'تحديد'}
                      </span>
                    </div>
                    <div className={`text-xs font-bold mt-1 ${isSelected ? 'text-slate-100' : 'text-slate-800'}`}>
                      {part.label}
                    </div>
                    <p className={`text-[11px] mt-1 leading-relaxed ${isSelected ? 'text-slate-300' : 'text-slate-500'}`}>
                      {part.description}
                    </p>
                  </button>
                );
              })}
            </div>
          </div>

          {/* PDF Options Form Controls */}
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3.5 pt-1">
            <div className="text-start">
              <label htmlFor="manual-scope-select" className="block text-xs font-bold text-slate-700 mb-1">
                نطاق محتوى ملف PDF والطباعة
              </label>
              <select
                id="manual-scope-select"
                value={manualScope}
                onChange={(e) => handleScopeChange(e.target.value as ManualScope)}
                className="w-full px-3 py-2 text-xs font-bold bg-slate-50 border border-slate-300 rounded-lg focus:outline-none focus:border-[#0F2342]"
              >
                <option value="full">الدليل الكامل (الأقسام + التبويبات + الأزرار + المعادلات)</option>
                <option value="departments_buttons">الأقسام والتبويبات والأزرار فقط</option>
                <option value="equations_only">المرجع الحسابي لجميع المعادلات فقط</option>
              </select>
            </div>

            <div className="text-start">
              <label htmlFor="manual-paper-select" className="block text-xs font-bold text-slate-700 mb-1">
                مقاس الورق
              </label>
              <select
                id="manual-paper-select"
                value={paperSize}
                onChange={(e) => setPaperSize(e.target.value as 'a4' | 'a3')}
                className="w-full px-3 py-2 text-xs font-bold bg-slate-50 border border-slate-300 rounded-lg focus:outline-none focus:border-[#0F2342]"
              >
                <option value="a4">A4 قياسي رسمي</option>
                <option value="a3">A3 عريض</option>
              </select>
            </div>

            <div className="text-start">
              <label htmlFor="manual-orient-select" className="block text-xs font-bold text-slate-700 mb-1">
                اتجاه الصفحات
              </label>
              <select
                id="manual-orient-select"
                value={orientation}
                onChange={(e) => setOrientation(e.target.value as 'portrait' | 'landscape')}
                className="w-full px-3 py-2 text-xs font-bold bg-slate-50 border border-slate-300 rounded-lg focus:outline-none focus:border-[#0F2342]"
              >
                <option value="portrait">عمودي (Portrait — مناسب للكتب والأدلة)</option>
                <option value="landscape">أفقي (Landscape — جداول عريضة)</option>
              </select>
            </div>

            <div className="text-start">
              <label htmlFor="manual-filename-input" className="block text-xs font-bold text-slate-700 mb-1">
                اسم ملف PDF المحلي
              </label>
              <input
                id="manual-filename-input"
                type="text"
                value={customFilename}
                onChange={(e) => setCustomFilename(e.target.value)}
                placeholder="دليل_المستخدم_الشامل.pdf"
                className="w-full px-3 py-2 text-xs font-bold bg-slate-50 border border-slate-300 rounded-lg focus:outline-none focus:border-[#0F2342]"
              />
            </div>
          </div>

          {/* Target Path Preview & Execute Actions */}
          <div className="bg-slate-50 border border-slate-200 rounded-lg p-3.5 flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3">
            <div className="text-start min-w-0 flex-1 space-y-1">
              <div className="text-xs font-bold text-slate-500">
                المسار المستهدف للتحميل والحفظ {selectedDirName ? '(مجلد متصل مباشرة)' : '(حسب اختيار البارتيشن)'}:
              </div>
              <div
                className="text-xs font-mono font-bold text-[#0F2342] bg-white border border-slate-200 rounded-md px-2.5 py-1.5 break-all text-left"
                dir="ltr"
                title={targetPathPreview}
                data-testid="manual-target-path-preview"
              >
                {targetPathPreview}
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2 shrink-0">
              <Button
                variant="primary"
                size="md"
                data-testid="manual-export-pdf-saveas-btn"
                onClick={() => handleExportUserManualPdf(true)}
                disabled={isExportingPdf}
                className="bg-[#0D9488] hover:bg-[#0F766E] text-white"
              >
                {isExportingPdf ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileDown className="w-4 h-4" />}
                <span>تصدير PDF وحفظ على البارتيشن</span>
              </Button>
              <Button
                variant="secondary"
                size="md"
                data-testid="manual-print-panel-btn"
                onClick={handlePrintUserManual}
              >
                <Printer className="w-4 h-4" />
                <span>طباعة دليل المستخدم</span>
              </Button>
            </div>
          </div>

          {/* Live Status Feedback Banner */}
          {exportStatusMsg && (
            <div
              role="status"
              data-testid="manual-export-status"
              className={`rounded-lg border px-4 py-3 text-xs font-bold flex items-start gap-2.5 text-start ${
                exportStatusMsg.type === 'success'
                  ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
                  : exportStatusMsg.type === 'warning'
                  ? 'bg-amber-50 border-amber-200 text-amber-900'
                  : exportStatusMsg.type === 'error'
                  ? 'bg-rose-50 border-rose-200 text-rose-900'
                  : 'bg-sky-50 border-sky-200 text-sky-900'
              }`}
            >
              {exportStatusMsg.type === 'success' ? (
                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
              ) : exportStatusMsg.type === 'error' || exportStatusMsg.type === 'warning' ? (
                <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
              ) : (
                <Loader2 className="w-4 h-4 text-sky-600 shrink-0 mt-0.5 animate-spin" />
              )}
              <span className="leading-relaxed">{exportStatusMsg.text}</span>
            </div>
          )}

          {/* Partition Readiness Diagnostic Report */}
          {partitionReport && (
            <div
              data-testid="manual-partition-test-results"
              className="rounded-lg border border-slate-200 bg-white p-4 space-y-2.5 text-start"
            >
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-2">
                <div className="flex items-center gap-2 text-xs font-black text-[#0F2342]">
                  <ShieldCheck className="w-4 h-4 text-[#0D9488]" />
                  <span>نتيجة اختبار جاهزية البارتيشن والقرص المحلي</span>
                </div>
                <span className="text-[11px] font-bold text-slate-500 tabular-nums">
                  وقت الفحص: {partitionReport.checkedAt}
                </span>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-2.5">
                {partitionReport.checks.map((chk, i) => (
                  <div
                    key={i}
                    className={`rounded-lg border p-3 text-xs ${
                      chk.ok
                        ? 'bg-emerald-50/60 border-emerald-200 text-emerald-950'
                        : 'bg-amber-50/70 border-amber-200 text-amber-950'
                    }`}
                  >
                    <div className="font-black flex items-center gap-1.5">
                      {chk.ok ? (
                        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                      ) : (
                        <AlertTriangle className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                      )}
                      <span>{chk.label}</span>
                    </div>
                    <p className="mt-1 text-[11px] leading-relaxed opacity-90">{chk.detail}</p>
                  </div>
                ))}
              </div>
            </div>
          )}
        </section>
      )}

      {/* Navigation Tabs + Instant Arabic Search Bar */}
      <section className="bg-white rounded-xl border border-slate-200 p-4 space-y-3">
        <div
          role="tablist"
          aria-label="أقسام دليل المستخدم"
          className="flex flex-nowrap overflow-x-auto items-center gap-1.5 p-1 bg-slate-100 rounded-lg"
        >
          {[
            { id: 'departments', label: 'الأقسام والتبويبات (9)', icon: LayoutGrid },
            { id: 'buttons', label: `دليل الأزرار (${manualStats.buttonsCount})`, icon: MousePointerClick },
            { id: 'equations', label: `المعادلات الحسابية (${manualStats.equationsCount})`, icon: Calculator },
            { id: 'video', label: 'الفيديو التفاعلي (4 فصول)', icon: Video },
          ].map((tab) => {
            const Icon = tab.icon;
            const isActive = activeGuideTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                role="tab"
                aria-selected={isActive}
                data-testid={`manual-tab-${tab.id}`}
                onClick={() => setActiveGuideTab(tab.id as GuideActiveTab)}
                className={`inline-flex items-center gap-1.5 px-3.5 py-2 rounded-md text-xs font-bold whitespace-nowrap shrink-0 transition cursor-pointer ${
                  isActive
                    ? 'bg-white text-[#0F2342] shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <Icon className="w-3.5 h-3.5" />
                <span>{tab.label}</span>
              </button>
            );
          })}
        </div>

        {activeGuideTab !== 'video' && (
          <div className="flex flex-wrap items-center justify-between gap-2.5">
            {activeGuideTab === 'departments' && (
              <select
                aria-label="تصفية حسب القسم"
                value={selectedDeptFilter}
                onChange={(e) => setSelectedDeptFilter(e.target.value)}
                className="px-3 py-2 text-xs font-bold bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:border-[#0F2342]"
              >
                <option value="all">جميع الأقسام التسعة</option>
                {MANUAL_DEPARTMENTS.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.title}
                  </option>
                ))}
              </select>
            )}

            {activeGuideTab === 'equations' && (
              <select
                aria-label="تصفية حسب مجموعة المعادلات"
                value={selectedEqGroupFilter}
                onChange={(e) => setSelectedEqGroupFilter(e.target.value)}
                className="px-3 py-2 text-xs font-bold bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:border-[#0F2342]"
              >
                <option value="all">جميع المحركات الحسابية (7)</option>
                {MANUAL_EQUATION_GROUPS.map((g) => (
                  <option key={g.id} value={g.id}>
                    {g.title}
                  </option>
                ))}
              </select>
            )}

            <div className="relative min-w-[240px] flex-1 sm:flex-initial">
              <Search className="w-4 h-4 text-slate-400 absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                type="text"
                aria-label="بحث في دليل المستخدم والمعادلات"
                data-testid="manual-search-input"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="ابحث عن تبويبة، زر، أو معادلة..."
                className="w-full pr-9 pl-3 py-2 text-xs font-bold bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:border-[#0F2342]"
              />
            </div>
          </div>
        )}
      </section>

      {/* TAB 1: All 9 Departments & Every Tab */}
      {activeGuideTab === 'departments' && (
        <ErrorBoundary fallbackTitle="تعذر عرض جدول الأقسام والتبويبات مؤقتاً">
          <div className="space-y-4" data-testid="manual-departments-list">
            {filteredDepartments.length === 0 ? (
              <div className="bg-white rounded-xl border border-slate-200 p-8 text-center space-y-2">
                <p className="text-sm font-black text-slate-800">لا توجد نتائج مطابقة للبحث الحالي</p>
                <p className="text-xs text-slate-500">جرّب مسح كلمة البحث أو اختيار «جميع الأقسام التسعة».</p>
                <Button variant="secondary" size="sm" onClick={() => { setSearchQuery(''); setSelectedDeptFilter('all'); }}>
                  إعادة ضبط البحث
                </Button>
              </div>
            ) : (
              filteredDepartments.map((dept) => {
                const isExpanded = expandedDeptIds[dept.id] ?? true;
                return (
                  <article
                    key={dept.id}
                    className="bg-white rounded-xl border border-slate-200 overflow-hidden"
                  >
                    <button
                      type="button"
                      onClick={() => toggleDeptExpand(dept.id)}
                      aria-expanded={isExpanded}
                      className="w-full px-5 py-4 bg-slate-50 hover:bg-slate-100/80 border-b border-slate-200 flex items-center justify-between gap-4 text-start transition cursor-pointer"
                    >
                      <div className="space-y-0.5 min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <h3 className="text-base font-black text-[#0F2342]">{dept.title}</h3>
                          <span className="text-xs font-bold text-[#0D9488] tabular-nums">
                            · {dept.tabs.length} تبويبة
                          </span>
                        </div>
                        <p className="text-xs text-slate-600">{dept.subtitle}</p>
                      </div>
                      {isExpanded ? (
                        <ChevronUp className="w-4 h-4 text-slate-500 shrink-0" />
                      ) : (
                        <ChevronDown className="w-4 h-4 text-slate-500 shrink-0" />
                      )}
                    </button>

                    {isExpanded && (
                      <div className="p-5 space-y-4">
                        <div className="text-start space-y-1">
                          <p className="text-xs sm:text-sm text-slate-700 leading-relaxed">{dept.overview}</p>
                          <p className="text-xs font-bold text-slate-500">ملاحظة الصلاحية والتشغيل: {dept.accessNote}</p>
                        </div>

                        <div className="overflow-x-auto rounded-lg border border-slate-200">
                          <table className="w-full text-xs text-start border-collapse min-w-[680px]">
                            <thead>
                              <tr className="bg-[#0F2342] text-white">
                                <th className="py-2.5 px-3 font-black text-start w-[26%] border-l border-slate-700">
                                  اسم التبويبة
                                </th>
                                <th className="py-2.5 px-3 font-black text-start w-[44%] border-l border-slate-700">
                                  الوظيفة والتعريف التشغيلي
                                </th>
                                <th className="py-2.5 px-3 font-black text-start w-[30%]">
                                  أبرز الأزرار والإجراءات المتاحة
                                </th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-200">
                              {dept.tabs.map((tab, idx) => (
                                <tr
                                  key={tab.id}
                                  className={idx % 2 === 0 ? 'bg-white hover:bg-slate-50' : 'bg-slate-50/60 hover:bg-slate-100/70'}
                                >
                                  <td className="py-2.5 px-3 font-black text-[#0F2342] align-top border-l border-slate-200">
                                    {tab.label}
                                  </td>
                                  <td className="py-2.5 px-3 text-slate-700 leading-relaxed align-top border-l border-slate-200">
                                    {tab.purpose}
                                  </td>
                                  <td className="py-2.5 px-3 text-slate-600 leading-relaxed align-top">
                                    {tab.keyActions.join(' · ')}
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    )}
                  </article>
                );
              })
            )}
          </div>
        </ErrorBoundary>
      )}

      {/* TAB 2: Complete Buttons & Controls Reference */}
      {activeGuideTab === 'buttons' && (
        <ErrorBoundary fallbackTitle="تعذر عرض دليل الأزرار والإجراءات مؤقتاً">
          <div className="space-y-4" data-testid="manual-buttons-list">
            {filteredButtonGroups.length === 0 ? (
              <div className="bg-white rounded-xl border border-slate-200 p-8 text-center space-y-2">
                <p className="text-sm font-black text-slate-800">لا توجد أزرار مطابقة للبحث</p>
                <Button variant="secondary" size="sm" onClick={() => setSearchQuery('')}>
                  عرض كل الأزرار
                </Button>
              </div>
            ) : (
              filteredButtonGroups.map((group) => (
                <article
                  key={group.id}
                  className="bg-white rounded-xl border border-slate-200 p-5 space-y-3.5 text-start"
                >
                  <div>
                    <h3 className="text-base font-black text-[#0F2342]">{group.title}</h3>
                    <p className="text-xs text-slate-600 mt-0.5">{group.description}</p>
                  </div>

                  <div className="overflow-x-auto rounded-lg border border-slate-200">
                    <table className="w-full text-xs text-start border-collapse min-w-[720px]">
                      <thead>
                        <tr className="bg-[#0F2342] text-white">
                          <th className="py-2.5 px-3 font-black text-start w-[22%] border-l border-slate-700">
                            اسم الزر
                          </th>
                          <th className="py-2.5 px-3 font-black text-start w-[20%] border-l border-slate-700">
                            مكانه بالواجهة
                          </th>
                          <th className="py-2.5 px-3 font-black text-start w-[34%] border-l border-slate-700">
                            وظيفته عند النقر
                          </th>
                          <th className="py-2.5 px-3 font-black text-start w-[24%]">
                            سلوك الحماية والتشغيل
                          </th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-200">
                        {group.buttons.map((btn, idx) => (
                          <tr
                            key={btn.id}
                            className={idx % 2 === 0 ? 'bg-white hover:bg-slate-50' : 'bg-slate-50/60 hover:bg-slate-100/70'}
                          >
                            <td className="py-2.5 px-3 font-black text-[#0F2342] align-top border-l border-slate-200">
                              {btn.name}
                            </td>
                            <td className="py-2.5 px-3 font-bold text-[#0D9488] align-top border-l border-slate-200">
                              {btn.location}
                            </td>
                            <td className="py-2.5 px-3 text-slate-700 leading-relaxed align-top border-l border-slate-200">
                              {btn.functionDesc}
                            </td>
                            <td className="py-2.5 px-3 text-slate-600 leading-relaxed align-top">
                              {btn.behaviorNote}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </article>
              ))
            )}
          </div>
        </ErrorBoundary>
      )}

      {/* TAB 3: Comprehensive Mathematical Equations Reference */}
      {activeGuideTab === 'equations' && (
        <ErrorBoundary fallbackTitle="تعذر عرض دليل المعادلات الحسابية مؤقتاً">
          <div className="space-y-5" data-testid="manual-equations-list">
            {filteredEquationGroups.length === 0 ? (
              <div className="bg-white rounded-xl border border-slate-200 p-8 text-center space-y-2">
                <p className="text-sm font-black text-slate-800">لا توجد معادلات مطابقة للبحث</p>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => {
                    setSearchQuery('');
                    setSelectedEqGroupFilter('all');
                  }}
                >
                  عرض جميع المعادلات
                </Button>
              </div>
            ) : (
              filteredEquationGroups.map((group) => (
                <article
                  key={group.id}
                  className="bg-white rounded-xl border border-slate-200 p-5 space-y-4 text-start"
                >
                  <div className="border-b border-slate-200 pb-3">
                    <h3 className="text-base font-black text-[#0F2342]">{group.title}</h3>
                    <p className="text-xs text-slate-600 mt-0.5">{group.subtitle}</p>
                  </div>

                  <div className="space-y-3.5">
                    {group.equations.map((eq) => (
                      <div
                        key={eq.id}
                        className="rounded-lg border border-slate-200 bg-slate-50/50 p-4 space-y-2.5"
                      >
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div className="flex items-center gap-2">
                            <span className="font-mono text-xs font-black text-[#0D9488] tabular-nums">
                              {eq.code}
                            </span>
                            <span aria-hidden="true" className="text-slate-300">·</span>
                            <h4 className="text-sm font-black text-[#0F2342]">{eq.name}</h4>
                          </div>
                          <span className="text-xs font-bold text-slate-500">{eq.department}</span>
                        </div>

                        <div className="rounded-md border border-amber-200 bg-amber-50/80 px-3.5 py-2.5 text-xs sm:text-sm font-black text-[#0F2342] leading-relaxed tabular-nums">
                          {eq.formula}
                        </div>

                        <div className="grid grid-cols-1 lg:grid-cols-3 gap-3 text-xs pt-0.5">
                          <div>
                            <div className="font-black text-slate-700 mb-0.5">شرح المتغيرات:</div>
                            <p className="text-slate-600 leading-relaxed">{eq.variables}</p>
                          </div>
                          <div>
                            <div className="font-black text-emerald-800 mb-0.5">مثال رقمي محلول:</div>
                            <p className="text-slate-700 leading-relaxed tabular-nums">{eq.workedExample}</p>
                          </div>
                          <div>
                            <div className="font-black text-slate-700 mb-0.5">ضابط الحماية والدقة:</div>
                            <p className="text-slate-600 leading-relaxed">{eq.guardRule}</p>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </article>
              ))
            )}
          </div>
        </ErrorBoundary>
      )}

      {/* TAB 4: Interactive Canvas Video Player */}
      {activeGuideTab === 'video' && (
        <section className="bg-white rounded-xl border border-slate-200 overflow-hidden" data-testid="manual-video-section">
          <div className="border-b border-slate-200 bg-slate-50 px-5 py-4 flex flex-wrap items-center justify-between gap-3">
            <div className="text-start">
              <h2 className="text-base font-black text-[#0F2342]">
                الشرح التفاعلي المصور (4 فصول تدريبية)
              </h2>
              <p className="text-xs text-slate-600">
                اختر أي فصل تدريبي لمشاهدة خطوات التشغيل الفعلية وتطبيق المعادلات والتقارير
              </p>
            </div>

            <div className="flex items-center gap-2">
              <Button
                variant="primary"
                size="sm"
                onClick={() => setIsPlaying((p) => !p)}
                className="bg-[#0D9488] hover:bg-[#0F766E] text-white"
              >
                {isPlaying ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
                <span>{isPlaying ? 'إيقاف مؤقت' : 'تشغيل الشرح'}</span>
              </Button>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => {
                  setElapsedSec(0);
                  setIsPlaying(true);
                }}
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>إعادة</span>
              </Button>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => setPlaybackSpeed((s) => (s === 1 ? 1.5 : 1))}
              >
                <span className="tabular-nums">السرعة {playbackSpeed}x</span>
              </Button>
            </div>
          </div>

          <div className="p-5 grid grid-cols-1 xl:grid-cols-12 gap-5 items-start">
            <div className="xl:col-span-8 space-y-3">
              <div className="rounded-lg overflow-hidden border border-slate-800 bg-slate-950">
                <canvas
                  ref={canvasRef}
                  width={1120}
                  height={500}
                  onClick={() => setIsPlaying((p) => !p)}
                  className="w-full h-auto block cursor-pointer"
                />
              </div>

              <div className="bg-slate-50 border border-slate-200 rounded-lg p-3.5 space-y-2.5">
                <div className="flex items-center justify-between text-xs font-bold text-slate-700">
                  <span>
                    الفصل {currentChapter.number} — {currentChapter.title}
                  </span>
                  <span className="tabular-nums text-slate-500">
                    {Math.floor(elapsedSec)} ثانية / {currentChapter.durationSec} ثانية
                  </span>
                </div>
                <input
                  type="range"
                  aria-label="شريط التقدم الزمني للفصل"
                  min={0}
                  max={currentChapter.durationSec}
                  step={0.2}
                  value={elapsedSec}
                  onChange={(e) => setElapsedSec(Number(e.target.value))}
                  className="w-full accent-[#0D9488] cursor-pointer"
                />
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                  {currentChapter.metricsPreview.map((m, i) => (
                    <div
                      key={i}
                      className="bg-white border border-slate-200 rounded-md px-3 py-2 flex items-center justify-between text-xs"
                    >
                      <span className="font-bold text-slate-500">{m.label}:</span>
                      <span className="font-black text-[#0F2342]">{m.value}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div className="xl:col-span-4 space-y-2.5">
              {VIDEO_CHAPTERS.map((ch, idx) => {
                const isSelected = idx === selectedChapterIdx;
                return (
                  <button
                    key={ch.id}
                    type="button"
                    onClick={() => {
                      setSelectedChapterIdx(idx);
                      setElapsedSec(0);
                      setIsPlaying(true);
                    }}
                    className={`w-full text-start p-3.5 rounded-lg border transition cursor-pointer ${
                      isSelected
                        ? 'bg-[#0F2342] text-white border-[#0F2342]'
                        : 'bg-white hover:bg-slate-50 text-slate-800 border-slate-200'
                    }`}
                  >
                    <div className="flex items-center justify-between text-xs font-black">
                      <span>{ch.title}</span>
                      <span className="tabular-nums opacity-75">{ch.number}</span>
                    </div>
                    <p className={`text-xs mt-1 leading-relaxed ${isSelected ? 'text-slate-300' : 'text-slate-500'}`}>
                      {ch.summary}
                    </p>
                  </button>
                );
              })}
            </div>
          </div>
        </section>
      )}

      {/* Quick Direct Navigation Footer Strip */}
      <section className="bg-white rounded-xl border border-slate-200 p-4 flex flex-wrap items-center justify-between gap-3">
        <div className="text-xs font-bold text-slate-600 flex flex-wrap items-center gap-2">
          <BookOpen className="w-4 h-4 text-[#0D9488]" />
          <span>انتقال سريع للتطبيق العملي:</span>
          <span className="tabular-nums text-slate-500">
            ({bakeriesCount} مخبز · {debtsCount} مديونية · {villagesCount} قرية)
          </span>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button variant="secondary" size="sm" onClick={() => onNavigateTab('bakeries')}>
            <span>سجل المخابز</span>
            <ArrowLeft className="w-3.5 h-3.5" />
          </Button>
          <Button variant="secondary" size="sm" onClick={() => onNavigateTab('debts')}>
            <span>سجل المديونيات</span>
            <ArrowLeft className="w-3.5 h-3.5" />
          </Button>
          <Button variant="secondary" size="sm" onClick={() => onNavigateTab('reports')}>
            <span>مركز التقارير</span>
            <ArrowLeft className="w-3.5 h-3.5" />
          </Button>
          {onOpenModal && (
            <Button variant="secondary" size="sm" onClick={() => onOpenModal('backup-sync')}>
              <RefreshCw className="w-3.5 h-3.5 text-[#0D9488]" />
              <span>النسخ الاحتياطي والمزامنة</span>
            </Button>
          )}
        </div>
      </section>
    </div>
  );
};
