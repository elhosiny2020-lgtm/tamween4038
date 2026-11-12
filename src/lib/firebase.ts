import { initializeApp } from 'firebase/app';
import {
  getAuth,
  GoogleAuthProvider,
  signInWithPopup,
  onAuthStateChanged,
  signOut,
  User,
} from 'firebase/auth';
import {
  getFirestore,
  doc,
  getDoc,
  setDoc,
  getDocFromServer,
  onSnapshot,
} from 'firebase/firestore';
import firebaseConfig from '../../firebase-applet-config.json';

// 1. Initialize Firebase App, Auth, and Firestore Database
const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(
  app,
  (firebaseConfig as { firestoreDatabaseId?: string }).firestoreDatabaseId || '(default)'
);

// 2. Configure Google Workspace OAuth Scopes (Calendar, Tasks, Forms, Drive & Gmail Direct Integration)
export const WORKSPACE_SCOPES = [
  'https://www.googleapis.com/auth/gmail.send',
  'https://www.googleapis.com/auth/calendar',
  'https://www.googleapis.com/auth/calendar.acls',
  'https://www.googleapis.com/auth/calendar.acls.readonly',
  'https://www.googleapis.com/auth/calendar.app.created',
  'https://www.googleapis.com/auth/calendar.calendarlist',
  'https://www.googleapis.com/auth/calendar.calendarlist.readonly',
  'https://www.googleapis.com/auth/calendar.calendars',
  'https://www.googleapis.com/auth/calendar.calendars.readonly',
  'https://www.googleapis.com/auth/calendar.events',
  'https://www.googleapis.com/auth/calendar.events.freebusy',
  'https://www.googleapis.com/auth/calendar.events.owned',
  'https://www.googleapis.com/auth/calendar.events.owned.readonly',
  'https://www.googleapis.com/auth/calendar.events.public.readonly',
  'https://www.googleapis.com/auth/calendar.events.readonly',
  'https://www.googleapis.com/auth/calendar.freebusy',
  'https://www.googleapis.com/auth/calendar.readonly',
  'https://www.googleapis.com/auth/calendar.settings.readonly',
  'https://www.googleapis.com/auth/tasks',
  'https://www.googleapis.com/auth/tasks.readonly',
  'https://www.googleapis.com/auth/drive',
  'https://www.googleapis.com/auth/drive.file',
  'https://www.googleapis.com/auth/drive.readonly',
  'https://www.googleapis.com/auth/forms.body',
  'https://www.googleapis.com/auth/forms.body.readonly',
  'https://www.googleapis.com/auth/forms.responses.readonly',
];

export const googleAuthProvider = new GoogleAuthProvider();
WORKSPACE_SCOPES.forEach((scope) => googleAuthProvider.addScope(scope));

// 3. In-Memory Access Token Cache (Never stored in localStorage/sessionStorage per security rules)
let cachedAccessToken: string | null = null;

export function getCachedGoogleAccessToken(): string | null {
  return cachedAccessToken;
}

export function getCachedAccessToken(): string | null {
  return cachedAccessToken;
}

export function initGoogleAuthListener(callback?: (user: User | null) => void) {
  return onAuthStateChanged(auth, (user) => {
    if (!user) {
      cachedAccessToken = null;
    }
    if (callback) callback(user);
  });
}

export async function signInWithGoogleWorkspace(): Promise<{
  user: User;
  email: string;
  accessToken: string | null;
}> {
  const result = await signInWithPopup(auth, googleAuthProvider);
  const credential = GoogleAuthProvider.credentialFromResult(result);
  cachedAccessToken = credential?.accessToken ?? null;
  return {
    user: result.user,
    email: result.user.email || '',
    accessToken: cachedAccessToken,
  };
}

export async function getValidGoogleAccessToken(): Promise<string> {
  if (cachedAccessToken) return cachedAccessToken;
  const result = await signInWithPopup(auth, googleAuthProvider);
  const credential = GoogleAuthProvider.credentialFromResult(result);
  cachedAccessToken = credential?.accessToken ?? null;
  if (!cachedAccessToken) {
    throw new Error('لم يتم الحصول على رمز الوصول (OAuth Access Token) لحساب Google.');
  }
  return cachedAccessToken;
}

export async function signOutGoogleWorkspace(): Promise<void> {
  cachedAccessToken = null;
  await signOut(auth);
}

// 4. Standardized Firestore Error Handling & Connection Test
export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId: string | undefined;
    email: string | null | undefined;
    emailVerified: boolean | undefined;
    isAnonymous: boolean | undefined;
    tenantId: string | null | undefined;
    providerInfo: {
      providerId: string;
      displayName: string | null;
      email: string | null;
      photoUrl: string | null;
    }[];
  };
}

export function handleFirestoreError(
  error: unknown,
  operationType: OperationType,
  path: string | null
): never {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo:
        auth.currentUser?.providerData.map((provider) => ({
          providerId: provider.providerId,
          displayName: provider.displayName,
          email: provider.email,
          photoUrl: provider.photoURL,
        })) || [],
    },
    operationType,
    path,
  };
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

