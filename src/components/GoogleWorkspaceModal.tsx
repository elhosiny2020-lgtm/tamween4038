import React, { useState, useEffect, useMemo } from 'react';
import { Bakery, DebtRecord, DailyBakeryTask } from '../types';
import {
  initGoogleAuthListener,
  getCachedGoogleAccessToken,
  signInWithGoogleWorkspace,
  signOutGoogleWorkspace,
  fetchGoogleCalendarEvents,
  createGoogleCalendarEvent,
  updateGoogleCalendarEvent,
  deleteGoogleCalendarEvent,
  GoogleCalendarEventItem,
  fetchGoogleTaskLists,
  fetchGoogleTasks,
  createGoogleTask,
  updateGoogleTask,
  deleteGoogleTask,
  GoogleTaskListItem,
  GoogleTaskItem,
  listGoogleFormsFromDrive,
  getGoogleFormDetails,
  getGoogleFormResponses,
  createBakeryInspectionGoogleForm,
  GoogleFormDriveFile,
  GoogleFormDetails,
  GoogleFormResponseItem,
} from '../lib/firebase';
import {
  X,
  Calendar,
  CheckSquare,
  FileText,
  RefreshCw,
  Plus,
  Trash2,
  Edit2,
  ExternalLink,
  CheckCircle2,
  AlertTriangle,
  LogOut,
  ShieldCheck,
  Sparkles,
  Eye,
} from 'lucide-react';

interface GoogleWorkspaceModalProps {
  isOpen: boolean;
  onClose: () => void;
  bakeries: Bakery[];
  debts: DebtRecord[];
  dailyTasks: DailyBakeryTask[];
  initialTab?: 'calendar' | 'tasks' | 'forms';
}

interface PendingConfirmation {
  title: string;
  description: string;
  itemsPreview?: string[];
  confirmLabel: string;
  isDanger?: boolean;
  onConfirm: () => Promise<void>;
}

