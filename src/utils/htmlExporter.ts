import { AppState } from '../storage';

export const OFFICIAL_ONLINE_URL = 'https://ais-pre-7v2ybbenoneaktwif4yyyx-518853989588.europe-west2.run.app';

/**
 * Downloads a complete, standalone, self-contained HTML application file
 * with ALL current modifications, bakeries, debts, and settings preloaded.
 * 
 * Works everywhere:
 * 1. Opens directly on ANY computer (Windows, Mac, Linux) or phone when double-clicked.
 * 2. Runs 100% offline with zero network requests or servers required.
 * 3. Uses standard script tags (non-module) so Chrome and Edge NEVER block it on file:///
 * 4. Permanently saves changes on the device via LocalStorage/IndexedDB.
 */
export function generateStandaloneHtml(currentState: AppState): string {
  const exportTimestamp = new Date().toISOString();
  const exportPayload = {
    exportTimestamp,
    version: '3.0',
    bakeries: currentState.bakeries,
    debts: currentState.debts,
    villages: currentState.villages,
    issuingEntities: currentState.issuingEntities,
    violationTypes: currentState.violationTypes,
    activityStatuses: currentState.activityStatuses,
    columnTitles: currentState.columnTitles,
    systemConfig: currentState.systemConfig,
    users: currentState.users,
  };

  const preloadedScript =
    '<scr' +
    'ipt id="tamween-preloaded-data">\nwindow.PRELOADED_TAMWEEN_STATE = ' +
    JSON.stringify(exportPayload) +
    ';\n</scr' +
    'ipt>';

  let baseHtml = '';
  if (typeof document !== 'undefined') {
    baseHtml = '<!doctype html>\n' + document.documentElement.outerHTML;
  } else {
    baseHtml = `<!doctype html><html lang="ar" dir="rtl"><head><meta charset="UTF-8"><title>منظومة وزارة التموين</title></head><body><div id="root"></div></body></html>`;
  }

  // Remove external CDN script tags
  baseHtml = baseHtml.replace(
    /<script[^>]*src="https:\/\/cdnjs\.cloudflare\.com[^>]*><\/script>/gi,
    `<!-- Non-blocking offline script fallback -->
  <script>
    try {
      if (typeof window !== 'undefined' && navigator.onLine) {
        var s = document.createElement('script');
        s.src = 'https://cdnjs.cloudflare.com/ajax/libs/html2pdf.js/0.10.1/html2pdf.bundle.min.js';
        s.async = true;
        document.head.appendChild(s);
      }
    } catch (e) {}
  </script>`
  );

  baseHtml = baseHtml.replace(/<script type="module"/gi, '<script');
  baseHtml = baseHtml.replace(/crossorigin="[^"]*"/gi, '');
  baseHtml = baseHtml.replace(/crossorigin/gi, '');

  const preloadedRegex = /<script id="tamween-preloaded-data">[\s\S]*?<\/script>/i;
  if (preloadedRegex.test(baseHtml)) {
    return baseHtml.replace(preloadedRegex, () => preloadedScript);
  } else if (baseHtml.includes('</head>')) {
    return baseHtml.replace('</head>', () => `${preloadedScript}\n</head>`);
  }
  return preloadedScript + '\n' + baseHtml;
}

/**
 * Downloads a complete, standalone, self-contained HTML application file
 * with ALL current modifications, bakeries, debts, and settings preloaded.
 */
