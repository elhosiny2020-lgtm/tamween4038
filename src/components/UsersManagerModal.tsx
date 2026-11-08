import React, { useState, useEffect } from 'react';
import { AppUser } from '../types';
import { Users, Trash2, UserPlus, Check, X, Shield, Lock } from 'lucide-react';

interface UsersManagerModalProps {
  isOpen: boolean;
  onClose: () => void;
  users: AppUser[];
  currentUser: AppUser | null;
  onAddUser: (user: AppUser) => void;
  onDeleteUser: (userId: string) => void;
}

export const UsersManagerModal: React.FC<UsersManagerModalProps> = ({
  isOpen,
  onClose,
  users,
  currentUser,
  onAddUser,
  onDeleteUser,
}) => {
  const [username, setUsername] = useState('');
  const [fullName, setFullName] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState<'admin' | 'inspector' | 'auditor'>('inspector');
  const [msg, setMsg] = useState('');

  // Escape key listener
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' || e.key === 'Esc') {
        onClose();
      }
    };
    if (isOpen) {
      window.addEventListener('keydown', handleKeyDown);
    }
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const handleAdd = (e: React.FormEvent) => {
    e.preventDefault();
    const u = username.trim();
    const n = fullName.trim();
    if (!u || !n || !password) return;

    if (users.some((x) => x.username.toLowerCase() === u.toLowerCase())) {
      alert('اسم المستخدم مسجل مسبقاً');
      return;
    }

    const newUser: AppUser = {
      id: `u-${Date.now()}`,
      username: u,
      fullName: n,
      password,
      role,
      createdAt: new Date().toISOString().split('T')[0],
    };

    onAddUser(newUser);
    setUsername('');
    setFullName('');
    setPassword('');
    setMsg('تمت إضافة المستخدم بنجاح وحفظه في قاعدة البيانات الدائمة');
    setTimeout(() => setMsg(''), 2500);
  };

  const handleDelete = (userId: string, userName: string) => {
    if (userId === currentUser?.id) {
      alert('لا يمكنك حذف حسابك الحالي أثناء تسجيل الدخول به');
      return;
    }
    if (confirm(`هل أنت متأكد من حذف المستخدم "${userName}" نهائياً من قاعدة البيانات؟`)) {
      onDeleteUser(userId);
      setMsg(`تم حذف المستخدم "${userName}" بنجاح وتحديث قاعدة البيانات فورياً`);
      setTimeout(() => setMsg(''), 2500);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm cursor-pointer"
      onClick={(e) => {
        if (e.target === e.currentTarget) {
          e.preventDefault();
          e.stopPropagation();
          onClose();
        }
      }}
    >
      <div className="bg-white rounded-2xl shadow-2xl border-2 border-amber-600/40 w-full max-w-2xl overflow-hidden flex flex-col max-h-[90vh] cursor-default">
        {/* Header */}
        <div className="bg-gradient-to-r from-slate-900 via-amber-900 to-slate-900 p-4 text-white flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Users className="w-5 h-5 text-amber-300" />
            <div>
              <h3 className="text-base font-black">إدارة مستخدمي ومفتشي المنظومة التموينية</h3>
              <p className="text-[11px] text-amber-100 font-bold">
                الحفظ والحذف فوري ودائم في IndexedDB و LocalStorage
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              onClose();
            }}
            className="p-1.5 rounded-xl bg-red-900/60 hover:bg-red-600 text-white transition cursor-pointer border border-red-500/50 hover:scale-105 active:scale-95 shadow-md"
            title="إغلاق النافذة (Escape)"
          >
            <X className="w-5 h-5 stroke-[2.5]" />
          </button>
        </div>

        {/* Content */}
        <div className="p-5 space-y-4 overflow-y-auto flex-1">
          {msg && (
            <div className="p-2.5 bg-emerald-50 border border-emerald-300 text-emerald-800 rounded-lg text-xs font-black flex items-center gap-2">
              <Check className="w-4 h-4" />
              <span>{msg}</span>
            </div>
          )}

          {/* Add User Form */}
          <form onSubmit={handleAdd} className="p-4 bg-slate-50 border border-slate-200 rounded-xl space-y-3">
            <h4 className="text-xs font-black text-slate-800 flex items-center gap-1.5">
              <UserPlus className="w-4 h-4 text-amber-700" />
              إضافة مستخدم أو مفتش جديد
            </h4>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <label className="block text-[11px] font-black text-slate-700 mb-1">الاسم الكامل</label>
                <input
                  type="text"
                  required
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  placeholder="الاسم والصفة الوظيفية"
                  className="w-full px-2.5 py-1.5 bg-white border border-slate-300 rounded-lg text-xs font-bold text-right"
                />
              </div>

              <div>
                <label className="block text-[11px] font-black text-slate-700 mb-1">اسم المستخدم للدخول</label>
                <input
                  type="text"
                  required
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="Username"
                  className="w-full px-2.5 py-1.5 bg-white border border-slate-300 rounded-lg text-xs font-bold text-right"
                />
              </div>

              <div>
                <label className="block text-[11px] font-black text-slate-700 mb-1">كلمة المرور</label>
                <input
                  type="password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Password"
                  className="w-full px-2.5 py-1.5 bg-white border border-slate-300 rounded-lg text-xs font-bold text-right"
                />
              </div>

              <div>
                <label className="block text-[11px] font-black text-slate-700 mb-1">الصلاحية</label>
                <select
                  value={role}
                  onChange={(e) => setRole(e.target.value as 'admin' | 'inspector' | 'auditor')}
                  className="w-full px-2.5 py-1.5 bg-white border border-slate-300 rounded-lg text-xs font-bold"
                >
                  <option value="inspector">مفتش تموين / رقابة</option>
                  <option value="auditor">مراجع حسابات ومديونيات</option>
                  <option value="admin">مدير إدارة / مسؤول نظام</option>
                </select>
              </div>
            </div>

            <button
              type="submit"
              className="mt-2 px-4 py-2 bg-amber-700 hover:bg-amber-800 text-white rounded-lg text-xs font-black shadow-sm transition"
            >
              + إضافة وحفظ المستخدم
            </button>
          </form>

          {/* Users List */}
          <div>
            <h4 className="text-xs font-black text-slate-800 mb-2">
              قائمة المستخدمين المسجلين ({users.length})
            </h4>
            <div className="space-y-2">
              {users.map((u) => (
                <div
                  key={u.id}
                  className="p-3 bg-white border border-slate-200 rounded-xl flex items-center justify-between shadow-2xs"
                >
                  <div className="flex items-center gap-2.5">
                    <div className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center text-slate-700 font-bold text-xs">
                      <Shield className="w-4 h-4 text-amber-700" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-black text-slate-900">{u.fullName}</span>
                        <span className="text-[10px] font-mono text-slate-500">(@{u.username})</span>
                        {u.id === currentUser?.id && (
                          <span className="text-[10px] bg-emerald-100 text-emerald-800 px-1.5 py-0.5 rounded font-black">
                            الحساب الحالي
                          </span>
                        )}
                      </div>
                      <span className="text-[10px] text-slate-500 font-bold">
                        الصلاحية: {u.role === 'admin' ? 'مدير نظام' : u.role === 'auditor' ? 'مراجع مديونيات' : 'مفتش تموين'}
                      </span>
                    </div>
                  </div>

                  {u.id !== currentUser?.id && (
                    <button
                      onClick={() => handleDelete(u.id, u.fullName)}
                      className="text-red-500 hover:text-red-700 p-1.5 hover:bg-red-50 rounded-lg transition"
                      title="حذف المستخدم نهائياً"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="p-3 bg-slate-50 border-t border-slate-200 flex justify-end">
          <button
            type="button"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              onClose();
            }}
            className="px-5 py-2 bg-slate-800 hover:bg-slate-900 text-white rounded-lg text-xs font-black cursor-pointer transition"
          >
            إغلاق النافذة (ESC)
          </button>
        </div>
      </div>
    </div>
  );
};