export async function testFirestoreConnection(): Promise<boolean> {
  try {
    await getDocFromServer(doc(db, 'test', 'connection'));
    return true;
  } catch (error) {
    if (
      error instanceof Error &&
      error.message.includes('the client is offline')
    ) {
      console.error('Please check your Firebase configuration. Client is offline.');
      return false;
    }
    return true;
  }
}

// 5. Cloud Database Persistence (Firestore /workspaces/{uid})
export async function syncWorkspaceToFirestore(
  stateOrSnapshot: Record<string, any>
): Promise<boolean> {
  const currentUser = auth.currentUser;
  if (!currentUser) return false;

  const path = `workspaces/${currentUser.uid}`;
  try {
    const isNormalizedSnapshot =
      typeof stateOrSnapshot.payloadJson === 'string' &&
      typeof stateOrSnapshot.bakeriesCount === 'number';

    const payloadJson = isNormalizedSnapshot
      ? stateOrSnapshot.payloadJson
      : JSON.stringify(stateOrSnapshot);
    const bakeriesCount = isNormalizedSnapshot
      ? stateOrSnapshot.bakeriesCount
      : Array.isArray(stateOrSnapshot.bakeries)
      ? stateOrSnapshot.bakeries.length
      : 0;
    const debtsCount = isNormalizedSnapshot
      ? stateOrSnapshot.debtsCount
      : Array.isArray(stateOrSnapshot.debts)
      ? stateOrSnapshot.debts.length
      : 0;

    // Firestore document limit is 1 MiB; ensure payload fits safely
    if (payloadJson.length > 900_000) {
      return false;
    }
    await setDoc(doc(db, 'workspaces', currentUser.uid), {
      ownerId: currentUser.uid,
      ownerEmail: currentUser.email || stateOrSnapshot.gmailEmail || '',
      bakeriesCount,
      debtsCount,
      payloadJson,
      updatedAt: new Date().toISOString(),
    });
    return true;
  } catch (error) {
    try {
      handleFirestoreError(error, OperationType.WRITE, path);
    } catch {
      return false;
    }
  }
}

export async function loadWorkspaceFromFirestore(): Promise<{
  payloadJson?: string;
  updatedAt?: string;
  gmailEmail?: string;
} | null> {
  const currentUser = auth.currentUser;
  if (!currentUser) return null;

  const path = `workspaces/${currentUser.uid}`;
  try {
    const snap = await getDoc(doc(db, 'workspaces', currentUser.uid));
    if (!snap.exists()) return null;
    const data = snap.data();
    return {
      payloadJson: data.payloadJson,
      updatedAt: data.updatedAt,
      gmailEmail: data.gmailEmail,
    };
  } catch (error) {
    try {
      handleFirestoreError(error, OperationType.GET, path);
    } catch {
      return null;
    }
  }
}

// 5.1 Shared Multi-Device Real-Time Cloud Sync (/shared_sync/tamween_supabase_live & /shared_sync/tamween_latest)
const SHARED_SYNC_DOC_ID = 'tamween_latest';
const SUPABASE_LIVE_DOC_ID = 'tamween_supabase_live';

/**
 * حفظ ومزامنة أحدث بيانات المنظومة في قاعدة البيانات السحابية المشتركة لجميع الأجهزة تلقائياً
 */
export async function syncSharedStateToFirestore(
  state: Record<string, any>,
  customTimestamp?: string
): Promise<boolean> {
  try {
    const bakeriesCount = Array.isArray(state.bakeries) ? state.bakeries.length : 0;
    const debtsCount = Array.isArray(state.debts) ? state.debts.length : 0;

    // Prune redundant logoBase64 inside branchPartitions to stay well under 1MB Firestore doc limit while preserving all branches & auth vaults
    let compactPartitions: Record<string, any> | undefined = undefined;
    if (state.branchPartitions && typeof state.branchPartitions === 'object') {
      compactPartitions = {};
      Object.entries(state.branchPartitions).forEach(([bId, part]: [string, any]) => {
        if (!part) return;
        compactPartitions![bId] = {
          ...part,
          systemConfig: part.systemConfig
            ? { ...part.systemConfig, logoBase64: undefined }
            : undefined,
        };
      });
    }

    const cleanState = {
      activeBranchId: state.activeBranchId,
      branches: state.branches,
      bakeries: state.bakeries || [],
      debts: state.debts || [],
      villages: state.villages,
      issuingEntities: state.issuingEntities,
      violationTypes: state.violationTypes,
      activityStatuses: state.activityStatuses,
      bakeryCategories: state.bakeryCategories,
      breadTypes: state.breadTypes,
      breadTypeCounts: state.breadTypeCounts,
      lineTypes: state.lineTypes,
      fuelTypes: state.fuelTypes,
      paymentMethods: state.paymentMethods,
      dailyTasks: state.dailyTasks,
      inboxMessages: state.inboxMessages,
      columnTitles: state.columnTitles,
      systemConfig: state.systemConfig
        ? { ...state.systemConfig, logoBase64: undefined }
        : undefined,
      users: state.users,
      branchPartitions: compactPartitions,
      branchAuthVaults: state.branchAuthVaults,
    };

    const payloadJson = JSON.stringify(cleanState);
    if (payloadJson.length > 950_000) {
      console.warn('State exceeds 950KB, skipping full sync string');
      return false;
    }

    const updatedAt = customTimestamp || new Date().toISOString();

    await Promise.all([
      setDoc(doc(db, 'shared_sync', SUPABASE_LIVE_DOC_ID), {
        syncId: SUPABASE_LIVE_DOC_ID,
        updatedAt,
        bakeriesCount,
        debtsCount,
        payloadJson,
        cleared: false,
      }),
      setDoc(doc(db, 'shared_sync', SHARED_SYNC_DOC_ID), {
        syncId: SHARED_SYNC_DOC_ID,
        updatedAt,
        bakeriesCount,
        debtsCount,
        payloadJson,
        cleared: false,
      }),
    ]);
    return true;
  } catch (err) {
    console.warn('syncSharedStateToFirestore error (non-critical):', err);
    return false;
  }
}