export const GoogleWorkspaceModal: React.FC<GoogleWorkspaceModalProps> = ({
  isOpen,
  onClose,
  bakeries,
  debts,
  dailyTasks,
  initialTab = 'calendar',
}) => {
  const [activeTab, setActiveTab] = useState<'calendar' | 'tasks' | 'forms'>(initialTab);
  const [needsAuth, setNeedsAuth] = useState<boolean>(() => !getCachedGoogleAccessToken());
  const [userEmail, setUserEmail] = useState<string>('');
  const [isLoggingIn, setIsLoggingIn] = useState<boolean>(false);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [statusBanner, setStatusBanner] = useState<{
    type: 'success' | 'error' | 'info';
    text: string;
  } | null>(null);

  // Mandatory Confirmation Dialog State for any mutating/destructive Workspace API call
  const [pendingConfirmation, setPendingConfirmation] = useState<PendingConfirmation | null>(null);
  const [isExecutingConfirm, setIsExecutingConfirm] = useState<boolean>(false);

  // --- Google Calendar State ---
  const [calendarEvents, setCalendarEvents] = useState<GoogleCalendarEventItem[]>([]);
  const [selectedBakeryIdForCal, setSelectedBakeryIdForCal] = useState<string>('ALL');
  const [eventSummary, setEventSummary] = useState<string>('');
  const [eventDate, setEventDate] = useState<string>(() => new Date().toISOString().split('T')[0]);
  const [eventDescription, setEventDescription] = useState<string>('');
  const [editingEventId, setEditingEventId] = useState<string | null>(null);

  // --- Google Tasks State ---
  const [taskLists, setTaskLists] = useState<GoogleTaskListItem[]>([]);
  const [selectedTaskListId, setSelectedTaskListId] = useState<string>('@default');
  const [googleTasks, setGoogleTasks] = useState<GoogleTaskItem[]>([]);
  const [selectedBakeryIdForTask, setSelectedBakeryIdForTask] = useState<string>('ALL');
  const [newTaskTitle, setNewTaskTitle] = useState<string>('');
  const [newTaskNotes, setNewTaskNotes] = useState<string>('');
  const [newTaskDue, setNewTaskDue] = useState<string>(() => new Date().toISOString().split('T')[0]);

  // --- Google Forms State ---
  const [driveForms, setDriveForms] = useState<GoogleFormDriveFile[]>([]);
  const [selectedFormId, setSelectedFormId] = useState<string>('');
  const [manualFormIdInput, setManualFormIdInput] = useState<string>('');
  const [activeFormDetails, setActiveFormDetails] = useState<GoogleFormDetails | null>(null);
  const [activeFormResponses, setActiveFormResponses] = useState<GoogleFormResponseItem[]>([]);
  const [newFormTitle, setNewFormTitle] = useState<string>(
    'نموذج تفتيش ومتابعة مخبز تمويني - مركز المحلة الكبرى'
  );
  const [newFormDescription, setNewFormDescription] = useState<string>(
    'نموذج رسمي لمتابعة تشغيل المخابز البلدية والحصص التموينية والمديونيات بإدارة تموين مركز المحلة الكبرى'
  );

  useEffect(() => {
    if (isOpen && initialTab) {
      setActiveTab(initialTab);
    }
  }, [isOpen, initialTab]);

  useEffect(() => {
    const unsubscribe = initGoogleAuthListener((user) => {
      const token = getCachedGoogleAccessToken();
      if (user && token) {
        setUserEmail(user.email || '');
        setNeedsAuth(false);
      } else {
        setUserEmail(user?.email || '');
        setNeedsAuth(true);
      }
    });
    return () => unsubscribe();
  }, []);

  // Load current tab data when authenticated
  const loadActiveTabData = async (tab = activeTab) => {
    const token = getCachedGoogleAccessToken();
    if (!token) {
      setNeedsAuth(true);
      return;
    }
    setIsLoading(true);
    setStatusBanner(null);
    try {
      if (tab === 'calendar') {
        const events = await fetchGoogleCalendarEvents(40);
        setCalendarEvents(events);
      } else if (tab === 'tasks') {
        const lists = await fetchGoogleTaskLists();
        setTaskLists(lists);
        const listId =
          selectedTaskListId === '@default' && lists.length > 0 ? lists[0].id : selectedTaskListId;
        const items = await fetchGoogleTasks(listId);
        setGoogleTasks(items);
      } else if (tab === 'forms') {
        const forms = await listGoogleFormsFromDrive();
        setDriveForms(forms);
        if (forms.length > 0 && !selectedFormId) {
          await handleInspectForm(forms[0].id);
        }
      }
    } catch (err: any) {
      const msg = err?.message || 'حدث خطأ أثناء الاتصال بخدمات Google Workspace';
      setStatusBanner({ type: 'error', text: msg });
      if (msg.includes('401') || msg.includes('انتهت صلاحية')) {
        setNeedsAuth(true);
      }
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen && !needsAuth) {
      loadActiveTabData(activeTab);
    }
  }, [isOpen, activeTab, needsAuth]);

  // Helper to match a bakery from text (so the 4 core columns are always populated in tables)
  const resolveBakeryColumns = (text: string) => {
    const clean = (text || '').trim();
    const matched = bakeries.find(
      (b) =>
        clean.includes(b.bakeryOwnerName) ||
        (b.machineNumber && clean.includes(b.machineNumber))
    );
    if (matched) {
      return {
        bakeryOwnerName: matched.bakeryOwnerName,
        machineNumber: matched.machineNumber,
        village: matched.village,
        localUnit: matched.localUnit,
      };
    }
    return {
      bakeryOwnerName: 'عام لجميع المخابز',
      machineNumber: '-',
      village: 'مركز المحلة الكبرى',
      localUnit: 'إدارة التموين',
    };
  };

  // Bakeries with expiring/expired licenses or high debts (>20,000 EGP) for smart Calendar sync
  const highDebtBakeries = useMemo(() => {
    const map = new Map<string, { bakery: Bakery; totalDebt: number }>();
    debts.forEach((d) => {
      const rem = Number(d.netRemainingDebt) || 0;
      if (rem <= 0) return;
      const b = bakeries.find((x) => x.id === d.bakeryId);
      if (!b) return;
      const prev = map.get(b.id)?.totalDebt || 0;
      map.set(b.id, { bakery: b, totalDebt: prev + rem });
    });
    return Array.from(map.values()).filter((x) => x.totalDebt > 20000);
  }, [bakeries, debts]);

  if (!isOpen) return null;

  const handleGoogleSignIn = async () => {
    setIsLoggingIn(true);
    setStatusBanner(null);
    try {
      const res = await signInWithGoogleWorkspace();
      if (res.accessToken) {
        setUserEmail(res.email);
        setNeedsAuth(false);
        setStatusBanner({
          type: 'success',
          text: `تم ربط حساب Google Workspace (${res.email}) بنجاح مع التقويم والمهام والنماذج!`,
        });
      }
    } catch (err: any) {
      setStatusBanner({
        type: 'error',
        text: err?.message || 'تعذر تسجيل الدخول باستخدام حساب Google',
      });
    } finally {
      setIsLoggingIn(false);
    }
  };

  const handleGoogleSignOut = async () => {
    await signOutGoogleWorkspace();
    setNeedsAuth(true);
    setUserEmail('');
    setCalendarEvents([]);
    setGoogleTasks([]);
    setDriveForms([]);
    setActiveFormDetails(null);
    setActiveFormResponses([]);
  };

  // --- Calendar Handlers ---
  const handleSaveCalendarEvent = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!eventSummary.trim()) return;

    const matchedBakery = bakeries.find((b) => b.id === selectedBakeryIdForCal);
    const fullSummary = matchedBakery
      ? `${eventSummary.trim()} — مخبز: ${matchedBakery.bakeryOwnerName} (ماكينة ${matchedBakery.machineNumber})`
      : eventSummary.trim();
    const fullLocation = matchedBakery
      ? `قرية ${matchedBakery.village} - وحدة ${matchedBakery.localUnit}`
      : 'إدارة تموين مركز المحلة الكبرى';
    const fullDesc = matchedBakery
      ? `اسم المخبز: ${matchedBakery.bakeryOwnerName}\nرقم الماكينة: ${matchedBakery.machineNumber}\nالقرية: ${matchedBakery.village}\nالوحدة المحلية: ${matchedBakery.localUnit}\n${eventDescription.trim()}`
      : eventDescription.trim();

    if (editingEventId) {
      // Updating existing event requires explicit user confirmation
      const targetId = editingEventId;
      setPendingConfirmation({
        title: 'تأكيد تعديل موعد في تقويم Google Calendar',
        description: `هل أنت متأكد من تعديل بيانات الموعد "${fullSummary}" بتاريخ (${eventDate}) في تقويم Google الخاص بك؟`,
        confirmLabel: 'تأكيد التعديل في التقويم',
        onConfirm: async () => {
          await updateGoogleCalendarEvent(targetId, {
            summary: fullSummary,
            description: fullDesc,
            location: fullLocation,
            startDate: eventDate,
            endDate: eventDate,
          });
          setEditingEventId(null);
          setEventSummary('');
          setEventDescription('');
          await loadActiveTabData('calendar');
          setStatusBanner({ type: 'success', text: 'تم تحديث الموعد في Google Calendar بنجاح!' });
        },
      });
      return;
    }

    setIsLoading(true);
    try {
      await createGoogleCalendarEvent({
        summary: fullSummary,
        description: fullDesc,
        location: fullLocation,
        startDate: eventDate,
        endDate: eventDate,
      });
      setEventSummary('');
      setEventDescription('');
      await loadActiveTabData('calendar');
      setStatusBanner({ type: 'success', text: 'تمت إضافة الموعد إلى Google Calendar بنجاح!' });
    } catch (err: any) {
      setStatusBanner({ type: 'error', text: err?.message || 'تعذر إنشاء الحدث' });
    } finally {
      setIsLoading(false);
    }
  };

  const handleRequestDeleteEvent = (ev: GoogleCalendarEventItem) => {
    setPendingConfirmation({
      title: 'تأكيد حذف موعد من Google Calendar',
      description: `هل أنت متأكد من حذف الموعد "${ev.summary}" نهائياً من تقويم Google Calendar؟ لا يمكن التراجع عن هذا الإجراء.`,
      confirmLabel: 'نعم، حذف الموعد نهائياً',
      isDanger: true,
      onConfirm: async () => {
        await deleteGoogleCalendarEvent(ev.id);
        await loadActiveTabData('calendar');
        setStatusBanner({ type: 'success', text: `تم حذف الموعد (${ev.summary}) من تقويم جوجل.` });
      },
    });
  };

  const handleSyncHighDebtsToCalendar = () => {
    if (highDebtBakeries.length === 0) {
      setStatusBanner({
        type: 'info',
        text: 'لا توجد حالياً مخابز تتجاوز مديونيتها 20,000 ج.م لجدولتها.',
      });
      return;
    }
    const itemsToCreate = highDebtBakeries.slice(0, 10);
    const nextWeekDate = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
      .toISOString()
      .split('T')[0];

    setPendingConfirmation({
      title: 'تأكيد مزامنة مواعيد تحصيل الدفعات الأسبوعية إلى Google Calendar',
      description: `سيتم إضافة (${itemsToCreate.length}) موعد استحقاق دفعة أسبوعية للمخابز التي تتجاوز مديونيتها 20,000 ج.م في تقويم Google بتاريخ (${nextWeekDate}):`,
      itemsPreview: itemsToCreate.map(
        (x) =>
          `${x.bakery.bakeryOwnerName} (ماكينة ${x.bakery.machineNumber} - ${x.bakery.village}) — المتبقي: ${x.totalDebt.toLocaleString()} ج.م`
      ),
      confirmLabel: `تأكيد إضافة (${itemsToCreate.length}) مواعيد للتقويم`,
      onConfirm: async () => {
        for (const item of itemsToCreate) {
          const b = item.bakery;
          await createGoogleCalendarEvent({
            summary: `تحصيل دفعة مديونية أسبوعية — مخبز: ${b.bakeryOwnerName} (ماكينة ${b.machineNumber})`,
            location: `قرية ${b.village} - وحدة ${b.localUnit}`,
            description: `اسم المخبز: ${b.bakeryOwnerName}\nرقم الماكينة: ${b.machineNumber}\nالقرية: ${b.village}\nالوحدة المحلية: ${b.localUnit}\nصافي المديونية المتبقية: ${item.totalDebt.toLocaleString()} ج.م`,
            startDate: nextWeekDate,
            endDate: nextWeekDate,
          });
        }
        await loadActiveTabData('calendar');
        setStatusBanner({
          type: 'success',
          text: `تمت مزامنة وإضافة (${itemsToCreate.length}) مواعيد تحصيل دفعات أسبوعية إلى Google Calendar بنجاح!`,
        });
      },
    });
  };

  // --- Tasks Handlers ---
  const handleCreateGoogleTask = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTaskTitle.trim()) return;

    const matchedBakery = bakeries.find((b) => b.id === selectedBakeryIdForTask);
    const fullTitle = matchedBakery
      ? `${newTaskTitle.trim()} — مخبز: ${matchedBakery.bakeryOwnerName} (ماكينة ${matchedBakery.machineNumber})`
      : newTaskTitle.trim();
    const fullNotes = matchedBakery
      ? `القرية: ${matchedBakery.village} | الوحدة المحلية: ${matchedBakery.localUnit}${
          newTaskNotes.trim() ? ` | ملاحظات: ${newTaskNotes.trim()}` : ''
        }`
      : newTaskNotes.trim();

    setIsLoading(true);
    try {
      await createGoogleTask(selectedTaskListId, {
        title: fullTitle,
        notes: fullNotes,
        due: newTaskDue,
      });
      setNewTaskTitle('');
      setNewTaskNotes('');
      await loadActiveTabData('tasks');
      setStatusBanner({ type: 'success', text: 'تمت إضافة المهمة إلى Google Tasks بنجاح!' });
    } catch (err: any) {
      setStatusBanner({ type: 'error', text: err?.message || 'تعذر إنشاء المهمة' });
    } finally {
      setIsLoading(false);
    }
  };

  const handleRequestToggleGoogleTask = (task: GoogleTaskItem) => {
    const nextStatus = task.status === 'completed' ? 'needsAction' : 'completed';
    const statusLabel = nextStatus === 'completed' ? 'مكتملة' : 'قيد التنفيذ';

    setPendingConfirmation({
      title: 'تأكيد تحديث حالة المهمة في Google Tasks',
      description: `هل ترغب في تغيير حالة المهمة "${task.title}" في Google Tasks إلى (${statusLabel})؟`,
      confirmLabel: 'تأكيد تحديث الحالة',
      onConfirm: async () => {
        await updateGoogleTask(selectedTaskListId, task.id, {
          title: task.title,
          notes: task.notes,
          status: nextStatus,
        });
        await loadActiveTabData('tasks');
        setStatusBanner({
          type: 'success',
          text: `تم تحديث حالة المهمة (${task.title}) إلى ${statusLabel}.`,
        });
      },
    });
  };

  const handleRequestDeleteGoogleTask = (task: GoogleTaskItem) => {
    setPendingConfirmation({
      title: 'تأكيد حذف مهمة من Google Tasks',
      description: `هل أنت متأكد من حذف المهمة "${task.title}" نهائياً من قائمة مهام Google Tasks؟`,
      confirmLabel: 'نعم، حذف المهمة نهائياً',
      isDanger: true,
      onConfirm: async () => {
        await deleteGoogleTask(selectedTaskListId, task.id);
        await loadActiveTabData('tasks');
        setStatusBanner({ type: 'success', text: `تم حذف المهمة (${task.title}) بنجاح.` });
      },
    });
  };

  const handleSyncLocalDailyTasksToGoogle = () => {
    const pendingLocal = dailyTasks.filter((t) => t.status !== 'completed');
    if (pendingLocal.length === 0) {
      setStatusBanner({
        type: 'info',
        text: 'لا توجد مهام محلية غير مكتملة حالياً لمزامنتها إلى Google Tasks.',
      });
      return;
    }

    setPendingConfirmation({
      title: 'تأكيد مزامنة المهام اليومية للمخابز مع Google Tasks',
      description: `سيتم إرسال (${pendingLocal.length}) مهام رقابية وإدارية من المنظومة إلى قائمة مهام Google Tasks الخاصة بك:`,
      itemsPreview: pendingLocal.map(
        (t) => `${t.title} — (${t.bakeryName || 'عام لجميع المخابز'} - ${t.village || ''})`
      ),
      confirmLabel: `تأكيد إرسال (${pendingLocal.length}) مهام إلى Google Tasks`,
      onConfirm: async () => {
        for (const t of pendingLocal) {
          await createGoogleTask(selectedTaskListId, {
            title: `${t.title} — ${t.bakeryName || 'عام لجميع المخابز'}`,
            notes: `القرية: ${t.village || 'مركز المحلة'} | المسؤول: ${t.assignedTo || 'مفتش التموين'} | ${
              t.description || ''
            }`,
            due: t.dueDate,
          });
        }
        await loadActiveTabData('tasks');
        setStatusBanner({
          type: 'success',
          text: `تمت مزامنة (${pendingLocal.length}) مهام تموينية إلى Google Tasks بنجاح!`,
        });
      },
    });
  };

  // --- Forms Handlers ---
  const handleInspectForm = async (formIdToLoad: string) => {
    const cleanId = formIdToLoad.trim();
    if (!cleanId) return;
    setSelectedFormId(cleanId);
    setIsLoading(true);
    setStatusBanner(null);
    try {
      const [details, responses] = await Promise.all([
        getGoogleFormDetails(cleanId),
        getGoogleFormResponses(cleanId),
      ]);
      setActiveFormDetails(details);
      setActiveFormResponses(responses);
    } catch (err: any) {
      setStatusBanner({
        type: 'error',
        text: err?.message || 'تعذر قراءة تفاصيل أو ردود النموذج من Google Forms',
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleRequestCreateInspectionForm = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newFormTitle.trim()) return;

    setPendingConfirmation({
      title: 'تأكيد إنشاء وتجهيز نموذج تفتيش تمويني في Google Forms',
      description: `سيتم إنشاء نموذج Google Form جديد بعنوان "${newFormTitle.trim()}" وإضافة حقول بيانات المخبز الأساسية (اسم المخبز، رقم الماكينة، القرية، الوحدة المحلية، وملاحظات التفتيش):`,
      confirmLabel: 'تأكيد إنشاء النموذج الآن',
      onConfirm: async () => {
        const created = await createBakeryInspectionGoogleForm(
          newFormTitle,
          newFormDescription
        );
        const forms = await listGoogleFormsFromDrive();
        setDriveForms(forms);
        await handleInspectForm(created.formId);
        setStatusBanner({
          type: 'success',
          text: `تم إنشاء نموذج Google Form (${created.info.title}) بنجاح!`,
        });
      },
    });
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 bg-slate-950/80 backdrop-blur-xs overflow-y-auto"
      dir="rtl"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className="bg-white rounded-3xl shadow-2xl border-2 border-[#1E3A8A] w-full max-w-6xl max-h-[94vh] flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Top ERP Header */}
        <div className="bg-gradient-to-l from-[#071124] via-[#0F2342] to-[#1E3A8A] text-white px-6 py-4 flex flex-wrap items-center justify-between gap-3 shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-2xl bg-amber-400/20 border border-amber-300/50 flex items-center justify-center">
              <Sparkles className="w-6 h-6 text-amber-300" />
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="text-base sm:text-lg font-black text-white">
                  مركز تكامل خدمات Google Workspace الرسمي (Calendar • Tasks • Forms)
                </h2>
                <span className="px-2.5 py-0.5 rounded-full text-[11px] font-black bg-amber-400 text-slate-950">
                  مربوط بقاعدة بيانات المخابز والمديونيات
                </span>
              </div>
              <p className="text-xs text-blue-100 mt-0.5 font-bold">
                مزامنة مواعيد التراخيص والدفعات الأسبوعية على Google Calendar، إدارة مهام التفتيش على Google Tasks، وإنشاء وقراءة نماذج Google Forms
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {!needsAuth && userEmail && (
              <div className="flex items-center gap-2 bg-white/10 border border-white/20 px-3 py-1.5 rounded-xl text-xs">
                <ShieldCheck className="w-4 h-4 text-emerald-300" />
                <span className="font-mono font-bold text-emerald-200">{userEmail}</span>
                <button
                  type="button"
                  onClick={handleGoogleSignOut}
                  className="text-rose-300 hover:text-white font-black flex items-center gap-1 mr-1 cursor-pointer"
                  title="تسجيل الخروج من Google Workspace"
                >
                  <LogOut className="w-3.5 h-3.5" />
                  <span>خروج</span>
                </button>
              </div>
            )}
            <button
              type="button"
              onClick={onClose}
              className="px-3.5 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 text-white font-black text-xs flex items-center gap-1.5 cursor-pointer transition"
            >
              <X className="w-4 h-4" />
              <span>إغلاق</span>
            </button>
          </div>
        </div>

        {/* Navigation Tabs */}
        <div className="bg-slate-100 border-b border-slate-200 px-6 py-2.5 flex flex-wrap items-center justify-between gap-2 shrink-0">
          <div className="flex items-center gap-2 flex-wrap">
            <button
              type="button"
              onClick={() => setActiveTab('calendar')}
              className={`px-4 py-2 rounded-xl text-xs font-black flex items-center gap-2 transition cursor-pointer ${
                activeTab === 'calendar'
                  ? 'bg-[#0F2342] text-amber-300 shadow-sm'
                  : 'bg-white text-slate-700 hover:bg-slate-200/70 border border-slate-300'
              }`}
            >
              <Calendar className="w-4 h-4" />
              <span>1. تقويم جوجل (Google Calendar)</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('tasks')}
              className={`px-4 py-2 rounded-xl text-xs font-black flex items-center gap-2 transition cursor-pointer ${
                activeTab === 'tasks'
                  ? 'bg-[#0F2342] text-amber-300 shadow-sm'
                  : 'bg-white text-slate-700 hover:bg-slate-200/70 border border-slate-300'
              }`}
            >
              <CheckSquare className="w-4 h-4" />
              <span>2. مهام جوجل (Google Tasks)</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('forms')}
              className={`px-4 py-2 rounded-xl text-xs font-black flex items-center gap-2 transition cursor-pointer ${
                activeTab === 'forms'
                  ? 'bg-[#0F2342] text-amber-300 shadow-sm'
                  : 'bg-white text-slate-700 hover:bg-slate-200/70 border border-slate-300'
              }`}
            >
              <FileText className="w-4 h-4" />
              <span>3. نماذج جوجل (Google Forms)</span>
            </button>
          </div>

          {!needsAuth && (
            <button
              type="button"
              onClick={() => loadActiveTabData(activeTab)}
              disabled={isLoading}
              className="px-3.5 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-xs font-black flex items-center gap-1.5 cursor-pointer transition"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
              <span>تحديث البيانات من Google</span>
            </button>
          )}
        </div>

        {/* Status Banner */}
        {statusBanner && (
          <div
            className={`px-6 py-2.5 text-xs font-black flex items-center justify-between border-b shrink-0 ${
              statusBanner.type === 'success'
                ? 'bg-emerald-50 text-emerald-900 border-emerald-200'
                : statusBanner.type === 'error'
                ? 'bg-rose-50 text-rose-900 border-rose-200'
                : 'bg-blue-50 text-blue-900 border-blue-200'
            }`}
          >
            <div className="flex items-center gap-2">
              {statusBanner.type === 'success' ? (
                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
              ) : (
                <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
              )}
              <span>{statusBanner.text}</span>
            </div>
            <button
              type="button"
              onClick={() => setStatusBanner(null)}
              className="text-slate-500 hover:text-slate-800 cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        )}

        {/* Main Body */}
        <div className="flex-1 overflow-y-auto p-5 bg-[#F8FAFC] space-y-5">
          {needsAuth ? (
            /* Official Sign in with Google Prompt when token is unavailable */
            <div className="bg-white border-2 border-slate-200 rounded-2xl p-8 text-center max-w-xl mx-auto my-6 shadow-sm space-y-5">
              <div className="w-16 h-16 rounded-2xl bg-blue-50 border border-blue-200 flex items-center justify-center mx-auto">
                <Calendar className="w-8 h-8 text-[#1E3A8A]" />
              </div>
              <div className="space-y-2">
                <h3 className="text-lg font-black text-[#0F2342]">
                  تسجيل الدخول باستخدام حساب Google Workspace
                </h3>
                <p className="text-xs text-slate-600 font-bold leading-relaxed">
                  للوصول إلى تقويم جوجل (Google Calendar)، ومهام جوجل (Google Tasks)، ونماذج جوجل (Google Forms) ومزامنتها مع بيانات المخابز والمديونيات، يرجى تسجيل الدخول بحساب Google الخاص بك.
                </p>
              </div>

              <div className="flex justify-center pt-2">
                <button
                  type="button"
                  onClick={handleGoogleSignIn}
                  disabled={isLoggingIn}
                  className="gsi-material-button inline-flex items-center gap-3 px-6 py-3 bg-white hover:bg-slate-50 text-slate-800 border-2 border-slate-300 hover:border-blue-600 rounded-xl font-black text-sm shadow-md transition cursor-pointer"
                >
                  <div className="gsi-material-button-state" />
                  <div className="gsi-material-button-content-wrapper flex items-center gap-3">
                    <div className="gsi-material-button-icon w-5 h-5">
                      <svg
                        version="1.1"
                        xmlns="http://www.w3.org/2000/svg"
                        viewBox="0 0 48 48"
                        style={{ display: 'block', width: '20px', height: '20px' }}
                      >
                        <path
                          fill="#EA4335"
                          d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"
                        />
                        <path
                          fill="#4285F4"
                          d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"
                        />
                        <path
                          fill="#FBBC05"
                          d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"
                        />
                        <path
                          fill="#34A853"
                          d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"
                        />
                        <path fill="none" d="M0 0h48v48H0z" />
                      </svg>
                    </div>
                    <span className="gsi-material-button-contents">
                      {isLoggingIn ? 'جاري الاتصال بحساب Google...' : 'Sign in with Google'}
                    </span>
                  </div>
                </button>
              </div>
            </div>
          ) : activeTab === 'calendar' ? (
            /* =================================================================
               TAB 1: GOOGLE CALENDAR
               ================================================================= */
            <div className="space-y-5">
              {/* Smart Sync & Add Event Form */}
              <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-xs space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 pb-3">
                  <h3 className="text-sm font-black text-[#0F2342] flex items-center gap-2">
                    <Calendar className="w-4 h-4 text-blue-700" />
                    <span>
                      {editingEventId
                        ? 'تعديل موعد حالي في Google Calendar'
                        : 'إضافة موعد تفتيش أو استحقاق جديد إلى Google Calendar'}
                    </span>
                  </h3>
                  <button
                    type="button"
                    onClick={handleSyncHighDebtsToCalendar}
                    className="px-3.5 py-1.5 rounded-xl bg-amber-500 hover:bg-amber-600 text-slate-950 text-xs font-black flex items-center gap-1.5 cursor-pointer transition shadow-2xs"
                  >
                    <Sparkles className="w-3.5 h-3.5" />
                    <span>
                      مزامنة مواعيد الدفعات الأسبوعية للمديونيات الكبرى ({highDebtBakeries.length})
                    </span>
                  </button>
                </div>

                <form onSubmit={handleSaveCalendarEvent} className="grid grid-cols-1 md:grid-cols-4 gap-3">
                  <div>
                    <label className="block text-xs font-black text-slate-700 mb-1">
                      المخبز المرتبط بالموعد
                    </label>
                    <select
                      value={selectedBakeryIdForCal}
                      onChange={(e) => setSelectedBakeryIdForCal(e.target.value)}
                      className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-xs font-bold text-slate-900"
                    >
                      <option value="ALL">-- موعد عام لجميع المخابز --</option>
                      {bakeries.map((b) => (
                        <option key={b.id} value={b.id}>
                          {b.bakeryOwnerName} — ماكينة {b.machineNumber} ({b.village})
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-black text-slate-700 mb-1">
                      عنوان الموعد / الحدث *
                    </label>
                    <input
                      type="text"
                      required
                      value={eventSummary}
                      onChange={(e) => setEventSummary(e.target.value)}
                      placeholder="مثال: موعد تجديد رخصة / تحصيل قسط مديونية..."
                      className="w-full px-3 py-2 bg-white border border-slate-300 rounded-xl text-xs font-bold text-slate-900"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-black text-slate-700 mb-1">
                      تاريخ الموعد *
                    </label>
                    <input
                      type="date"
                      required
                      value={eventDate}
                      onChange={(e) => setEventDate(e.target.value)}
                      className="w-full px-3 py-2 bg-white border border-slate-300 rounded-xl text-xs font-bold text-slate-900 font-mono"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-black text-slate-700 mb-1">
                      ملاحظات وتفاصيل إضافية
                    </label>
                    <div className="flex items-center gap-2">
                      <input
                        type="text"
                        value={eventDescription}
                        onChange={(e) => setEventDescription(e.target.value)}
                        placeholder="تفاصيل الموعد..."
                        className="w-full px-3 py-2 bg-white border border-slate-300 rounded-xl text-xs font-bold text-slate-900"
                      />
                      <button
                        type="submit"
                        disabled={isLoading}
                        className="px-4 py-2 bg-[#0F2342] hover:bg-[#1E3A8A] text-white rounded-xl text-xs font-black shrink-0 flex items-center gap-1 cursor-pointer"
                      >
                        <Plus className="w-4 h-4" />
                        <span>{editingEventId ? 'تحديث' : 'إضافة'}</span>
                      </button>
                      {editingEventId && (
                        <button
                          type="button"
                          onClick={() => {
                            setEditingEventId(null);
                            setEventSummary('');
                            setEventDescription('');
                          }}
                          className="px-3 py-2 bg-slate-200 hover:bg-slate-300 text-slate-800 rounded-xl text-xs font-black shrink-0 cursor-pointer"
                        >
                          إلغاء
                        </button>
                      )}
                    </div>
                  </div>
                </form>
              </div>

              {/* Calendar Events ERP Table with Mandatory 4 Bakery Columns & TOTAL SUMMARY Footer */}
              <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-xs">
                <div className="overflow-x-auto max-h-96">
                  <table className="w-full text-xs text-center border-collapse">
                    <thead className="bg-[#0F2342] text-white sticky top-0 z-10 font-black">
                      <tr>
                        <th className="py-2.5 px-2 border-l border-slate-700">م</th>
                        <th className="py-2.5 px-3 border-l border-slate-700 text-right">اسم المخبز</th>
                        <th className="py-2.5 px-2 border-l border-slate-700">رقم الماكينة</th>
                        <th className="py-2.5 px-2 border-l border-slate-700">اسم القرية</th>
                        <th className="py-2.5 px-2 border-l border-slate-700">اسم الوحدة المحلية</th>
                        <th className="py-2.5 px-3 border-l border-slate-700 text-right">عنوان الموعد في Google Calendar</th>
                        <th className="py-2.5 px-2 border-l border-slate-700">تاريخ الموعد</th>
                        <th className="py-2.5 px-2">إجراءات</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200 font-bold text-slate-800">
                      {calendarEvents.length === 0 ? (
                        <tr>
                          <td colSpan={8} className="py-8 text-center text-slate-500">
                            لا توجد مواعيد مسجلة حالياً في تقويم Google Calendar.
                          </td>
                        </tr>
                      ) : (
                        calendarEvents.map((ev, idx) => {
                          const cols = resolveBakeryColumns(
                            `${ev.summary || ''} ${ev.description || ''} ${ev.location || ''}`
                          );
                          const dateStr =
                            ev.start?.date ||
                            (ev.start?.dateTime ? ev.start.dateTime.split('T')[0] : '-');
                          return (
                            <tr
                              key={ev.id}
                              className={idx % 2 === 0 ? 'bg-white hover:bg-blue-50/40' : 'bg-slate-50/70 hover:bg-blue-50/40'}
                            >
                              <td className="py-2 px-2 border-l border-slate-200 font-mono">{idx + 1}</td>
                              <td className="py-2 px-3 border-l border-slate-200 text-right font-black text-slate-900">
                                {cols.bakeryOwnerName}
                              </td>
                              <td className="py-2 px-2 border-l border-slate-200 font-mono">
                                {cols.machineNumber}
                              </td>
                              <td className="py-2 px-2 border-l border-slate-200">{cols.village}</td>
                              <td className="py-2 px-2 border-l border-slate-200">{cols.localUnit}</td>
                              <td className="py-2 px-3 border-l border-slate-200 text-right text-[#0F2342] font-black">
                                {ev.summary}
                              </td>
                              <td className="py-2 px-2 border-l border-slate-200 font-mono" dir="ltr">
                                {dateStr}
                              </td>
                              <td className="py-2 px-2">
                                <div className="flex items-center justify-center gap-1.5">
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setEditingEventId(ev.id);
                                      setEventSummary(ev.summary || '');
                                      setEventDate(dateStr !== '-' ? dateStr : new Date().toISOString().split('T')[0]);
                                      setEventDescription(ev.description || '');
                                    }}
                                    className="p-1.5 bg-amber-50 hover:bg-amber-100 text-amber-800 border border-amber-200 rounded-lg cursor-pointer"
                                    title="تعديل الموعد"
                                  >
                                    <Edit2 className="w-3.5 h-3.5" />
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => handleRequestDeleteEvent(ev)}
                                    className="p-1.5 bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 rounded-lg cursor-pointer"
                                    title="حذف الموعد"
                                  >
                                    <Trash2 className="w-3.5 h-3.5" />
                                  </button>
                                  {ev.htmlLink && (
                                    <a
                                      href={ev.htmlLink}
                                      target="_blank"
                                      rel="noreferrer"
                                      className="p-1.5 bg-blue-50 hover:bg-blue-100 text-blue-700 border border-blue-200 rounded-lg"
                                      title="فتح في Google Calendar"
                                    >
                                      <ExternalLink className="w-3.5 h-3.5" />
                                    </a>
                                  )}
                                </div>
                              </td>
                            </tr>
                          );
                        })
                      )}
                    </tbody>
                    <tfoot className="bg-[#0F2342] text-white sticky bottom-0 font-black">
                      <tr className="total-summary-row">
                        <td colSpan={5} className="py-2.5 px-3 text-right text-amber-300 border-l border-slate-700">
                          صف الإجماليات TOTAL SUMMARY
                        </td>
                        <td colSpan={3} className="py-2.5 px-3 text-center text-sky-200">
                          إجمالي المواعيد المسجلة في Google Calendar: {calendarEvents.length} موعد
                        </td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </div>
            </div>
          ) : activeTab === 'tasks' ? (
            /* =================================================================
               TAB 2: GOOGLE TASKS
               ================================================================= */
            <div className="space-y-5">
              <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-xs space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 pb-3">
                  <div className="flex items-center gap-3 flex-wrap">
                    <h3 className="text-sm font-black text-[#0F2342] flex items-center gap-2">
                      <CheckSquare className="w-4 h-4 text-emerald-700" />
                      <span>إدارة ومزامنة المهام الرقابية على Google Tasks</span>
                    </h3>
                    {taskLists.length > 0 && (
                      <select
                        value={selectedTaskListId}
                        onChange={(e) => {
                          setSelectedTaskListId(e.target.value);
                          fetchGoogleTasks(e.target.value).then(setGoogleTasks).catch(() => {});
                        }}
                        className="px-3 py-1 bg-slate-100 border border-slate-300 rounded-xl text-xs font-black text-[#0F2342]"
                      >
                        {taskLists.map((tl) => (
                          <option key={tl.id} value={tl.id}>
                            قائمة: {tl.title}
                          </option>
                        ))}
                      </select>
                    )}
                  </div>

                  <button
                    type="button"
                    onClick={handleSyncLocalDailyTasksToGoogle}
                    className="px-3.5 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-black flex items-center gap-1.5 cursor-pointer transition shadow-2xs"
                  >
                    <Sparkles className="w-3.5 h-3.5" />
                    <span>
                      مزامنة المهام اليومية للمخابز ({dailyTasks.filter((t) => t.status !== 'completed').length}) إلى Google Tasks
                    </span>
                  </button>
                </div>

                <form onSubmit={handleCreateGoogleTask} className="grid grid-cols-1 md:grid-cols-4 gap-3">
                  <div>
                    <label className="block text-xs font-black text-slate-700 mb-1">
                      المخبز المرتبط بالمهمة
                    </label>
                    <select
                      value={selectedBakeryIdForTask}
                      onChange={(e) => setSelectedBakeryIdForTask(e.target.value)}
                      className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-xs font-bold text-slate-900"
                    >
                      <option value="ALL">-- مهمة عامة لجميع المخابز --</option>
                      {bakeries.map((b) => (
                        <option key={b.id} value={b.id}>
                          {b.bakeryOwnerName} — ماكينة {b.machineNumber} ({b.village})
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-black text-slate-700 mb-1">
                      عنوان المهمة في Google Tasks *
                    </label>
                    <input
                      type="text"
                      required
                      value={newTaskTitle}
                      onChange={(e) => setNewTaskTitle(e.target.value)}
                      placeholder="مثال: مراجعة حصة الدقيق / مطابقة الرخصة..."
                      className="w-full px-3 py-2 bg-white border border-slate-300 rounded-xl text-xs font-bold text-slate-900"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-black text-slate-700 mb-1">
                      تاريخ الاستحقاق
                    </label>
                    <input
                      type="date"
                      value={newTaskDue}
                      onChange={(e) => setNewTaskDue(e.target.value)}
                      className="w-full px-3 py-2 bg-white border border-slate-300 rounded-xl text-xs font-bold text-slate-900 font-mono"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-black text-slate-700 mb-1">
                      ملاحظات المهمة
                    </label>
                    <div className="flex items-center gap-2">
                      <input
                        type="text"
                        value={newTaskNotes}
                        onChange={(e) => setNewTaskNotes(e.target.value)}
                        placeholder="تفاصيل المتابعة..."
                        className="w-full px-3 py-2 bg-white border border-slate-300 rounded-xl text-xs font-bold text-slate-900"
                      />
                      <button
                        type="submit"
                        disabled={isLoading}
                        className="px-4 py-2 bg-[#0F2342] hover:bg-[#1E3A8A] text-white rounded-xl text-xs font-black shrink-0 flex items-center gap-1 cursor-pointer"
                      >
                        <Plus className="w-4 h-4" />
                        <span>إضافة</span>
                      </button>
                    </div>
                  </div>
                </form>
              </div>

              {/* Google Tasks ERP Table with Mandatory 4 Bakery Columns & TOTAL SUMMARY Footer */}
              <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-xs">
                <div className="overflow-x-auto max-h-96">
                  <table className="w-full text-xs text-center border-collapse">
                    <thead className="bg-[#0F2342] text-white sticky top-0 z-10 font-black">
                      <tr>
                        <th className="py-2.5 px-2 border-l border-slate-700">م</th>
                        <th className="py-2.5 px-3 border-l border-slate-700 text-right">اسم المخبز</th>
                        <th className="py-2.5 px-2 border-l border-slate-700">رقم الماكينة</th>
                        <th className="py-2.5 px-2 border-l border-slate-700">اسم القرية</th>
                        <th className="py-2.5 px-2 border-l border-slate-700">اسم الوحدة المحلية</th>
                        <th className="py-2.5 px-3 border-l border-slate-700 text-right">عنوان المهمة في Google Tasks</th>
                        <th className="py-2.5 px-2 border-l border-slate-700">الحالة</th>
                        <th className="py-2.5 px-2">إجراءات</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200 font-bold text-slate-800">
                      {googleTasks.length === 0 ? (
                        <tr>
                          <td colSpan={8} className="py-8 text-center text-slate-500">
                            لا توجد مهام مسجلة حالياً في هذه القائمة على Google Tasks.
                          </td>
                        </tr>
                      ) : (
                        googleTasks.map((t, idx) => {
                          const cols = resolveBakeryColumns(`${t.title || ''} ${t.notes || ''}`);
                          const isDone = t.status === 'completed';
                          return (
                            <tr
                              key={t.id}
                              className={idx % 2 === 0 ? 'bg-white hover:bg-blue-50/40' : 'bg-slate-50/70 hover:bg-blue-50/40'}
                            >
                              <td className="py-2 px-2 border-l border-slate-200 font-mono">{idx + 1}</td>
                              <td className="py-2 px-3 border-l border-slate-200 text-right font-black text-slate-900">
                                {cols.bakeryOwnerName}
                              </td>
                              <td className="py-2 px-2 border-l border-slate-200 font-mono">
                                {cols.machineNumber}
                              </td>
                              <td className="py-2 px-2 border-l border-slate-200">{cols.village}</td>
                              <td className="py-2 px-2 border-l border-slate-200">{cols.localUnit}</td>
                              <td
                                className={`py-2 px-3 border-l border-slate-200 text-right font-black ${
                                  isDone ? 'line-through text-slate-400' : 'text-[#0F2342]'
                                }`}
                              >
                                <div>{t.title}</div>
                                {t.notes && (
                                  <div className="text-[10px] text-slate-500 font-semibold mt-0.5">
                                    {t.notes}
                                  </div>
                                )}
                              </td>
                              <td className="py-2 px-2 border-l border-slate-200">
                                <button
                                  type="button"
                                  onClick={() => handleRequestToggleGoogleTask(t)}
                                  className={`px-2.5 py-0.5 rounded-full text-[11px] font-black cursor-pointer ${
                                    isDone
                                      ? 'bg-emerald-100 text-emerald-800 border border-emerald-300'
                                      : 'bg-amber-100 text-amber-900 border border-amber-300'
                                  }`}
                                >
                                  {isDone ? 'مكتملة ✅' : 'قيد التنفيذ ⏳'}
                                </button>
                              </td>
                              <td className="py-2 px-2">
                                <button
                                  type="button"
                                  onClick={() => handleRequestDeleteGoogleTask(t)}
                                  className="p-1.5 bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 rounded-lg cursor-pointer"
                                  title="حذف المهمة"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              </td>
                            </tr>
                          );
                        })
                      )}
                    </tbody>
                    <tfoot className="bg-[#0F2342] text-white sticky bottom-0 font-black">
                      <tr className="total-summary-row">
                        <td colSpan={5} className="py-2.5 px-3 text-right text-amber-300 border-l border-slate-700">
                          صف الإجماليات TOTAL SUMMARY
                        </td>
                        <td colSpan={3} className="py-2.5 px-3 text-center text-sky-200">
                          إجمالي المهام: {googleTasks.length} | مكتملة:{' '}
                          {googleTasks.filter((t) => t.status === 'completed').length} | قيد التنفيذ:{' '}
                          {googleTasks.filter((t) => t.status !== 'completed').length}
                        </td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </div>
            </div>
          ) : (
            /* =================================================================
               TAB 3: GOOGLE FORMS
               ================================================================= */
            <div className="space-y-5">
              {/* Create New Bakery Inspection Google Form & Inspect Existing Form */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                <form
                  onSubmit={handleRequestCreateInspectionForm}
                  className="bg-white border border-slate-200 rounded-2xl p-4 shadow-xs space-y-3"
                >
                  <h3 className="text-sm font-black text-[#0F2342] flex items-center gap-2 border-b border-slate-200 pb-2">
                    <Plus className="w-4 h-4 text-blue-700" />
                    <span>إنشاء نموذج تفتيش تمويني جديد في Google Forms</span>
                  </h3>
                  <div>
                    <label className="block text-xs font-black text-slate-700 mb-1">
                      عنوان النموذج في Google Forms *
                    </label>
                    <input
                      type="text"
                      required
                      value={newFormTitle}
                      onChange={(e) => setNewFormTitle(e.target.value)}
                      className="w-full px-3 py-2 bg-white border border-slate-300 rounded-xl text-xs font-bold text-slate-900"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-black text-slate-700 mb-1">
                      وصف النموذج
                    </label>
                    <input
                      type="text"
                      value={newFormDescription}
                      onChange={(e) => setNewFormDescription(e.target.value)}
                      className="w-full px-3 py-2 bg-white border border-slate-300 rounded-xl text-xs font-bold text-slate-900"
                    />
                  </div>
                  <button
                    type="submit"
                    disabled={isLoading}
                    className="w-full py-2.5 bg-[#0F2342] hover:bg-[#1E3A8A] text-amber-300 rounded-xl text-xs font-black flex items-center justify-center gap-2 cursor-pointer transition"
                  >
                    <Sparkles className="w-4 h-4" />
                    <span>إنشاء وتجهيز النموذج في Google Forms</span>
                  </button>
                </form>

                <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-xs space-y-3">
                  <h3 className="text-sm font-black text-[#0F2342] flex items-center gap-2 border-b border-slate-200 pb-2">
                    <FileText className="w-4 h-4 text-indigo-700" />
                    <span>اختيار أو فتح نموذج Google Form واستعراض الردود</span>
                  </h3>

                  <div>
                    <label className="block text-xs font-black text-slate-700 mb-1">
                      النماذج المتوفرة على حساب Google Drive الخاص بك ({driveForms.length})
                    </label>
                    <select
                      value={selectedFormId}
                      onChange={(e) => handleInspectForm(e.target.value)}
                      className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-xs font-bold text-slate-900"
                    >
                      <option value="">-- اختر نموذجاً من القائمة --</option>
                      {driveForms.map((f) => (
                        <option key={f.id} value={f.id}>
                          {f.name}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-black text-slate-700 mb-1">
                      أو إدخال معرّف النموذج (Form ID) مباشرة
                    </label>
                    <div className="flex items-center gap-2">
                      <input
                        type="text"
                        value={manualFormIdInput}
                        onChange={(e) => setManualFormIdInput(e.target.value)}
                        placeholder="أدخل Form ID..."
                        className="w-full px-3 py-2 bg-white border border-slate-300 rounded-xl text-xs font-mono text-slate-900"
                      />
                      <button
                        type="button"
                        onClick={() => handleInspectForm(manualFormIdInput)}
                        className="px-4 py-2 bg-indigo-700 hover:bg-indigo-800 text-white rounded-xl text-xs font-black shrink-0 flex items-center gap-1 cursor-pointer"
                      >
                        <Eye className="w-3.5 h-3.5" />
                        <span>عرض</span>
                      </button>
                    </div>
                  </div>

                  {activeFormDetails && (
                    <div className="p-3 bg-blue-50/70 border border-blue-200 rounded-xl flex flex-wrap items-center justify-between gap-2 text-xs">
                      <div>
                        <span className="font-black text-[#0F2342] block">
                          {activeFormDetails.info?.title}
                        </span>
                        <span className="text-[11px] text-slate-600 font-bold">
                          عدد الأسئلة: {(activeFormDetails.items || []).length} | عدد الردود المسجلة:{' '}
                          {activeFormResponses.length}
                        </span>
                      </div>
                      {activeFormDetails.responderUri && (
                        <a
                          href={activeFormDetails.responderUri}
                          target="_blank"
                          rel="noreferrer"
                          className="px-3 py-1.5 bg-[#1E40AF] hover:bg-blue-700 text-white rounded-lg font-black flex items-center gap-1"
                        >
                          <span>فتح رابط تعبئة النموذج</span>
                          <ExternalLink className="w-3.5 h-3.5" />
                        </a>
                      )}
                    </div>
                  )}
                </div>
              </div>

              {/* Google Form Responses ERP Table with Mandatory 4 Bakery Columns & TOTAL SUMMARY Footer */}
              <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-xs">
                <div className="overflow-x-auto max-h-96">
                  <table className="w-full text-xs text-center border-collapse">
                    <thead className="bg-[#0F2342] text-white sticky top-0 z-10 font-black">
                      <tr>
                        <th className="py-2.5 px-2 border-l border-slate-700">م</th>
                        <th className="py-2.5 px-3 border-l border-slate-700 text-right">اسم المخبز</th>
                        <th className="py-2.5 px-2 border-l border-slate-700">رقم الماكينة</th>
                        <th className="py-2.5 px-2 border-l border-slate-700">اسم القرية</th>
                        <th className="py-2.5 px-2 border-l border-slate-700">اسم الوحدة المحلية</th>
                        <th className="py-2.5 px-3 border-l border-slate-700 text-right">ملخص إجابات النموذج (Google Forms)</th>
                        <th className="py-2.5 px-2">وقت الإرسال</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200 font-bold text-slate-800">
                      {activeFormResponses.length === 0 ? (
                        <tr>
                          <td colSpan={7} className="py-8 text-center text-slate-500">
                            {activeFormDetails
                              ? 'لا توجد ردود مرسلة لهذا النموذج حتى الآن.'
                              : 'اختر نموذجاً أو أنشئ نموذجاً جديداً لعرض الردود الخاصة به.'}
                          </td>
                        </tr>
                      ) : (
                        activeFormResponses.map((resp, idx) => {
                          const allAnswersText = Object.values(resp.answers || {})
                            .flatMap((a) => a.textAnswers?.answers?.map((x) => x.value) || [])
                            .join(' | ');
                          const cols = resolveBakeryColumns(allAnswersText);
                          return (
                            <tr
                              key={resp.responseId}
                              className={idx % 2 === 0 ? 'bg-white hover:bg-blue-50/40' : 'bg-slate-50/70 hover:bg-blue-50/40'}
                            >
                              <td className="py-2 px-2 border-l border-slate-200 font-mono">{idx + 1}</td>
                              <td className="py-2 px-3 border-l border-slate-200 text-right font-black text-slate-900">
                                {cols.bakeryOwnerName}
                              </td>
                              <td className="py-2 px-2 border-l border-slate-200 font-mono">
                                {cols.machineNumber}
                              </td>
                              <td className="py-2 px-2 border-l border-slate-200">{cols.village}</td>
                              <td className="py-2 px-2 border-l border-slate-200">{cols.localUnit}</td>
                              <td className="py-2 px-3 border-l border-slate-200 text-right text-[#0F2342]">
                                {allAnswersText || 'رد مسجل بدون نص'}
                              </td>
                              <td className="py-2 px-2 font-mono text-[11px]" dir="ltr">
                                {resp.lastSubmittedTime
                                  ? resp.lastSubmittedTime.replace('T', ' ').slice(0, 16)
                                  : '-'}
                              </td>
                            </tr>
                          );
                        })
                      )}
                    </tbody>
                    <tfoot className="bg-[#0F2342] text-white sticky bottom-0 font-black">
                      <tr className="total-summary-row">
                        <td colSpan={5} className="py-2.5 px-3 text-right text-amber-300 border-l border-slate-700">
                          صف الإجماليات TOTAL SUMMARY
                        </td>
                        <td colSpan={2} className="py-2.5 px-3 text-center text-sky-200">
                          إجمالي النماذج: {driveForms.length} | إجمالي الردود المعروضة:{' '}
                          {activeFormResponses.length}
                        </td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Mandatory Explicit User Confirmation Modal for Mutating/Destructive Operations */}
        {pendingConfirmation && (
          <div
            className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-slate-950/75 backdrop-blur-xs"
            onClick={() => {
              if (!isExecutingConfirm) setPendingConfirmation(null);
            }}
          >
            <div
              className="bg-white rounded-2xl shadow-2xl border-2 border-amber-500 max-w-lg w-full p-5 space-y-4"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-start gap-3">
                <div
                  className={`p-2.5 rounded-xl shrink-0 ${
                    pendingConfirmation.isDanger
                      ? 'bg-rose-100 text-rose-700'
                      : 'bg-amber-100 text-amber-800'
                  }`}
                >
                  <AlertTriangle className="w-6 h-6" />
                </div>
                <div className="space-y-1">
                  <h4 className="text-base font-black text-slate-900">
                    {pendingConfirmation.title}
                  </h4>
                  <p className="text-xs font-bold text-slate-600 leading-relaxed">
                    {pendingConfirmation.description}
                  </p>
                </div>
              </div>

              {pendingConfirmation.itemsPreview && pendingConfirmation.itemsPreview.length > 0 && (
                <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 max-h-40 overflow-y-auto space-y-1 text-xs font-bold text-slate-800">
                  {pendingConfirmation.itemsPreview.map((line, i) => (
                    <div key={i} className="truncate">
                      {i + 1}. {line}
                    </div>
                  ))}
                </div>
              )}

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-200">
                <button
                  type="button"
                  disabled={isExecutingConfirm}
                  onClick={() => setPendingConfirmation(null)}
                  className="px-4 py-2 rounded-xl bg-slate-200 hover:bg-slate-300 text-slate-800 text-xs font-black cursor-pointer"
                >
                  إلغاء العملية (Cancel)
                </button>
                <button
                  type="button"
                  disabled={isExecutingConfirm}
                  onClick={async () => {
                    setIsExecutingConfirm(true);
                    try {
                      await pendingConfirmation.onConfirm();
                      setPendingConfirmation(null);
                    } catch (err: any) {
                      setStatusBanner({
                        type: 'error',
                        text: err?.message || 'حدث خطأ أثناء تنفيذ العملية في Google Workspace',
                      });
                      setPendingConfirmation(null);
                    } finally {
                      setIsExecutingConfirm(false);
                    }
                  }}
                  className={`px-5 py-2 rounded-xl text-white text-xs font-black cursor-pointer shadow-sm ${
                    pendingConfirmation.isDanger
                      ? 'bg-rose-600 hover:bg-rose-700'
                      : 'bg-[#0F2342] hover:bg-[#1E3A8A]'
                  }`}
                >
                  {isExecutingConfirm ? 'جاري التنفيذ...' : pendingConfirmation.confirmLabel}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