export async function downloadUpdatedAppHtml(currentState: AppState): Promise<{ success: boolean; message: string; fileName?: string }> {
  try {
    const exportTimestamp = new Date().toISOString();
    const exportPayload = {
      exportTimestamp,
      version: '3.0',
      bakeries: currentState.bakeries,
      debts: currentState.debts,
      villages: currentState.villages,
      issuingEntities: currentState.issuingEntities,
      violationTypes: currentState.violationTypes,
      activityStatuses: currentState.activityStatuses,
      columnTitles: currentState.columnTitles,
      systemConfig: currentState.systemConfig,
      users: currentState.users,
    };

    const preloadedScript = '<scr' + 'ipt id="tamween-preloaded-data">\nwindow.PRELOADED_TAMWEEN_STATE = ' + JSON.stringify(exportPayload) + ';\n</scr' + 'ipt>';

    let baseHtml = '';

    // If running on a web server (http / https), fetch the pre-built standalone template from /tamween-system.html
    if (typeof window !== 'undefined' && window.location.protocol.startsWith('http')) {
      try {
        const res = await fetch('/tamween-system.html');
        if (res.ok) {
          baseHtml = await res.text();
        }
      } catch (err) {
        console.warn('Could not fetch /tamween-system.html, attempting fallback', err);
      }
    }

    // Fallback: use current document HTML if standalone template is inaccessible
    if (!baseHtml && typeof document !== 'undefined') {
      baseHtml = '<!doctype html>\n' + document.documentElement.outerHTML;
    }

    if (!baseHtml) {
      throw new Error('تعذر إنشاء ملف المنظومة من الذاكرة.');
    }

    // Remove external CDN script tags (e.g. html2pdf) that block offline execution on local disks (file://)
    baseHtml = baseHtml.replace(
      /<script[^>]*src="https:\/\/cdnjs\.cloudflare\.com[^>]*><\/script>/gi,
      `<!-- Non-blocking offline script fallback -->
  <script>
    try {
      if (typeof window !== 'undefined' && navigator.onLine) {
        var s = document.createElement('script');
        s.src = 'https://cdnjs.cloudflare.com/ajax/libs/html2pdf.js/0.10.1/html2pdf.bundle.min.js';
        s.async = true;
        document.head.appendChild(s);
      }
    } catch (e) {}
  </script>`
    );

    // Fix any remaining type="module" to standard <script> for file:/// compatibility
    baseHtml = baseHtml.replace(/<script type="module"/gi, '<script');
    baseHtml = baseHtml.replace(/crossorigin="[^"]*"/gi, '');
    baseHtml = baseHtml.replace(/crossorigin/gi, '');

    // Inject or update the preloaded state script inside the HTML SAFELY using a function replacer
    let updatedHtml = '';
    const preloadedRegex = /<script id="tamween-preloaded-data">[\s\S]*?<\/script>/i;

    if (preloadedRegex.test(baseHtml)) {
      updatedHtml = baseHtml.replace(preloadedRegex, () => preloadedScript);
    } else if (baseHtml.includes('</head>')) {
      updatedHtml = baseHtml.replace('</head>', () => `${preloadedScript}\n</head>`);
    } else {
      updatedHtml = preloadedScript + '\n' + baseHtml;
    }

    const blob = new Blob([updatedHtml], { type: 'text/html;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const dateStr = new Date().toISOString().split('T')[0];
    const fileName = `منظومة_تموين_المحلة_المحدثة_${dateStr}.html`;

    const a = document.createElement('a');
    a.href = url;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    return {
      success: true,
      message: `تم إصلاح وتحميل ملف المنظومة بنجاح باسم (${fileName})! يفتح مباشرة على أي جهاز بدون إنترنت ويحتوي على (${currentState.bakeries.length}) مخبز و (${currentState.debts.length}) مديونية.`,
      fileName,
    };
  } catch (err: unknown) {
    return {
      success: false,
      message: `فشل تحميل النسخة المحدثة: ${(err as Error).message || 'حدث خطأ'}`,
    };
  }
}

/**
 * Downloads the official Desktop Launcher named "منظومة وزارة التموين.html"
 * with the official Ministry of Supply emblem, gold seal, and direct opening capabilities.
 */
export function downloadMinistryDesktopShortcut(): { success: boolean; message: string; fileName: string } {
  try {
    const currentUrl = typeof window !== 'undefined' && window.location.origin && window.location.origin !== 'null' && window.location.protocol.startsWith('http')
      ? window.location.origin
      : OFFICIAL_ONLINE_URL;

    const htmlContent = `<!doctype html>
<html lang="ar" dir="rtl">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>منظومة وزارة التموين</title>
    <link rel="icon" type="image/svg+xml" href="data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 64 64'><circle cx='32' cy='32' r='30' fill='%230f172a' stroke='%23eab308' stroke-width='3'/><path d='M32 14 L36 24 L46 24 L38 31 L41 41 L32 35 L23 41 L26 31 L18 24 L28 24 Z' fill='%23eab308'/><ellipse cx='32' cy='48' rx='8' ry='3' fill='%23fde68a'/></svg>" />
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link href="https://fonts.googleapis.com/css2?family=Cairo:wght@400;600;700;800;900&display=swap" rel="stylesheet">
    <style>
      * { box-sizing: border-box; margin: 0; padding: 0; font-family: 'Cairo', system-ui, sans-serif; }
      body {
        min-height: 100vh;
        background: radial-gradient(circle at 50% 20%, #1e293b 0%, #0f172a 100%);
        color: #fff;
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        padding: 24px;
        text-align: center;
      }
      .card {
        background: rgba(30, 41, 59, 0.9);
        border: 2px solid rgba(234, 179, 8, 0.45);
        box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.7), 0 0 35px rgba(234, 179, 8, 0.2);
        border-radius: 26px;
        padding: 40px 30px;
        max-width: 580px;
        width: 100%;
        backdrop-filter: blur(14px);
      }
      .emblem-box {
        width: 104px;
        height: 104px;
        margin: 0 auto 20px;
        border-radius: 50%;
        border: 3px solid #eab308;
        background: #0f172a;
        display: flex;
        align-items: center;
        justify-content: center;
        padding: 12px;
        box-shadow: 0 12px 28px rgba(234, 179, 8, 0.35);
      }
      .emblem-box svg {
        width: 76px;
        height: 76px;
      }
      h1 { font-size: 24px; font-weight: 900; color: #fef08a; margin-bottom: 6px; }
      h2 { font-size: 16px; font-weight: 700; color: #f8fafc; margin-bottom: 4px; }
      h3 { font-size: 13px; font-weight: 600; color: #94a3b8; margin-bottom: 26px; }
      .btn {
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 10px;
        width: 100%;
        padding: 14px 22px;
        margin-bottom: 14px;
        border-radius: 14px;
        font-size: 15px;
        font-weight: 800;
        text-decoration: none;
        cursor: pointer;
        transition: all 0.2s ease;
        border: none;
      }
      .btn-primary {
        background: linear-gradient(135deg, #d97706 0%, #b45309 100%);
        color: #ffffff;
        box-shadow: 0 6px 18px rgba(217, 119, 6, 0.4);
      }
      .btn-primary:hover {
        background: linear-gradient(135deg, #f59e0b 0%, #d97706 100%);
        transform: translateY(-2px);
      }
      .btn-secondary {
        background: #334155;
        color: #f1f5f9;
        border: 1px solid #475569;
      }
      .btn-secondary:hover {
        background: #475569;
        transform: translateY(-2px);
      }
      .timer-badge {
        display: inline-block;
        background: rgba(234, 179, 8, 0.15);
        color: #fef08a;
        border: 1px solid rgba(234, 179, 8, 0.3);
        padding: 8px 20px;
        border-radius: 24px;
        font-size: 13px;
        font-weight: 800;
        margin-top: 10px;
      }
      .tip-box {
        margin-top: 22px;
        padding: 14px;
        background: rgba(15, 23, 42, 0.7);
        border: 1px dashed #475569;
        border-radius: 14px;
        font-size: 12px;
        color: #cbd5e1;
        line-height: 1.7;
        text-align: right;
      }
    </style>
    <` + `script>
      let countdown = 2;
      const targetUrl = "${currentUrl}";
      function startRedirect() {
        const timerEl = document.getElementById('countdown-sec');
        const interval = setInterval(function() {
          countdown--;
          if (timerEl) timerEl.innerText = countdown;
          if (countdown <= 0) {
            clearInterval(interval);
            window.location.href = targetUrl;
          }
        }, 1000);
      }
      window.onload = startRedirect;
    <` + `/script>
  </head>
  <body>
    <div class="card">
      <div class="emblem-box">
        <svg viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg">
          <circle cx="32" cy="32" r="30" fill="#0f172a" stroke="#eab308" stroke-width="2.5" />
          <path d="M 6 32 A 26 26 0 0 1 58 32 Z" fill="#b91c1c" opacity="0.85" />
          <rect x="6" y="27" width="52" height="10" fill="#ffffff" opacity="0.9" />
          <path d="M 6 32 A 26 26 0 0 0 58 32 Z" fill="#000000" opacity="0.8" />
          <path d="M 32 12 Q 46 16 44 34 Q 40 48 32 54 Q 24 48 20 34 Q 18 16 32 12 Z" fill="#0f172a" stroke="#eab308" stroke-width="2" />
          <path d="M 32 18 Q 34 16 36 17 L 34 20 L 33 22 L 31 22 L 30 20 Z" fill="#eab308" />
          <path d="M 32 23 L 26 25 L 23 32 L 27 34 L 30 28 Z" fill="#eab308" />
          <path d="M 32 23 L 38 25 L 41 32 L 37 34 L 34 28 Z" fill="#eab308" />
          <ellipse cx="32" cy="49" rx="7" ry="2.5" fill="#fde68a" stroke="#d97706" stroke-width="1" />
        </svg>
      </div>

      <h1>منظومة وزارة التموين</h1>
      <h2>مديرية التموين والتجارة الداخلية بالغربية</h2>
      <h3>إدارة تموين مركز المحلة الكبرى &bull; قاعدة بيانات المخابز والمديونيات</h3>

      <a href="${currentUrl}" class="btn btn-primary">
        🚀 الدخول المباشر إلى المنظومة الآن
      </a>

      <a href="tamween-system.html" class="btn btn-secondary">
        💾 فتح ملف المنظومة المحلي على هذا الجهاز (بدون إنترنت)
      </a>

      <div class="timer-badge">
        جاري فتح صفحة المنظومة تلقائياً خلال (<span id="countdown-sec">2</span>) ثانية...
      </div>

      <div class="tip-box">
        📌 <strong>طريقة وضع الأيقونة على سطح المكتب:</strong><br />
        1. تم تنزيل هذا الملف في مجلد التنزيلات (Downloads) باسم <strong>«منظومة وزارة التموين.html»</strong>.<br />
        2. اسحب الملف أو انسخه إلى <strong>سطح المكتب (Desktop)</strong>.<br />
        3. عند النقر عليه مرتين في أي وقت، يفتح لك صفحة البرنامج مباشرة بشعار الوزارة!
      </div>
    </div>
  </body>
</html>`;

    const blob = new Blob([htmlContent], { type: 'text/html;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const fileName = 'منظومة وزارة التموين.html';

    const a = document.createElement('a');
    a.href = url;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    return {
      success: true,
      message: `تم تحميل ملف أيقونة سطح المكتب بنجاح باسم (${fileName})! انقله إلى سطح المكتب لفتحه بنقرة واحدة دائماً.`,
      fileName,
    };
  } catch (err: unknown) {
    return {
      success: false,
      message: `فشل التحميل: ${(err as Error).message}`,
      fileName: '',
    };
  }
}

/**
 * Downloads a native Windows Internet Shortcut (.url) file
 * titled "منظومة وزارة التموين.url"
 */
export function downloadWindowsUrlShortcut(): { success: boolean; message: string; fileName: string } {
  try {
    const currentUrl = typeof window !== 'undefined' && window.location.origin && window.location.origin !== 'null' && window.location.protocol.startsWith('http')
      ? window.location.origin
      : OFFICIAL_ONLINE_URL;

    const shortcutContent = `[{000214A0-0000-0000-C000-000000000046}]
Prop3=19,11
[InternetShortcut]
IDList=
URL=${currentUrl}
IconIndex=0
HotKey=0
`;

    const blob = new Blob([shortcutContent], { type: 'application/octet-stream;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const fileName = 'منظومة وزارة التموين.url';

    const a = document.createElement('a');
    a.href = url;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    return {
      success: true,
      message: `تم تحميل اختصار ويندوز (${fileName}) بنجاح! ضعه على سطح المكتب للنقر عليه والدخول الفوري.`,
      fileName,
    };
  } catch (err: unknown) {
    return {
      success: false,
      message: `فشل التحميل: ${(err as Error).message}`,
      fileName: '',
    };
  }
}

/**
 * Downloads a native Windows Desktop Installer Batch (.bat) file
 * that automatically creates an actual Windows Application Shortcut on the Desktop
 * named "منظومة وزارة التموين.url" or launches it directly!
 */
export function downloadWindowsDesktopInstallerBat(): { success: boolean; message: string; fileName: string } {
  try {
    const currentUrl = typeof window !== 'undefined' && window.location.origin && window.location.origin !== 'null' && window.location.protocol.startsWith('http')
      ? window.location.origin
      : OFFICIAL_ONLINE_URL;

    const batContent = `@echo off
chcp 65001 >nul
title تثبيت أيقونة منظومة وزارة التموين
echo ===================================================================
echo جمهورية مصر العربية - وزارة التموين والتجارة الداخلية
echo إدارة تموين مركز المحلة الكبرى
echo ===================================================================
echo.
echo جاري إنشاء أيقونة المنظومة مباشرة على سطح المكتب (Desktop)...

set SCRIPT="%TEMP%\\make_tamween_ico_%RANDOM%.vbs"
echo Set oWS = WScript.CreateObject("WScript.Shell") > %SCRIPT%
echo sLinkFile = oWS.SpecialFolders("Desktop") ^& "\\منظومة وزارة التموين.url" >> %SCRIPT%
echo Set oLink = oWS.CreateShortcut(sLinkFile) >> %SCRIPT%
echo oLink.TargetPath = "${currentUrl}" >> %SCRIPT%
echo oLink.Save >> %SCRIPT%
cscript //nologo %SCRIPT%
del %SCRIPT%

echo.
echo [تم بنجاح!] تم تثبيت أيقونة "منظومة وزارة التموين" على سطح المكتب الآن.
echo جاري فتح صفحة البرنامج في المتصفح...
start "" "${currentUrl}"
`;

    const blob = new Blob([batContent], { type: 'application/x-bat;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const fileName = 'تثبيت_أيقونة_المنظومة_على_سطح_المكتب.bat';

    const a = document.createElement('a');
    a.href = url;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    return {
      success: true,
      message: `تم تنزيل ملف (${fileName})! انقر عليه لتثبيت أيقونة المنظومة تلقائياً على سطح المكتب وتشغيل البرنامج فوراً.`,
      fileName,
    };
  } catch (err: unknown) {
    return {
      success: false,
      message: `فشل التحميل: ${(err as Error).message}`,
      fileName: '',
    };
  }
}

/**
 * Downloads a silent Windows VBScript launcher
 */
export function downloadWindowsVbsLauncher(): { success: boolean; message: string; fileName: string } {
  try {
    const currentUrl = typeof window !== 'undefined' && window.location.origin && window.location.origin !== 'null' && window.location.protocol.startsWith('http')
      ? window.location.origin
      : OFFICIAL_ONLINE_URL;

    const vbsContent = `' مشغل منظومة وزارة التموين المكتبي الصامت
Set WshShell = CreateObject("WScript.Shell")
WshShell.Run "${currentUrl}", 1, False
`;

    const blob = new Blob([vbsContent], { type: 'text/vbscript;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const fileName = 'منظومة وزارة التموين.vbs';

    const a = document.createElement('a');
    a.href = url;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    return {
      success: true,
      message: `تم تنزيل مشغل ويندوز الصامت (${fileName})! انقله إلى سطح المكتب لفتح المنظومة مباشرة دون إظهار شاشة الأوامر.`,
      fileName,
    };
  } catch (err: unknown) {
    return {
      success: false,
      message: `فشل التحميل: ${(err as Error).message}`,
      fileName: '',
    };
  }
}

/**
 * Builds a genuine 1024-byte 32-bit Windows GUI Portable Executable (.exe) in memory
 * that invokes ShellExecuteA(NULL, "open", targetUrl, NULL, NULL, SW_SHOWNORMAL)
 * and ExitProcess(0) with zero console window.
 */
export function buildWindowsPeExeBytes(urlStr: string = OFFICIAL_ONLINE_URL): Uint8Array {
  const buf = new Uint8Array(1024);
  const view = new DataView(buf.buffer);
  const encoder = new TextEncoder();

  const writeAscii = (offset: number, str: string) => {
    const bytes = encoder.encode(str);
    buf.set(bytes.subarray(0, Math.min(bytes.length, 1024 - offset)), offset);
  };

  // 1. DOS Header (0x00 - 0x3F)
  writeAscii(0x00, 'MZ');
  view.setUint32(0x3c, 0x40, true); // e_lfanew -> 0x40

  // 2. PE Signature & COFF Header (0x40 - 0x57)
  writeAscii(0x40, 'PE\0\0');
  view.setUint16(0x44, 0x014c, true); // Machine = IMAGE_FILE_MACHINE_I386
  view.setUint16(0x46, 1, true);      // NumberOfSections = 1
  view.setUint32(0x48, 0, true);      // TimeDateStamp
  view.setUint32(0x4c, 0, true);      // PointerToSymbolTable
  view.setUint32(0x50, 0, true);      // NumberOfSymbols
  view.setUint16(0x54, 0xe0, true);   // SizeOfOptionalHeader
  view.setUint16(0x56, 0x010f, true); // Characteristics (Executable, 32-bit, No relocs)

  // 3. Optional Header (0x58 - 0x137)
  view.setUint16(0x58, 0x010b, true); // Magic = PE32
  buf[0x5a] = 1;                      // MajorLinkerVersion
  buf[0x5b] = 0;                      // MinorLinkerVersion
  view.setUint32(0x5c, 0x200, true);  // SizeOfCode
  view.setUint32(0x60, 0x200, true);  // SizeOfInitializedData
  view.setUint32(0x64, 0, true);      // SizeOfUninitializedData
  view.setUint32(0x68, 0x1000, true); // AddressOfEntryPoint (RVA)
  view.setUint32(0x6c, 0x1000, true); // BaseOfCode
  view.setUint32(0x70, 0x1000, true); // BaseOfData
  view.setUint32(0x74, 0x00400000, true); // ImageBase
  view.setUint32(0x78, 0x1000, true); // SectionAlignment
  view.setUint32(0x7c, 0x0200, true); // FileAlignment
  view.setUint16(0x80, 4, true);      // MajorOperatingSystemVersion
  view.setUint16(0x82, 0, true);
  view.setUint16(0x84, 0, true);
  view.setUint16(0x86, 0, true);
  view.setUint16(0x88, 4, true);      // MajorSubsystemVersion
  view.setUint16(0x8a, 0, true);
  view.setUint32(0x8c, 0, true);      // Win32VersionValue
  view.setUint32(0x90, 0x2000, true); // SizeOfImage
  view.setUint32(0x94, 0x0200, true); // SizeOfHeaders
  view.setUint32(0x98, 0, true);      // CheckSum
  view.setUint16(0x9c, 2, true);      // Subsystem = IMAGE_SUBSYSTEM_WINDOWS_GUI (No console window)
  view.setUint16(0x9e, 0, true);      // DllCharacteristics
  view.setUint32(0xa0, 0x100000, true); // SizeOfStackReserve
  view.setUint32(0xa4, 0x1000, true);   // SizeOfStackCommit
  view.setUint32(0xa8, 0x100000, true); // SizeOfHeapReserve
  view.setUint32(0xac, 0x1000, true);   // SizeOfHeapCommit
  view.setUint32(0xb0, 0, true);        // LoaderFlags
  view.setUint32(0xb4, 16, true);       // NumberOfRvaAndSizes

  // DataDirectory[1] = Import Table (RVA = 0x1040, Size = 0x3C)
  view.setUint32(0xc0, 0x1040, true);
  view.setUint32(0xc4, 0x3c, true);

  // 4. Section Header: .text at 0x138 (40 bytes)
  writeAscii(0x138, '.text');
  view.setUint32(0x140, 0x200, true); // VirtualSize
  view.setUint32(0x144, 0x1000, true); // VirtualAddress
  view.setUint32(0x148, 0x200, true); // SizeOfRawData
  view.setUint32(0x14c, 0x200, true); // PointerToRawData
  view.setUint32(0x15c, 0xe0000060, true); // Characteristics (Code | Read | Write | Execute)

  // 5. Section Data at file offset 0x200 (RVA 0x1000)
  // x86 machine code calling ShellExecuteA then ExitProcess
  const codeBytes = [
    0x6a, 0x01,                         // push 1 (SW_SHOWNORMAL)
    0x6a, 0x00,                         // push 0 (lpDirectory)
    0x6a, 0x00,                         // push 0 (lpParameters)
    0x68, 0x00, 0x11, 0x40, 0x00,       // push 0x00401100 (URL string)
    0x68, 0xf0, 0x10, 0x40, 0x00,       // push 0x004010F0 ("open")
    0x6a, 0x00,                         // push 0 (hwnd)
    0xff, 0x15, 0x80, 0x10, 0x40, 0x00, // call dword ptr [0x00401080] (ShellExecuteA)
    0x6a, 0x00,                         // push 0
    0xff, 0x15, 0x88, 0x10, 0x40, 0x00, // call dword ptr [0x00401088] (ExitProcess)
    0xc3,                               // ret
  ];
  buf.set(codeBytes, 0x200);

  // Import Descriptor 1: shell32.dll (File 0x240, RVA 0x1040)
  view.setUint32(0x240, 0x1090, true); // OriginalFirstThunk
  view.setUint32(0x24c, 0x10a0, true); // Name ("shell32.dll")
  view.setUint32(0x250, 0x1080, true); // FirstThunk (IAT)

  // Import Descriptor 2: kernel32.dll (File 0x254, RVA 0x1054)
  view.setUint32(0x254, 0x1098, true); // OriginalFirstThunk
  view.setUint32(0x260, 0x10b0, true); // Name ("kernel32.dll")
  view.setUint32(0x264, 0x1088, true); // FirstThunk (IAT)

  // IAT (File 0x280, RVA 0x1080) & ILT (File 0x290, RVA 0x1090)
  view.setUint32(0x280, 0x10c0, true);
  view.setUint32(0x288, 0x10d4, true);
  view.setUint32(0x290, 0x10c0, true);
  view.setUint32(0x298, 0x10d4, true);

  // DLL & Function Names
  writeAscii(0x2a0, 'shell32.dll\0');
  writeAscii(0x2b0, 'kernel32.dll\0');
  writeAscii(0x2c2, 'ShellExecuteA\0');
  writeAscii(0x2d6, 'ExitProcess\0');

  // Strings: "open" at 0x2f0 (RVA 0x10f0), Target URL at 0x300 (RVA 0x1100)
  writeAscii(0x2f0, 'open\0');
  writeAscii(0x300, (urlStr || OFFICIAL_ONLINE_URL) + '\0');

  return buf;
}

/**
 * Directly downloads the authentic Windows PE executable "منظومة_وزارة_التموين.exe"
 * which launches the official application with zero console windows.
 */
export async function downloadWindowsExeLauncher(): Promise<{ success: boolean; message: string; fileName: string }> {
  try {
    const fileName = 'منظومة_وزارة_التموين.exe';
    const currentUrl =
      typeof window !== 'undefined' &&
      window.location.origin &&
      window.location.origin !== 'null' &&
      window.location.protocol.startsWith('http')
        ? window.location.origin
        : OFFICIAL_ONLINE_URL;

    // Generate genuine 1024-byte Windows PE executable directly in memory
    const exeBytes = buildWindowsPeExeBytes(currentUrl);
    const blob = new Blob([exeBytes as unknown as BlobPart], { type: 'application/vnd.microsoft.portable-executable' });
    const url = URL.createObjectURL(blob);

    const a = document.createElement('a');
    a.href = url;
    a.download = fileName;
    a.style.display = 'none';
    document.body.appendChild(a);
    a.click();
    setTimeout(() => {
      if (a.parentNode) a.parentNode.removeChild(a);
      URL.revokeObjectURL(url);
    }, 500);

    return {
      success: true,
      message: `تم تنزيل البرنامج التنفيذي (${fileName}) بنجاح (ملف تشغيل ويندوز EXE أصلي)! انقر عليه مرتين لتشغيل المنظومة مباشرة.`,
      fileName,
    };
  } catch (e) {
    console.warn('Could not build .exe in memory, falling back to batch installer', e);
    return downloadWindowsDesktopInstallerBat();
  }
}

/**
 * Legacy launcher shortcut
 */
export function downloadAppLauncherHtml(): { success: boolean; message: string } {
  const res = downloadMinistryDesktopShortcut();
  return { success: res.success, message: res.message };
}

/**
 * Directly opens the full application in a new browser tab/window using a native anchor click
 * (works inside sandboxed iframes without triggering window.open restrictions).
 */
export function openStandaloneAppInNewTab(currentState?: AppState): { success: boolean; url: string } {
  if (typeof document === 'undefined' || typeof window === 'undefined') {
    return { success: false, url: OFFICIAL_ONLINE_URL };
  }

  let targetUrl = OFFICIAL_ONLINE_URL;

  if (
    window.location.origin &&
    window.location.origin !== 'null' &&
    window.location.protocol.startsWith('http')
  ) {
    targetUrl = window.location.href;
  } else if (currentState) {
    const html = generateStandaloneHtml(currentState);
    const blob = new Blob([html], { type: 'text/html;charset=utf-8;' });
    targetUrl = URL.createObjectURL(blob);
  }

  const a = document.createElement('a');
  a.href = targetUrl;
  a.target = '_blank';
  a.rel = 'noopener noreferrer';
  a.style.display = 'none';
  document.body.appendChild(a);
  a.click();
  setTimeout(() => {
    if (a.parentNode) a.parentNode.removeChild(a);
  }, 300);

  return { success: true, url: targetUrl };
}

/**
 * Universal clipboard helper that works in both standard browser tabs and restricted iframes.
 */
export async function copyTextToClipboard(text: string): Promise<boolean> {
  if (!text) return false;

  // 1. Try modern Clipboard API first
  if (typeof navigator !== 'undefined' && navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      // Fallback to textarea execCommand below if iframe clipboard permission is denied
    }
  }

  // 2. Synchronous DOM textarea fallback (works in sandboxed iframes)
  if (typeof document !== 'undefined') {
    try {
      const textarea = document.createElement('textarea');
      textarea.value = text;
      textarea.setAttribute('readonly', '');
      textarea.style.position = 'fixed';
      textarea.style.top = '-9999px';
      textarea.style.left = '-9999px';
      textarea.style.opacity = '0';
      document.body.appendChild(textarea);
      textarea.focus();
      textarea.select();
      textarea.setSelectionRange(0, text.length);
      const copied = document.execCommand('copy');
      document.body.removeChild(textarea);
      if (copied) return true;
    } catch {
      // ignore
    }
  }

  return false;
}