/**
 * جلب أحدث بيانات المنظومة من قاعدة البيانات السحابية المشتركة لجميع الأجهزة
 */
export async function loadSharedStateFromFirestore(): Promise<{
  data: Record<string, any>;
  updatedAt: string;
  bakeriesCount: number;
  debtsCount: number;
} | null> {
  try {
    let snap = await getDoc(doc(db, 'shared_sync', SUPABASE_LIVE_DOC_ID));
    if (!snap.exists()) {
      snap = await getDoc(doc(db, 'shared_sync', SHARED_SYNC_DOC_ID));
    }
    if (!snap.exists()) return null;
    const item = snap.data();
    if (item?.cleared === true || !item?.payloadJson) return null;
    const parsed = JSON.parse(item.payloadJson);
    return {
      data: parsed,
      updatedAt: item.updatedAt || new Date().toISOString(),
      bakeriesCount: item.bakeriesCount ?? parsed.bakeries?.length ?? 0,
      debtsCount: item.debtsCount ?? parsed.debts?.length ?? 0,
    };
  } catch (err) {
    console.warn('loadSharedStateFromFirestore error:', err);
    return null;
  }
}

/**
 * مسح وتفريغ قاعدة البيانات السحابية المشتركة
 */
export async function clearSharedStateInFirestore(): Promise<boolean> {
  try {
    const nowIso = new Date().toISOString();
    await Promise.all([
      setDoc(doc(db, 'shared_sync', SUPABASE_LIVE_DOC_ID), {
        syncId: SUPABASE_LIVE_DOC_ID,
        updatedAt: nowIso,
        bakeriesCount: 0,
        debtsCount: 0,
        payloadJson: '',
        cleared: true,
      }),
      setDoc(doc(db, 'shared_sync', SHARED_SYNC_DOC_ID), {
        syncId: SHARED_SYNC_DOC_ID,
        updatedAt: nowIso,
        bakeriesCount: 0,
        debtsCount: 0,
        payloadJson: '',
        cleared: true,
      }),
    ]);
    return true;
  } catch (err) {
    console.warn('clearSharedStateInFirestore error:', err);
    return false;
  }
}

/**
 * الاشتراك في تحديثات السحابة الحية (Realtime Snapshot) بحيث يظهر أي تعديل على الأجهزة الأخرى فوراً
 */
export function subscribeToSharedStateChanges(
  onUpdate: (payload: { data: Record<string, any>; updatedAt: string; bakeriesCount: number; debtsCount: number }) => void
): () => void {
  try {
    return onSnapshot(
      doc(db, 'shared_sync', SUPABASE_LIVE_DOC_ID),
      (snap) => {
        if (!snap.exists()) return;
        const item = snap.data();
        if (item?.cleared === true || !item?.payloadJson) return;
        try {
          const parsed = JSON.parse(item.payloadJson);
          onUpdate({
            data: parsed,
            updatedAt: item.updatedAt || new Date().toISOString(),
            bakeriesCount: item.bakeriesCount ?? parsed.bakeries?.length ?? 0,
            debtsCount: item.debtsCount ?? parsed.debts?.length ?? 0,
          });
        } catch {}
      },
      (error) => {
        console.warn('subscribeToSharedStateChanges snapshot error:', error);
      }
    );
  } catch {
    return () => {};
  }
}

