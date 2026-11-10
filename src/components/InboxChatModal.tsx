import React, { useState, useMemo, useRef, useEffect } from 'react';
import { AppUser, Bakery, InboxChatMessage, UserRoleType } from '../types';
import {
  X,
  Inbox,
  Send,
  MessageSquare,
  AlertTriangle,
  Megaphone,
  Building2,
  Trash2,
  Search,
  User,
  Clock
} from 'lucide-react';

interface InboxChatModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentUser: AppUser | null;
  users: AppUser[];
  bakeries: Bakery[];
  messages: InboxChatMessage[];
  onSendMessage: (msg: Omit<InboxChatMessage, 'id' | 'timestamp' | 'readBy'>) => void;
  onDeleteMessage: (msgId: string) => void;
  onMarkAllRead: () => void;
}

const ROLE_LABELS: Record<UserRoleType, string> = {
  admin: 'مدير النظام',
  supervisor: 'مشرف عام',
  auditor: 'مراجع',
  inspector: 'مفتش تموين',
  data_entry: 'مدخل بيانات',
  viewer: 'مستخدم (عرض)'
};

export const InboxChatModal: React.FC<InboxChatModalProps> = ({
  isOpen,
  onClose,
  currentUser,
  users,
  bakeries,
  messages,
  onSendMessage,
  onDeleteMessage,
  onMarkAllRead
}) => {
  const [content, setContent] = useState('');
  const [messageType, setMessageType] = useState<'instruction' | 'general' | 'alert'>('instruction');
  const [recipientFilter, setRecipientFilter] = useState<string>('ALL');
  const [selectedRecipient, setSelectedRecipient] = useState<string>('ALL');
  const [relatedBakeryId, setRelatedBakeryId] = useState<string>('');
  const [searchTerm, setSearchTerm] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<'all' | 'instruction' | 'general' | 'alert'>('all');

  const chatEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (isOpen) {
      onMarkAllRead();
      setTimeout(() => {
        chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
      }, 100);
    }
  }, [isOpen, messages.length]);

  const filteredMessages = useMemo(() => {
    return messages.filter((msg) => {
      if (categoryFilter !== 'all' && msg.messageType !== categoryFilter) {
        return false;
      }
      if (recipientFilter !== 'ALL') {
        if (
          msg.recipientTarget !== 'ALL' &&
          msg.recipientTarget !== recipientFilter &&
          msg.senderId !== recipientFilter
        ) {
          return false;
        }
      }
      if (searchTerm.trim() !== '') {
        const q = searchTerm.toLowerCase();
        const matchesText =
          msg.content.toLowerCase().includes(q) ||
          msg.senderName.toLowerCase().includes(q) ||
          (msg.relatedBakeryName && msg.relatedBakeryName.toLowerCase().includes(q));
        if (!matchesText) return false;
      }
      return true;
    });
  }, [messages, categoryFilter, recipientFilter, searchTerm]);

  if (!isOpen) return null;

  const handleSend = (e: React.FormEvent) => {
    e.preventDefault();
    if (!content.trim()) return;

    const senderId = currentUser?.username || currentUser?.id || 'admin';
    const senderName = currentUser?.fullName || 'مستخدم المنظومة';
    const senderRole: UserRoleType = currentUser?.role || 'viewer';

    let recipientLabel = 'جميع المستخدمين والأطراف بالمنظومة';
    if (selectedRecipient.startsWith('ROLE:')) {
      const r = selectedRecipient.replace('ROLE:', '') as UserRoleType;
      recipientLabel = `دور: ${ROLE_LABELS[r] || r}`;
    } else if (selectedRecipient !== 'ALL') {
      const targetUser = users.find((u) => u.username === selectedRecipient || u.id === selectedRecipient);
      recipientLabel = targetUser ? targetUser.fullName : selectedRecipient;
    }

    const selectedBakery = bakeries.find((b) => String(b.id) === String(relatedBakeryId));

    onSendMessage({
      senderId,
      senderName,
      senderRole,
      recipientTarget: selectedRecipient,
      recipientLabel,
      messageType,
      content: content.trim(),
      relatedBakeryId: selectedBakery ? String(selectedBakery.id) : undefined,
      relatedBakeryName: selectedBakery ? `${selectedBakery.bakeryOwnerName} (${selectedBakery.village})` : undefined
    });

    setContent('');
    setRelatedBakeryId('');
  };

  return (
    <div
      className="fixed inset-0 bg-slate-900/75 z-[9999] flex items-center justify-center p-2 sm:p-4 backdrop-blur-xs"
      dir="rtl"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className="bg-white rounded-3xl shadow-2xl w-full max-w-5xl max-h-[92vh] flex flex-col overflow-hidden border border-indigo-200"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="bg-gradient-to-l from-indigo-900 via-blue-900 to-slate-900 text-white px-5 py-4 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-2xl bg-indigo-500/30 border border-indigo-400/40 flex items-center justify-center shadow-inner">
              <Inbox className="w-6 h-6 text-amber-300" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-lg sm:text-xl font-black tracking-tight">
                  صندوق الوارد والشات الإداري الداخلي للمنظومة
                </h2>
                <span className="bg-emerald-500/20 text-emerald-300 border border-emerald-400/40 text-xs font-extrabold px-2.5 py-0.5 rounded-full">
                  متصل بين جميع الأطراف ({messages.length} رسالة)
                </span>
              </div>
              <p className="text-xs text-indigo-200 mt-0.5 font-medium">
                بوكس محادثة مباشر وتبادل تعليمات إدارية وتنبيهات المتابعة بين المدير والمراجعين والمفتشين وجميع مستخدمي المنظومة
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 text-white font-black text-xs shadow-sm transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
            <span>إغلاق النافذة</span>
          </button>
        </div>

        {/* Filters & Top Summary Bar */}
        <div className="bg-slate-50 border-b border-slate-200 px-4 py-3 flex flex-wrap items-center justify-between gap-2 shrink-0">
          <div className="flex flex-wrap items-center gap-1.5">
            <button
              type="button"
              onClick={() => setCategoryFilter('all')}
              className={`px-3 py-1.5 rounded-xl text-xs font-black transition-all cursor-pointer ${
                categoryFilter === 'all'
                  ? 'bg-indigo-600 text-white shadow-xs'
                  : 'bg-white text-slate-700 border border-slate-200 hover:bg-slate-100'
              }`}
            >
              الكل ({messages.length})
            </button>
            <button
              type="button"
              onClick={() => setCategoryFilter('instruction')}
              className={`px-3 py-1.5 rounded-xl text-xs font-black transition-all flex items-center gap-1 cursor-pointer ${
                categoryFilter === 'instruction'
                  ? 'bg-amber-600 text-white shadow-xs'
                  : 'bg-white text-amber-800 border border-amber-200 hover:bg-amber-50'
              }`}
            >
              <Megaphone className="w-3.5 h-3.5" />
              <span>تعليمات إدارية ({messages.filter((m) => m.messageType === 'instruction').length})</span>
            </button>
            <button
              type="button"
              onClick={() => setCategoryFilter('alert')}
              className={`px-3 py-1.5 rounded-xl text-xs font-black transition-all flex items-center gap-1 cursor-pointer ${
                categoryFilter === 'alert'
                  ? 'bg-rose-600 text-white shadow-xs'
                  : 'bg-white text-rose-800 border border-rose-200 hover:bg-rose-50'
              }`}
            >
              <AlertTriangle className="w-3.5 h-3.5" />
              <span>تنبيهات متابعة ({messages.filter((m) => m.messageType === 'alert').length})</span>
            </button>
            <button
              type="button"
              onClick={() => setCategoryFilter('general')}
              className={`px-3 py-1.5 rounded-xl text-xs font-black transition-all flex items-center gap-1 cursor-pointer ${
                categoryFilter === 'general'
                  ? 'bg-emerald-600 text-white shadow-xs'
                  : 'bg-white text-emerald-800 border border-emerald-200 hover:bg-emerald-50'
              }`}
            >
              <MessageSquare className="w-3.5 h-3.5" />
              <span>محادثات عامة ({messages.filter((m) => m.messageType === 'general').length})</span>
            </button>
          </div>

          <div className="flex items-center gap-2 flex-1 sm:flex-initial min-w-[240px]">
            <div className="relative flex-1">
              <Search className="w-4 h-4 text-slate-400 absolute right-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="ابحث في الرسائل أو التعليمات أو اسم المخبز..."
                className="w-full pr-9 pl-3 py-1.5 text-xs bg-white border border-slate-300 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none font-bold text-slate-800"
              />
            </div>

            <select
              value={recipientFilter}
              onChange={(e) => setRecipientFilter(e.target.value)}
              className="py-1.5 px-2.5 text-xs bg-white border border-slate-300 rounded-xl font-bold text-slate-700 outline-none"
              title="تصفية حسب الطرف"
            >
              <option value="ALL">جميع الأطراف والمستخدمين</option>
              {users.map((u) => (
                <option key={u.id} value={u.username}>
                  {u.fullName} ({ROLE_LABELS[u.role] || u.role})
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Messages Stream */}
        <div className="flex-1 overflow-y-auto p-4 space-y-3 bg-gradient-to-b from-slate-50 to-indigo-50/30">
          {filteredMessages.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <div className="w-16 h-16 rounded-full bg-indigo-100 text-indigo-600 flex items-center justify-center mb-3">
                <Inbox className="w-8 h-8" />
              </div>
              <p className="text-base font-black text-slate-700">لا توجد رسائل أو تعليمات مطابقة للبحث</p>
              <p className="text-xs text-slate-500 mt-1">
                يمكنك كتابة تعليمات جديدة بالأسفل وإرسالها لجميع المستخدمين والأطراف داخل المنظومة
              </p>
            </div>
          ) : (
            filteredMessages.map((msg) => {
              const isMine = currentUser?.username === msg.senderId || currentUser?.id === msg.senderId;
              const isInstruction = msg.messageType === 'instruction';
              const isAlert = msg.messageType === 'alert';

              return (
                <div
                  key={msg.id}
                  className={`rounded-2xl p-4 border shadow-xs transition-all ${
                    isInstruction
                      ? 'bg-amber-50/90 border-amber-300'
                      : isAlert
                      ? 'bg-rose-50/90 border-rose-300'
                      : isMine
                      ? 'bg-indigo-50/90 border-indigo-200'
                      : 'bg-white border-slate-200'
                  }`}
                >
                  <div className="flex flex-wrap items-center justify-between gap-2 mb-2 pb-2 border-b border-black/5">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span
                        className={`w-8 h-8 rounded-xl flex items-center justify-center font-black text-xs text-white ${
                          isInstruction
                            ? 'bg-amber-600'
                            : isAlert
                            ? 'bg-rose-600'
                            : isMine
                            ? 'bg-indigo-600'
                            : 'bg-slate-700'
                        }`}
                      >
                        {isInstruction ? (
                          <Megaphone className="w-4 h-4" />
                        ) : isAlert ? (
                          <AlertTriangle className="w-4 h-4" />
                        ) : (
                          <User className="w-4 h-4" />
                        )}
                      </span>
                      <div>
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className="font-black text-sm text-slate-900">{msg.senderName}</span>
                          <span className="text-[11px] font-bold px-2 py-0.5 rounded-md bg-slate-200/80 text-slate-700">
                            {ROLE_LABELS[msg.senderRole] || msg.senderRole}
                          </span>
                          <span
                            className={`text-[11px] font-black px-2 py-0.5 rounded-md ${
                              isInstruction
                                ? 'bg-amber-200 text-amber-900'
                                : isAlert
                                ? 'bg-rose-200 text-rose-900'
                                : 'bg-emerald-100 text-emerald-800'
                            }`}
                          >
                            {isInstruction ? '📌 تعليمات إدارية' : isAlert ? '⚠️ تنبيه متابعة' : '💬 رسالة محادثة'}
                          </span>
                          <span className="text-[11px] font-bold px-2 py-0.5 rounded-md bg-indigo-100 text-indigo-800">
                            إلى: {msg.recipientLabel || 'جميع المستخدمين'}
                          </span>
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      <span className="text-[11px] font-bold text-slate-500 flex items-center gap-1" dir="ltr">
                        <Clock className="w-3 h-3" />
                        {msg.timestamp}
                      </span>
                      {(currentUser?.role === 'admin' || isMine) && (
                        <button
                          type="button"
                          onClick={() => onDeleteMessage(msg.id)}
                          className="p-1.5 text-rose-500 hover:bg-rose-100 rounded-lg transition-colors cursor-pointer"
                          title="حذف الرسالة"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  </div>

                  <p className="text-sm font-bold text-slate-800 leading-relaxed whitespace-pre-wrap">{msg.content}</p>

                  {msg.relatedBakeryName && (
                    <div className="mt-2.5 inline-flex items-center gap-1.5 px-3 py-1 rounded-xl bg-white/90 border border-indigo-200 text-xs font-black text-indigo-800">
                      <Building2 className="w-3.5 h-3.5 text-indigo-600" />
                      <span>مخبز مرتبط بالتعليمات: {msg.relatedBakeryName}</span>
                    </div>
                  )}
                </div>
              );
            })
          )}
          <div ref={chatEndRef} />
        </div>

        {/* Compose Box */}
        <form
          onSubmit={handleSend}
          className="bg-white border-t border-slate-200 p-4 space-y-3 shrink-0"
        >
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
            <div>
              <label className="block text-[11px] font-black text-slate-600 mb-1">
                نوع الرسالة / التعليمات:
              </label>
              <select
                value={messageType}
                onChange={(e) => setMessageType(e.target.value as 'instruction' | 'general' | 'alert')}
                className="w-full px-3 py-2 text-xs font-bold bg-slate-50 border border-slate-300 rounded-xl text-slate-800 focus:ring-2 focus:ring-indigo-500 outline-none"
              >
                <option value="instruction">📌 تعليمات إدارية وتوجيهات رسمية</option>
                <option value="alert">⚠️ تنبيه متابعة مخبز / مديونية / ترخيص</option>
                <option value="general">💬 محادثة عامة بين أطراف المنظومة</option>
              </select>
            </div>

            <div>
              <label className="block text-[11px] font-black text-slate-600 mb-1">
                توجيه الرسالة إلى:
              </label>
              <select
                value={selectedRecipient}
                onChange={(e) => setSelectedRecipient(e.target.value)}
                className="w-full px-3 py-2 text-xs font-bold bg-slate-50 border border-slate-300 rounded-xl text-slate-800 focus:ring-2 focus:ring-indigo-500 outline-none"
              >
                <option value="ALL">👥 جميع المستخدمين والأطراف بالمنظومة</option>
                <optgroup label="توجيه حسب الدور الوظيفي">
                  <option value="ROLE:admin">المديرون فقط</option>
                  <option value="ROLE:auditor">المراجعون فقط</option>
                  <option value="ROLE:inspector">المفتشون فقط</option>
                </optgroup>
                <optgroup label="توجيه لمستخدم محدد">
                  {users.map((u) => (
                    <option key={u.id} value={u.username}>
                      👤 {u.fullName} ({u.username})
                    </option>
                  ))}
                </optgroup>
              </select>
            </div>

            <div>
              <label className="block text-[11px] font-black text-slate-600 mb-1">
                ربط بمخبز معين (اختياري):
              </label>
              <select
                value={relatedBakeryId}
                onChange={(e) => setRelatedBakeryId(e.target.value)}
                className="w-full px-3 py-2 text-xs font-bold bg-slate-50 border border-slate-300 rounded-xl text-slate-800 focus:ring-2 focus:ring-indigo-500 outline-none"
              >
                <option value="">-- بدون تحديد مخبز --</option>
                {bakeries.map((b) => (
                  <option key={b.id} value={String(b.id)}>
                    {b.bakeryOwnerName} ({b.village})
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="flex items-end gap-2">
            <textarea
              rows={2}
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder="اكتب التعليمات الإدارية أو رسالة المحادثة لجميع المستخدمين هنا..."
              className="flex-1 p-3 text-sm font-bold bg-slate-50 border border-slate-300 rounded-2xl text-slate-900 focus:ring-2 focus:ring-indigo-500 focus:bg-white outline-none resize-none"
            />
            <button
              type="submit"
              disabled={!content.trim()}
              className="px-6 py-3.5 rounded-2xl bg-gradient-to-l from-indigo-600 to-blue-600 hover:from-indigo-700 hover:to-blue-700 disabled:opacity-50 text-white font-black text-sm shadow-md flex items-center gap-2 transition-all cursor-pointer shrink-0"
            >
              <Send className="w-4 h-4" />
              <span>إرسال لصندوق الوارد</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