// 6. Direct Google Drive Upload & Sync API (https://www.googleapis.com/auth/drive.file)
export async function uploadBackupToGoogleDriveDirect(
  backupPayload: object | string,
  fileName: string = 'tamween_mahalla_cloud_backup.json',
  confirmOverwrite?: (existingFileName: string) => boolean
): Promise<{
  success: boolean;
  fileId?: string;
  fileName?: string;
  email?: string;
  message: string;
}> {
  const token = await getValidGoogleAccessToken();
  const userEmail = auth.currentUser?.email || '';

  // 1. Check if a backup file with the same name already exists in Google Drive (created by this app)
  const searchQuery = encodeURIComponent(`name = '${fileName}' and trashed = false`);
  const listRes = await fetch(
    `https://www.googleapis.com/drive/v3/files?q=${searchQuery}&fields=files(id,name,modifiedTime)&pageSize=5`,
    {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    }
  );

  if (listRes.status === 401) {
    cachedAccessToken = null;
    throw new Error('انتهت صلاحية جلسة Google Drive. يرجى الضغط مرة أخرى لتجديد الربط.');
  }

  let existingFileId: string | null = null;
  if (listRes.ok) {
    const listData = await listRes.json();
    if (Array.isArray(listData.files) && listData.files.length > 0) {
      existingFileId = listData.files[0].id;
    }
  }

  // Ask confirmation before overwriting an existing file on Google Drive
  if (existingFileId && confirmOverwrite) {
    const confirmed = confirmOverwrite(fileName);
    if (!confirmed) {
      return {
        success: false,
        message: 'تم إلغاء تحديث الملف الموجود على Google Drive بناءً على اختيارك.',
      };
    }
  }

  const metadata = {
    name: fileName,
    mimeType: 'application/json',
    description: 'نسخة احتياطية لمنظومة إدارة تموين مركز المحلة الكبرى - قاعدة بيانات المخابز والمديونيات',
  };

  const jsonContent =
    typeof backupPayload === 'string' ? backupPayload : JSON.stringify(backupPayload, null, 2);
  const boundary = '-------TamweenGoogleDriveBoundary7MA4YWxkTrZu0gW';
  const delimiter = `\r\n--${boundary}\r\n`;
  const closeDelimiter = `\r\n--${boundary}--`;

  const multipartBody =
    delimiter +
    'Content-Type: application/json; charset=UTF-8\r\n\r\n' +
    JSON.stringify(metadata) +
    delimiter +
    'Content-Type: application/json; charset=UTF-8\r\n\r\n' +
    jsonContent +
    closeDelimiter;

  const uploadUrl = existingFileId
    ? `https://www.googleapis.com/upload/drive/v3/files/${existingFileId}?uploadType=multipart&fields=id,name,webViewLink`
    : 'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name,webViewLink';

  const uploadMethod = existingFileId ? 'PATCH' : 'POST';

  const uploadRes = await fetch(uploadUrl, {
    method: uploadMethod,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': `multipart/related; boundary=${boundary}`,
    },
    body: multipartBody,
  });

  if (!uploadRes.ok) {
    const errText = await uploadRes.text();
    throw new Error(`تعذر رفع النسخة إلى Google Drive: ${uploadRes.status} ${errText}`);
  }

  const uploadedFile = await uploadRes.json();
  return {
    success: true,
    fileId: uploadedFile.id,
    fileName: uploadedFile.name || fileName,
    email: userEmail,
    message: `تم رفع وحفظ النسخة الاحتياطية مباشرة على Google Drive في حساب (${userEmail}) باسم (${uploadedFile.name || fileName}) بنجاح!`,
  };
}

export async function downloadLatestBackupFromGoogleDriveDirect(): Promise<{
  success: boolean;
  data?: any;
  fileName?: string;
  modifiedTime?: string;
  message: string;
}> {
  const token = await getValidGoogleAccessToken();

  const searchQuery = encodeURIComponent(`mimeType = 'application/json' and trashed = false`);
  const listRes = await fetch(
    `https://www.googleapis.com/drive/v3/files?q=${searchQuery}&orderBy=modifiedTime desc&fields=files(id,name,modifiedTime)&pageSize=5`,
    {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    }
  );

  if (listRes.status === 401) {
    cachedAccessToken = null;
    throw new Error('انتهت صلاحية جلسة Google Drive. يرجى المحاولة مرة أخرى.');
  }

  if (!listRes.ok) {
    throw new Error('تعذر قراءة قائمة ملفات النسخ الاحتياطي من Google Drive.');
  }

  const listData = await listRes.json();
  const files = listData.files || [];
  if (files.length === 0) {
    return {
      success: false,
      message: 'لا توجد ملفات نسخ احتياطية مرفوعة من البرنامج على حساب Google Drive هذا حتى الآن.',
    };
  }

  const latestFile = files[0];
  const downloadRes = await fetch(
    `https://www.googleapis.com/drive/v3/files/${latestFile.id}?alt=media`,
    {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    }
  );

  if (!downloadRes.ok) {
    throw new Error('تعذر تحميل محتوى ملف النسخة الاحتياطية من Google Drive.');
  }

  const parsed = await downloadRes.json();
  return {
    success: true,
    data: parsed,
    fileName: latestFile.name,
    modifiedTime: latestFile.modifiedTime,
    message: `تم جلب أحدث نسخة احتياطية من Google Drive (${latestFile.name}) بنجاح!`,
  };
}

// 7. Direct Gmail Backup Sending API (https://www.googleapis.com/auth/gmail.send)
function toBase64Url(str: string): string {
  const utf8Bytes = new TextEncoder().encode(str);
  let binary = '';
  const chunkSize = 0x8000;
  for (let i = 0; i < utf8Bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...utf8Bytes.subarray(i, i + chunkSize));
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function toBase64Standard(str: string): string {
  const utf8Bytes = new TextEncoder().encode(str);
  let binary = '';
  const chunkSize = 0x8000;
  for (let i = 0; i < utf8Bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...utf8Bytes.subarray(i, i + chunkSize));
  }
  return btoa(binary);
}

export async function sendBackupDirectToGmail(
  recipientEmail: string,
  backupPayload: object | string,
  stats: { bakeriesCount: number; debtsCount: number; totalRemainingDebt?: number }
): Promise<{
  success: boolean;
  messageId?: string;
  message: string;
}> {
  const token = await getValidGoogleAccessToken();
  const senderEmail = auth.currentUser?.email || recipientEmail;
  const cleanRecipient = recipientEmail.trim() || senderEmail;

  if (!cleanRecipient || !cleanRecipient.includes('@')) {
    throw new Error('يرجى إدخال بريد إلكتروني (Gmail) صحيح لإرسال النسخة الاحتياطية إليه.');
  }

  const nowStr = new Date().toLocaleString('ar-EG');
  const dateIso = new Date().toISOString().split('T')[0];
  const attachmentFileName = `tamween_backup_${dateIso}.json`;
  const subjectText = `نسخة احتياطية لمنظومة تموين مركز المحلة الكبرى - ${dateIso}`;
  const encodedSubject = `=?UTF-8?B?${toBase64Standard(subjectText)}?=`;

  const htmlBody = `
    <div dir="rtl" style="font-family: Tahoma, Arial, sans-serif; background: #f8fafc; padding: 20px; border-radius: 12px; border: 2px solid #0f172a; color: #0f172a;">
      <h2 style="color: #0f172a; margin-top: 0;">مديرية التموين والتجارة الداخلية بالغربية - إدارة تموين مركز المحلة الكبرى</h2>
      <p style="font-size: 14px; font-weight: bold; color: #0369a1;">تم إنشاء وإرسال نسخة احتياطية كاملة ومحدثة من قاعدة بيانات المخابز والمديونيات مباشرة إلى بريدك الإلكتروني.</p>
      <table style="width: 100%; border-collapse: collapse; margin: 15px 0; background: #ffffff;">
        <tr>
          <td style="padding: 10px; border: 1px solid #cbd5e1; font-weight: bold;">تاريخ ووقت النسخة</td>
          <td style="padding: 10px; border: 1px solid #cbd5e1;">${nowStr}</td>
        </tr>
        <tr>
          <td style="padding: 10px; border: 1px solid #cbd5e1; font-weight: bold;">إجمالي المخابز المسجلة</td>
          <td style="padding: 10px; border: 1px solid #cbd5e1; font-weight: bold; color: #047857;">${stats.bakeriesCount} مخبز</td>
        </tr>
        <tr>
          <td style="padding: 10px; border: 1px solid #cbd5e1; font-weight: bold;">إجمالي قيود المديونيات</td>
          <td style="padding: 10px; border: 1px solid #cbd5e1; font-weight: bold; color: #b45309;">${stats.debtsCount} قيد مديونية</td>
        </tr>
        <tr>
          <td style="padding: 10px; border: 1px solid #cbd5e1; font-weight: bold;">الإيميل المرتبط بالنسخ</td>
          <td style="padding: 10px; border: 1px solid #cbd5e1;">${cleanRecipient}</td>
        </tr>
      </table>
      <p style="font-size: 12px; color: #475569;">مرفق مع هذه الرسالة ملف النسخة الاحتياطية الكاملة (<strong>${attachmentFileName}</strong>) لاستعادته أو دمجه في أي وقت.</p>
    </div>
  `;

  const rawJson =
    typeof backupPayload === 'string' ? backupPayload : JSON.stringify(backupPayload, null, 2);
  const jsonAttachmentBase64 = toBase64Standard(rawJson);
  const mimeBoundary = 'TamweenGmailMimeBoundary_98457293';

  const mimeMessage = [
    `From: ${senderEmail}`,
    `To: ${cleanRecipient}`,
    `Subject: ${encodedSubject}`,
    'MIME-Version: 1.0',
    `Content-Type: multipart/mixed; boundary="${mimeBoundary}"`,
    '',
    `--${mimeBoundary}`,
    'Content-Type: text/html; charset="UTF-8"',
    'Content-Transfer-Encoding: base64',
    '',
    toBase64Standard(htmlBody),
    '',
    `--${mimeBoundary}`,
    `Content-Type: application/json; name="${attachmentFileName}"`,
    'Content-Transfer-Encoding: base64',
    `Content-Disposition: attachment; filename="${attachmentFileName}"`,
    '',
    jsonAttachmentBase64,
    '',
    `--${mimeBoundary}--`,
  ].join('\r\n');

  const rawEncoded = toBase64Url(mimeMessage);

  const sendRes = await fetch(
    'https://gmail.googleapis.com/gmail/v1/users/me/messages/send',
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ raw: rawEncoded }),
    }
  );

  if (sendRes.status === 401) {
    cachedAccessToken = null;
    throw new Error('انتهت صلاحية جلسة Gmail. يرجى الضغط مرة أخرى لتجديد الربط.');
  }

  if (!sendRes.ok) {
    const errText = await sendRes.text();
    throw new Error(`تعذر إرسال البريد عبر Gmail API: ${sendRes.status} ${errText}`);
  }

  const sendData = await sendRes.json();
  return {
    success: true,
    messageId: sendData.id,
    message: `تم إرسال النسخة الاحتياطية مباشرة إلى بريد الجيميل (${cleanRecipient}) بنجاح! (رقم الرسالة: ${sendData.id})`,
  };
}

// ============================================================================
// 8. Google Calendar API Integration (https://www.googleapis.com/calendar/v3)
// ============================================================================
export interface GoogleCalendarEventItem {
  id: string;
  summary: string;
  description?: string;
  location?: string;
  htmlLink?: string;
  start?: { date?: string; dateTime?: string };
  end?: { date?: string; dateTime?: string };
  status?: string;
}

export async function fetchGoogleCalendarEvents(
  maxResults: number = 30
): Promise<GoogleCalendarEventItem[]> {
  const token = await getValidGoogleAccessToken();
  const timeMin = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
  const url = `https://www.googleapis.com/calendar/v3/calendars/primary/events?maxResults=${maxResults}&singleEvents=true&orderBy=startTime&timeMin=${encodeURIComponent(
    timeMin
  )}`;

  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (res.status === 401) {
    cachedAccessToken = null;
    throw new Error('انتهت صلاحية جلسة Google Calendar. يرجى تسجيل الدخول مرة أخرى.');
  }

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`تعذر جلب مواعيد تقويم Google Calendar: ${res.status} ${errText}`);
  }

  const data = await res.json();
  return Array.isArray(data.items) ? data.items : [];
}

export async function createGoogleCalendarEvent(input: {
  summary: string;
  description?: string;
  location?: string;
  startDate: string; // YYYY-MM-DD
  endDate?: string; // YYYY-MM-DD
}): Promise<GoogleCalendarEventItem> {
  const token = await getValidGoogleAccessToken();
  const cleanStart = input.startDate.split('T')[0];
  const cleanEnd = (input.endDate || input.startDate).split('T')[0];

  const res = await fetch(
    'https://www.googleapis.com/calendar/v3/calendars/primary/events',
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        summary: input.summary,
        description: input.description || '',
        location: input.location || 'مركز المحلة الكبرى',
        start: { date: cleanStart },
        end: { date: cleanEnd },
      }),
    }
  );

  if (res.status === 401) {
    cachedAccessToken = null;
    throw new Error('انتهت صلاحية جلسة Google Calendar. يرجى إعادة الربط.');
  }

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`تعذر إنشاء الحدث في Google Calendar: ${res.status} ${errText}`);
  }

  return await res.json();
}

export async function updateGoogleCalendarEvent(
  eventId: string,
  input: {
    summary: string;
    description?: string;
    location?: string;
    startDate: string;
    endDate?: string;
  }
): Promise<GoogleCalendarEventItem> {
  const token = await getValidGoogleAccessToken();
  const safeEventId = encodeURIComponent(eventId.trim());
  const cleanStart = input.startDate.split('T')[0];
  const cleanEnd = (input.endDate || input.startDate).split('T')[0];

  const res = await fetch(
    `https://www.googleapis.com/calendar/v3/calendars/primary/events/${safeEventId}`,
    {
      method: 'PUT',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        summary: input.summary,
        description: input.description || '',
        location: input.location || 'مركز المحلة الكبرى',
        start: { date: cleanStart },
        end: { date: cleanEnd },
      }),
    }
  );

  if (res.status === 401) {
    cachedAccessToken = null;
    throw new Error('انتهت صلاحية جلسة Google Calendar. يرجى إعادة الربط.');
  }

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`تعذر تحديث الحدث في Google Calendar: ${res.status} ${errText}`);
  }

  return await res.json();
}

export async function deleteGoogleCalendarEvent(eventId: string): Promise<void> {
  const token = await getValidGoogleAccessToken();
  const safeEventId = encodeURIComponent(eventId.trim());

  const res = await fetch(
    `https://www.googleapis.com/calendar/v3/calendars/primary/events/${safeEventId}`,
    {
      method: 'DELETE',
      headers: {
        Authorization: `Bearer ${token}`,
      },
    }
  );

  if (res.status === 401) {
    cachedAccessToken = null;
    throw new Error('انتهت صلاحية جلسة Google Calendar. يرجى إعادة الربط.');
  }

  if (!res.ok && res.status !== 204) {
    const errText = await res.text();
    throw new Error(`تعذر حذف الحدث من Google Calendar: ${res.status} ${errText}`);
  }
}

// ============================================================================
// 9. Google Tasks API Integration (https://tasks.googleapis.com/tasks/v1)
// ============================================================================
export interface GoogleTaskListItem {
  id: string;
  title: string;
  updated?: string;
}

export interface GoogleTaskItem {
  id: string;
  title: string;
  notes?: string;
  status: 'needsAction' | 'completed';
  due?: string;
  updated?: string;
}

export async function fetchGoogleTaskLists(): Promise<GoogleTaskListItem[]> {
  const token = await getValidGoogleAccessToken();
  const res = await fetch('https://tasks.googleapis.com/tasks/v1/users/@me/lists', {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (res.status === 401) {
    cachedAccessToken = null;
    throw new Error('انتهت صلاحية جلسة Google Tasks. يرجى إعادة الربط.');
  }

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`تعذر جلب قوائم مهام Google Tasks: ${res.status} ${errText}`);
  }

  const data = await res.json();
  return Array.isArray(data.items) ? data.items : [];
}

export async function fetchGoogleTasks(
  taskListId: string = '@default'
): Promise<GoogleTaskItem[]> {
  const token = await getValidGoogleAccessToken();
  const safeListId = encodeURIComponent(taskListId.trim() || '@default');
  const res = await fetch(
    `https://tasks.googleapis.com/tasks/v1/lists/${safeListId}/tasks?showCompleted=true&showHidden=true&maxResults=100`,
    {
      headers: { Authorization: `Bearer ${token}` },
    }
  );

  if (res.status === 401) {
    cachedAccessToken = null;
    throw new Error('انتهت صلاحية جلسة Google Tasks. يرجى إعادة الربط.');
  }

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`تعذر جلب المهام من Google Tasks: ${res.status} ${errText}`);
  }

  const data = await res.json();
  return Array.isArray(data.items) ? data.items : [];
}

export async function createGoogleTask(
  taskListId: string = '@default',
  input: { title: string; notes?: string; due?: string }
): Promise<GoogleTaskItem> {
  const token = await getValidGoogleAccessToken();
  const safeListId = encodeURIComponent(taskListId.trim() || '@default');
  const dueIso = input.due
    ? input.due.includes('T')
      ? input.due
      : `${input.due}T09:00:00.000Z`
    : undefined;

  const res = await fetch(
    `https://tasks.googleapis.com/tasks/v1/lists/${safeListId}/tasks`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        title: input.title,
        notes: input.notes || '',
        ...(dueIso ? { due: dueIso } : {}),
      }),
    }
  );

  if (res.status === 401) {
    cachedAccessToken = null;
    throw new Error('انتهت صلاحية جلسة Google Tasks. يرجى إعادة الربط.');
  }

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`تعذر إضافة المهمة في Google Tasks: ${res.status} ${errText}`);
  }

  return await res.json();
}

export async function updateGoogleTask(
  taskListId: string = '@default',
  taskId: string,
  input: { title: string; notes?: string; status: 'needsAction' | 'completed'; due?: string }
): Promise<GoogleTaskItem> {
  const token = await getValidGoogleAccessToken();
  const safeListId = encodeURIComponent(taskListId.trim() || '@default');
  const safeTaskId = encodeURIComponent(taskId.trim());

  const res = await fetch(
    `https://tasks.googleapis.com/tasks/v1/lists/${safeListId}/tasks/${safeTaskId}`,
    {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        title: input.title,
        notes: input.notes || '',
        status: input.status,
      }),
    }
  );

  if (res.status === 401) {
    cachedAccessToken = null;
    throw new Error('انتهت صلاحية جلسة Google Tasks. يرجى إعادة الربط.');
  }

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`تعذر تحديث المهمة في Google Tasks: ${res.status} ${errText}`);
  }

  return await res.json();
}

export async function deleteGoogleTask(
  taskListId: string = '@default',
  taskId: string
): Promise<void> {
  const token = await getValidGoogleAccessToken();
  const safeListId = encodeURIComponent(taskListId.trim() || '@default');
  const safeTaskId = encodeURIComponent(taskId.trim());

  const res = await fetch(
    `https://tasks.googleapis.com/tasks/v1/lists/${safeListId}/tasks/${safeTaskId}`,
    {
      method: 'DELETE',
      headers: {
        Authorization: `Bearer ${token}`,
      },
    }
  );

  if (res.status === 401) {
    cachedAccessToken = null;
    throw new Error('انتهت صلاحية جلسة Google Tasks. يرجى إعادة الربط.');
  }

  if (!res.ok && res.status !== 204) {
    const errText = await res.text();
    throw new Error(`تعذر حذف المهمة من Google Tasks: ${res.status} ${errText}`);
  }
}

// ============================================================================
// 10. Google Forms API Integration (https://forms.googleapis.com/v1/forms)
// ============================================================================
export interface GoogleFormDriveFile {
  id: string;
  name: string;
  modifiedTime?: string;
  webViewLink?: string;
}

export interface GoogleFormDetails {
  formId: string;
  info: {
    title: string;
    documentTitle?: string;
    description?: string;
  };
  responderUri?: string;
  items?: {
    itemId?: string;
    title?: string;
    description?: string;
  }[];
}

export interface GoogleFormResponseItem {
  responseId: string;
  createTime: string;
  lastSubmittedTime: string;
  respondentEmail?: string;
  answers?: Record<
    string,
    {
      questionId: string;
      textAnswers?: { answers: { value: string }[] };
    }
  >;
}

export async function listGoogleFormsFromDrive(): Promise<GoogleFormDriveFile[]> {
  const token = await getValidGoogleAccessToken();
  const q = encodeURIComponent(
    "mimeType = 'application/vnd.google-apps.form' and trashed = false"
  );
  const res = await fetch(
    `https://www.googleapis.com/drive/v3/files?q=${q}&orderBy=modifiedTime desc&fields=files(id,name,modifiedTime,webViewLink)&pageSize=25`,
    {
      headers: { Authorization: `Bearer ${token}` },
    }
  );

  if (res.status === 401) {
    cachedAccessToken = null;
    throw new Error('انتهت صلاحية جلسة Google Forms / Drive. يرجى إعادة الربط.');
  }

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`تعذر جلب قائمة نماذج Google Forms: ${res.status} ${errText}`);
  }

  const data = await res.json();
  return Array.isArray(data.files) ? data.files : [];
}

export async function getGoogleFormDetails(formId: string): Promise<GoogleFormDetails> {
  const token = await getValidGoogleAccessToken();
  const safeFormId = encodeURIComponent(formId.trim());
  const res = await fetch(`https://forms.googleapis.com/v1/forms/${safeFormId}`, {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (res.status === 401) {
    cachedAccessToken = null;
    throw new Error('انتهت صلاحية جلسة Google Forms. يرجى إعادة الربط.');
  }

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`تعذر قراءة بيانات النموذج من Google Forms: ${res.status} ${errText}`);
  }

  return await res.json();
}

export async function getGoogleFormResponses(
  formId: string
): Promise<GoogleFormResponseItem[]> {
  const token = await getValidGoogleAccessToken();
  const safeFormId = encodeURIComponent(formId.trim());
  const res = await fetch(
    `https://forms.googleapis.com/v1/forms/${safeFormId}/responses`,
    {
      headers: { Authorization: `Bearer ${token}` },
    }
  );

  if (res.status === 401) {
    cachedAccessToken = null;
    throw new Error('انتهت صلاحية جلسة Google Forms. يرجى إعادة الربط.');
  }

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`تعذر جلب ردود النموذج من Google Forms: ${res.status} ${errText}`);
  }

  const data = await res.json();
  return Array.isArray(data.responses) ? data.responses : [];
}

export async function createBakeryInspectionGoogleForm(
  title: string,
  description: string
): Promise<GoogleFormDetails> {
  const token = await getValidGoogleAccessToken();

  // Step 1: Create the form with info.title
  const createRes = await fetch('https://forms.googleapis.com/v1/forms', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      info: {
        title: title.trim() || 'نموذج تفتيش ومتابعة مخبز تمويني - مركز المحلة الكبرى',
        documentTitle: title.trim() || 'نموذج تفتيش ومتابعة مخبز تمويني',
      },
    }),
  });

  if (createRes.status === 401) {
    cachedAccessToken = null;
    throw new Error('انتهت صلاحية جلسة Google Forms. يرجى إعادة الربط.');
  }

  if (!createRes.ok) {
    const errText = await createRes.text();
    throw new Error(`تعذر إنشاء النموذج في Google Forms: ${createRes.status} ${errText}`);
  }

  const createdForm: GoogleFormDetails = await createRes.json();
  const safeFormId = encodeURIComponent(createdForm.formId.trim());

  // Step 2: Populate description and standard bakery inspection fields via batchUpdate
  const batchRes = await fetch(
    `https://forms.googleapis.com/v1/forms/${safeFormId}:batchUpdate`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        includeFormInResponse: true,
        requests: [
          {
            updateFormInfo: {
              info: {
                title: title.trim() || 'نموذج تفتيش ومتابعة مخبز تمويني - مركز المحلة الكبرى',
                description:
                  description.trim() ||
                  'نموذج رسمي لمتابعة تشغيل المخابز البلدية والحصص التموينية والمديونيات بإدارة تموين مركز المحلة الكبرى',
              },
              updateMask: 'description',
            },
          },
          {
            createItem: {
              item: {
                title: 'اسم المخبز ورقم الماكينة',
                questionItem: {
                  question: {
                    required: true,
                    textQuestion: { paragraph: false },
                  },
                },
              },
              location: { index: 0 },
            },
          },
          {
            createItem: {
              item: {
                title: 'اسم القرية والوحدة المحلية',
                questionItem: {
                  question: {
                    required: true,
                    textQuestion: { paragraph: false },
                  },
                },
              },
              location: { index: 1 },
            },
          },
          {
            createItem: {
              item: {
                title: 'حالة التشغيل ومطابقة الحصة اليومية ووزن الرغيف',
                questionItem: {
                  question: {
                    required: true,
                    textQuestion: { paragraph: true },
                  },
                },
              },
              location: { index: 2 },
            },
          },
        ],
      }),
    }
  );

  if (batchRes.ok) {
    const batchData = await batchRes.json();
    if (batchData.form) return batchData.form;
  }

  return createdForm;
}

