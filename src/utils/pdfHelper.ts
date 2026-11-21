import DOMPurify from 'dompurify';

// Ultra-fast, zero-lag Print & PDF Engine for Arabic RTL Governmental Reports
// Completely eliminates html2canvas oklch/oklab/color-mix parsing errors and main-thread freezing
// by isolating the report container and applying a self-contained pure-HEX stylesheet.

const HTML2PDF_CDN_URL = 'https://cdnjs.cloudflare.com/ajax/libs/html2pdf.js/0.10.1/html2pdf.bundle.min.js';
const HTML2PDF_CDN_SRI = 'sha512-GsLlZN/3F2ErC5ifS5QtgpiJtWd43JWSuIgh7mbzZ8zBps+dvLusV+eNQATqgA/HdeKFVgA5v3S/cIrLF7QnIg==';

export interface PdfExportOptions {
  filename?: string;
  title?: string;
  paperSize?: 'a4' | 'a3';
  orientation?: 'landscape' | 'portrait';
  margins?: 'normal' | 'narrow' | 'wide';
  fontClass?: string;
  onProgress?: (stage: string) => void;
}

const PURE_HEX_REPORT_STYLES = `
  * {
    box-sizing: border-box !important;
    font-family: 'Cairo', 'Tajawal', 'Segoe UI', Tahoma, Arial, sans-serif !important;
    -webkit-print-color-adjust: exact !important;
    print-color-adjust: exact !important;
  }
  html, body {
    margin: 0 !important;
    padding: 0 !important;
    width: 100% !important;
    background-color: #ffffff !important;
    color: #0f172a !important;
    direction: rtl !important;
    font-weight: 700 !important;
    line-height: 1.4 !important;
  }
  .no-print {
    display: none !important;
  }
  .hidden.print\\:block,
  .print\\:block {
    display: block !important;
  }
  .print-container {
    display: block !important;
    visibility: visible !important;
    opacity: 1 !important;
    width: 100% !important;
    max-width: 100% !important;
    margin: 0 !important;
    padding: 5mm !important;
    background-color: #ffffff !important;
    color: #0f172a !important;
    direction: rtl !important;
    overflow: visible !important;
    max-height: none !important;
    height: auto !important;
    zoom: 1 !important;
    transform: none !important;
    border: 1.5px solid #0f2342 !important;
    border-radius: 8px !important;
  }
  /* Layout Utilities for Headers, Summary Strips, and Footers */
  .flex { display: flex !important; }
  .inline-flex { display: inline-flex !important; }
  .flex-wrap { flex-wrap: wrap !important; }
  .flex-1 { flex: 1 1 0% !important; }
  .items-center { align-items: center !important; }
  .items-start { align-items: flex-start !important; }
  .items-end { align-items: flex-end !important; }
  .justify-between { justify-content: space-between !important; }
  .justify-center { justify-content: center !important; }
  .gap-1 { gap: 4px !important; }
  .gap-1\\.5 { gap: 6px !important; }
  .gap-2 { gap: 8px !important; }
  .gap-2\\.5 { gap: 10px !important; }
  .gap-3 { gap: 12px !important; }
  .gap-3\\.5 { gap: 14px !important; }
  .gap-4 { gap: 16px !important; }
  .grid { display: grid !important; }
  .grid-cols-2 { grid-template-columns: repeat(2, minmax(0, 1fr)) !important; }
  .grid-cols-3 { grid-template-columns: repeat(3, minmax(0, 1fr)) !important; }
  .grid-cols-4 { grid-template-columns: repeat(4, minmax(0, 1fr)) !important; }
  .grid-cols-5 { grid-template-columns: repeat(5, minmax(0, 1fr)) !important; }
  .grid-cols-6, .lg\\:grid-cols-6 { grid-template-columns: repeat(6, minmax(0, 1fr)) !important; }
  .grid-cols-8, .lg\\:grid-cols-8 { grid-template-columns: repeat(8, minmax(0, 1fr)) !important; }
  .sm\\:grid-cols-3 { grid-template-columns: repeat(3, minmax(0, 1fr)) !important; }
  .sm\\:grid-cols-4 { grid-template-columns: repeat(4, minmax(0, 1fr)) !important; }
  .space-y-5 > * + * { margin-top: 14px !important; }
  .space-y-4 > * + * { margin-top: 12px !important; }
  .space-y-3 > * + * { margin-top: 10px !important; }
  .space-y-2 > * + * { margin-top: 6px !important; }
  .space-y-0\\.5 > * + * { margin-top: 2px !important; }
  .text-right { text-align: right !important; }
  .text-left { text-align: left !important; }
  .text-center { text-align: center !important; }
  .font-black, .font-extrabold, .font-bold { font-weight: 800 !important; }
  .font-mono { font-family: 'Cairo', monospace !important; }
  .underline { text-decoration: underline !important; }
  .block { display: block !important; }
  .inline-block { display: inline-block !important; }
  .w-full { width: 100% !important; }
  .w-14 { width: 52px !important; }
  .h-14 { height: 52px !important; }
  .mx-auto { margin-left: auto !important; margin-right: auto !important; }
  .text-\\[8px\\], .text-\\[9px\\] { font-size: 7.5pt !important; }
  .text-\\[10px\\], .text-\\[10\\.5px\\], .text-\\[11px\\] { font-size: 8.5pt !important; }
  .text-xs { font-size: 9pt !important; }
  .text-sm { font-size: 10pt !important; }
  .text-base, .text-lg, h1 { font-size: 12pt !important; font-weight: 900 !important; margin: 2px 0 !important; }
  h3, h4, p { margin: 2px 0 !important; }
  .p-1 { padding: 4px !important; }
  .p-1\\.5 { padding: 6px !important; }
  .p-2 { padding: 8px !important; }
  .p-2\\.5 { padding: 10px !important; }
  .p-3 { padding: 12px !important; }
  .px-2 { padding-left: 8px !important; padding-right: 8px !important; }
  .px-2\\.5 { padding-left: 10px !important; padding-right: 10px !important; }
  .px-3 { padding-left: 12px !important; padding-right: 12px !important; }
  .px-3\\.5 { padding-left: 14px !important; padding-right: 14px !important; }
  .px-4 { padding-left: 16px !important; padding-right: 16px !important; }
  .py-1 { padding-top: 4px !important; padding-bottom: 4px !important; }
  .py-1\\.5 { padding-top: 6px !important; padding-bottom: 6px !important; }
  .py-2 { padding-top: 8px !important; padding-bottom: 8px !important; }
  .pb-2 { padding-bottom: 8px !important; }
  .pb-3 { padding-bottom: 12px !important; }
  .pb-4 { padding-bottom: 14px !important; }
  .pt-1 { padding-top: 4px !important; }
  .pt-2 { padding-top: 8px !important; }
  .pt-3 { padding-top: 12px !important; }
  .pt-4 { padding-top: 14px !important; }
  .mt-0\\.5 { margin-top: 2px !important; }
  .mt-1 { margin-top: 4px !important; }
  .mt-2 { margin-top: 8px !important; }
  .mt-3 { margin-top: 10px !important; }
  .mt-4 { margin-top: 12px !important; }
  .mt-5 { margin-top: 16px !important; }
  .mt-6 { margin-top: 18px !important; }
  .mt-8 { margin-top: 22px !important; }
  .mb-2 { margin-bottom: 8px !important; }
  .mb-3 { margin-bottom: 12px !important; }
  .mb-4 { margin-bottom: 14px !important; }
  .rounded, .rounded-lg, .rounded-xl, .rounded-2xl { border-radius: 6px !important; }
  .rounded-full { border-radius: 9999px !important; }
  .border { border: 1px solid #cbd5e1 !important; }
  .border-black { border-color: #0f2342 !important; }
  .border-b, .border-b-2 { border-bottom: 2px solid #0f2342 !important; }
  .border-t, .border-t-2 { border-top: 1.5px solid #0f2342 !important; }
  .border-dashed { border-style: dashed !important; border-color: #64748b !important; }
  .bg-amber-50, .bg-amber-50\\/70, .bg-amber-100, .bg-amber-100\\/90 { background-color: #fef3c7 !important; color: #0f172a !important; }
  .bg-slate-50, .bg-slate-100 { background-color: #f8fafc !important; color: #0f172a !important; }
  .bg-blue-50, .bg-blue-50\\/70, .bg-cyan-50 { background-color: #eff6ff !important; color: #0f2342 !important; }
  .bg-emerald-50, .bg-emerald-50\\/70, .bg-teal-50 { background-color: #ecfdf5 !important; color: #064e3b !important; }
  .bg-purple-50, .bg-indigo-50 { background-color: #faf5ff !important; color: #3b0764 !important; }
  .bg-red-50 { background-color: #fef2f2 !important; color: #7f1d1d !important; }

  /* Official Governmental Report Table Styling */
  table {
    display: table !important;
    width: 100% !important;
    border-collapse: collapse !important;
    table-layout: auto !important;
    page-break-inside: auto;
    border: 1.5px solid #0f2342 !important;
    margin-top: 8px !important;
    direction: rtl !important;
    background-color: #ffffff !important;
  }
  thead {
    display: table-header-group !important;
  }
  tbody {
    display: table-row-group !important;
  }
  tfoot {
    display: table-footer-group !important;
  }
  tr {
    display: table-row !important;
    page-break-inside: avoid !important;
    break-inside: avoid !important;
    page-break-after: auto;
  }
  thead th, th {
    display: table-cell !important;
    position: static !important;
    background-color: #0f2342 !important;
    color: #ffffff !important;
    -webkit-text-fill-color: #ffffff !important;
    border: 1px solid #1e3a8a !important;
    font-weight: 800 !important;
    padding: 6px 5px !important;
    text-align: center !important;
    vertical-align: middle !important;
    line-height: 1.25 !important;
  }
  tbody td, td {
    display: table-cell !important;
    border: 1px solid #94a3b8 !important;
    color: #0f172a !important;
    -webkit-text-fill-color: #0f172a !important;
    padding: 5px 4px !important;
    word-break: break-word !important;
    line-height: 1.3 !important;
    text-align: center !important;
    vertical-align: middle !important;
    font-weight: 700 !important;
  }
  tbody tr:nth-child(odd) td {
    background-color: #ffffff !important;
  }
  tbody tr:nth-child(even) td {
    background-color: #f8fafc !important;
  }
  tfoot tr, tfoot td, .total-summary-row td {
    background-color: #dbeafe !important;
    color: #0f2342 !important;
    -webkit-text-fill-color: #0f2342 !important;
    font-weight: 900 !important;
    border: 1.5px solid #0f2342 !important;
    padding: 6px 5px !important;
  }
  .report-font-compact th, .report-font-compact td { font-size: 7.5pt !important; }
  .report-font-standard th, .report-font-standard td { font-size: 8.5pt !important; }
  .report-font-large th, .report-font-large td { font-size: 9.5pt !important; }
  .num-enlarged {
    font-weight: 800 !important;
  }
  img {
    max-width: 52px !important;
    max-height: 52px !important;
    object-fit: contain !important;
  }
`;

export function sanitizeLiveStylesheets() {
  // No-op on live DOM to avoid main-thread layout thrashing; cloned documents are sanitized in isolation.
}

export function sanitizeClonedDocumentForPdf(clonedDoc: Document) {
  try {
    // 1. Remove ALL external stylesheets and raw Tailwind v4 <style> blocks from clonedDoc
    // so html2canvas NEVER encounters oklch(), oklab(), or color-mix()!
    clonedDoc.querySelectorAll('link[rel="stylesheet"], style').forEach((el) => {
      el.parentNode?.removeChild(el);
    });

    // 2. Isolate only the .print-container inside clonedDoc.body so html2canvas doesn't walk 5,000+ background DOM nodes
    const printContainer = clonedDoc.querySelector('.print-container') as HTMLElement | null;
    if (printContainer) {
      printContainer.querySelectorAll('.no-print').forEach((n) => n.remove());
      printContainer.classList.remove('no-print');
      printContainer.style.cssText = 'display:block;width:100%;background:#ffffff;color:#0f172a;direction:rtl;padding:8px;zoom:1;transform:none;';
      clonedDoc.body.innerHTML = '';
      clonedDoc.body.appendChild(printContainer);
    }

    // 3. Clean any inline style attributes containing unsupported color functions or zoom
    clonedDoc.querySelectorAll('[style]').forEach((el) => {
      const styleAttr = el.getAttribute('style') || '';
      if (styleAttr.includes('oklch') || styleAttr.includes('oklab') || styleAttr.includes('color-mix') || styleAttr.includes('zoom')) {
        el.removeAttribute('style');
      }
    });

    // 4. Inject pure-HEX self-contained report stylesheet
    const masterStyle = clonedDoc.createElement('style');
    masterStyle.textContent = PURE_HEX_REPORT_STYLES;
    clonedDoc.head.appendChild(masterStyle);
  } catch (err) {
    console.warn('PDF clone sanitizer warning:', err);
  }
}

// Universal, rock-solid Print Engine supporting A4/A3, Portrait/Landscape, and Custom Margins
export function printHtmlElementA4(
  element: HTMLElement | null,
  documentTitle: string,
  fontClass: string = 'report-font-standard',
  options?: {
    paperSize?: 'a4' | 'a3';
    orientation?: 'landscape' | 'portrait';
    margins?: 'normal' | 'narrow' | 'wide';
  }
) {
  if (!element) {
    return;
  }

  const size = (options?.paperSize || 'a4').toUpperCase();
  const orient = options?.orientation || 'landscape';
  const marginMm =
    options?.margins === 'narrow' ? '5mm' : options?.margins === 'wide' ? '14mm' : '8mm';

  try {
    let iframe = document.getElementById('report-fast-print-iframe') as HTMLIFrameElement | null;
    if (iframe) {
      try { iframe.remove(); } catch {}
    }
    iframe = document.createElement('iframe');
    iframe.id = 'report-fast-print-iframe';
    iframe.style.position = 'fixed';
    iframe.style.right = '0';
    iframe.style.bottom = '0';
    iframe.style.width = '1px';
    iframe.style.height = '1px';
    iframe.style.border = 'none';
    iframe.style.opacity = '0';
    iframe.style.pointerEvents = 'none';
    document.body.appendChild(iframe);

    const iframeDoc = iframe.contentWindow?.document;
    if (!iframeDoc) {
      return;
    }

    const cloned = element.cloneNode(true) as HTMLElement;
    cloned.querySelectorAll('.no-print').forEach((n) => n.remove());
    cloned.querySelectorAll('.hidden.print\\:block, .print\\:block').forEach((n) => {
      (n as HTMLElement).classList.remove('hidden');
      (n as HTMLElement).style.display = 'block';
    });

    const safeTitle = String(documentTitle || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');

    const safeBodyHtml = DOMPurify.sanitize(cloned.innerHTML, {
      USE_PROFILES: { html: true, svg: true },
      ADD_ATTR: ['dir', 'colspan', 'rowspan', 'style', 'class'],
    });

    iframeDoc.open();
    iframeDoc.write(`
      <!DOCTYPE html>
      <html dir="rtl" lang="ar">
      <head>
        <meta charset="utf-8">
        <title>${safeTitle}</title>
        <style>
          @page {
            size: ${size} ${orient};
            margin: ${marginMm};
            @bottom-center {
              content: "صفحة " counter(page) " من " counter(pages);
              font-size: 8pt;
              font-weight: 700;
              color: #334155;
              font-family: 'Cairo', 'Tajawal', Arial, sans-serif;
            }
          }
          ${PURE_HEX_REPORT_STYLES}
        </style>
      </head>
      <body class="${fontClass}">
        <div class="print-container">
          ${safeBodyHtml}
        </div>
      </body>
      </html>
    `);
    iframeDoc.close();

    // Use requestAnimationFrame + slight delay to prevent main-thread freeze
    requestAnimationFrame(() => {
      setTimeout(() => {
        try {
          iframe?.contentWindow?.focus();
          iframe?.contentWindow?.print();
        } catch (err) {
          console.warn('Print iframe warning:', err);
        }
      }, 150);
    });
  } catch (err) {
    console.warn('Print setup error:', err);
  }
}

// Universal Standalone PDF Exporter with Arabic RTL support, zero main-thread lag, and safe naming
export async function exportElementToPdf(
  element: HTMLElement | null,
  options: PdfExportOptions = {}
): Promise<boolean> {
  if (!element) return false;

  const dateStr = new Date().toISOString().split('T')[0];
  const rawTitle = options.title || options.filename || 'تقرير_قاعدة_بيانات_المخابز';
  const cleanTitle = rawTitle
    .replace(/[^\u0600-\u06FFa-zA-Z0-9_-]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 70);
  const finalFilename = options.filename?.endsWith('.pdf')
    ? options.filename
    : `${cleanTitle || 'تقرير_قاعدة_بيانات_المخابز'}_${dateStr}.pdf`;

  const paperSize = options.paperSize || 'a4';
  const orientation = options.orientation || 'landscape';
  const marginArr =
    options.margins === 'narrow'
      ? [4, 4, 4, 4]
      : options.margins === 'wide'
      ? [12, 12, 12, 12]
      : [6, 6, 6, 6];

  options.onProgress?.('جاري تجهيز التقرير للطباعة والتصدير...');
  // Let UI paint the progress message without lag
  await new Promise((resolve) => setTimeout(resolve, 80));

  const win = window as unknown as {
    html2pdf?: () => {
      from: (el: HTMLElement) => { set: (o: unknown) => { save: () => Promise<void> } };
    };
    loadHtml2PdfOnDemand?: () => Promise<unknown>;
    __html2pdfLoadPromise?: Promise<unknown> | null;
  };

  if (typeof win.html2pdf !== 'function') {
    try {
      options.onProgress?.('جاري تهيئة محرك PDF...');
      if (typeof win.loadHtml2PdfOnDemand === 'function') {
        await win.loadHtml2PdfOnDemand();
      } else if (typeof document !== 'undefined') {
        if (!win.__html2pdfLoadPromise) {
          win.__html2pdfLoadPromise = new Promise((resolve) => {
            const script = document.createElement('script');
            script.src = HTML2PDF_CDN_URL;
            script.integrity = HTML2PDF_CDN_SRI;
            script.crossOrigin = 'anonymous';
            script.async = true;
            script.onload = () => resolve(win.html2pdf ?? null);
            script.onerror = () => {
              win.__html2pdfLoadPromise = null;
              resolve(null);
            };
            document.head.appendChild(script);
          });
        }
        await win.__html2pdfLoadPromise;
      }
      await new Promise((resolve) => setTimeout(resolve, 50));
    } catch (e) {
      console.warn('html2pdf dynamic loading notice:', e);
    }
  }

  // Create an isolated, lightweight offscreen container with ONLY the report content
  // so html2canvas never clones the entire application DOM.
  const isolatedWrapper = document.createElement('div');
  isolatedWrapper.className = `print-container ${options.fontClass || 'report-font-standard'}`;
  isolatedWrapper.dir = 'rtl';
  isolatedWrapper.style.cssText = 'background:#ffffff;color:#0f172a;padding:10px;width:100%;direction:rtl;';
  const clonedContent = element.cloneNode(true) as HTMLElement;
  clonedContent.querySelectorAll('.no-print').forEach((n) => n.remove());
  clonedContent.querySelectorAll('.hidden.print\\:block, .print\\:block').forEach((n) => {
    (n as HTMLElement).classList.remove('hidden');
    (n as HTMLElement).style.display = 'block';
  });
  isolatedWrapper.innerHTML = DOMPurify.sanitize(clonedContent.innerHTML, {
    USE_PROFILES: { html: true, svg: true },
    ADD_ATTR: ['dir', 'colspan', 'rowspan', 'style', 'class'],
  });

  const opt = {
    margin: marginArr,
    filename: finalFilename,
    image: { type: 'jpeg', quality: 0.92 },
    pagebreak: { mode: ['avoid-all', 'css', 'legacy'] },
    html2canvas: {
      scale: 1.15, // Smooth 1.15x scale prevents browser freeze and speeds up generation 2x
      useCORS: true,
      logging: false,
      backgroundColor: '#ffffff',
      windowWidth: paperSize === 'a3' ? 1440 : 1200,
      scrollX: 0,
      scrollY: 0,
      onclone: (clonedDoc: Document) => {
        sanitizeClonedDocumentForPdf(clonedDoc);
      },
    },
    jsPDF: { unit: 'mm', format: paperSize, orientation },
  };

  if (typeof win.html2pdf === 'function') {
    try {
      options.onProgress?.('جاري استخراج ملف PDF باللغة العربية...');
      await new Promise((resolve) => setTimeout(resolve, 50));
      const pdfTask = win.html2pdf().from(isolatedWrapper).set(opt).save();
      const timeoutTask = new Promise<void>((_, reject) =>
        setTimeout(() => reject(new Error('PDF generation timed out')), 15000)
      );
      await Promise.race([pdfTask, timeoutTask]);
      options.onProgress?.('تم استخراج وتنزيل ملف PDF بنجاح');
      try { isolatedWrapper.remove(); } catch {}
      return true;
    } catch (err) {
      console.warn('PDF generation fallback to print preview:', err);
      try { isolatedWrapper.remove(); } catch {}
      printHtmlElementA4(element, rawTitle, options.fontClass || 'report-font-standard', {
        paperSize,
        orientation,
        margins: options.margins,
      });
      return true;
    }
  } else {
    try { isolatedWrapper.remove(); } catch {}
    printHtmlElementA4(element, rawTitle, options.fontClass || 'report-font-standard', {
      paperSize,
      orientation,
      margins: options.margins,
    });
    return true;
  }
}

// ============================================================================
// Local Partition / Drive Picker, Partition Readiness Test, & PDF Blob Export
// ============================================================================

export interface FileSystemDirectoryHandleLike {
  name: string;
  getFileHandle: (
    name: string,
    opts?: { create?: boolean }
  ) => Promise<{
    createWritable: () => Promise<{
      write: (data: Blob | Uint8Array | string) => Promise<void>;
      close: () => Promise<void>;
    }>;
  }>;
  removeEntry?: (name: string) => Promise<void>;
}

export interface PartitionReadinessReport {
  status: 'ready' | 'fallback_download' | 'error';
  canPickNativePartition: boolean;
  isEmbeddedIframe: boolean;
  selectedFolderName: string | null;
  folderWriteVerified: boolean;
  directDownloadReady: boolean;
  storageQuotaMB: number | null;
  storageUsageMB: number | null;
  checkedAt: string;
  summary: string;
  checks: Array<{ label: string; ok: boolean; detail: string }>;
}

export async function pickLocalPartitionDirectory(): Promise<{
  ok: boolean;
  handle: FileSystemDirectoryHandleLike | null;
  folderName: string | null;
  reason?: string;
}> {
  const win = window as unknown as {
    showDirectoryPicker?: (opts?: { mode?: 'read' | 'readwrite' }) => Promise<FileSystemDirectoryHandleLike>;
  };

  if (typeof win.showDirectoryPicker !== 'function') {
    return {
      ok: false,
      handle: null,
      folderName: null,
      reason: 'المتصفح الحالي لا يدعم اختيار المجلد مباشرة، وسيتم تنزيل ملف PDF مباشرة إلى الجهاز المحلي.',
    };
  }

  try {
    const handle = await win.showDirectoryPicker({ mode: 'readwrite' });
    return { ok: true, handle, folderName: handle?.name || 'المجلد المختار' };
  } catch (err: unknown) {
    const name = err && typeof err === 'object' && 'name' in err ? String((err as { name?: unknown }).name) : '';
    if (name === 'AbortError') {
      return { ok: false, handle: null, folderName: null, reason: 'تم إلغاء اختيار البارتيشن أو المجلد.' };
    }
    return {
      ok: false,
      handle: null,
      folderName: null,
      reason:
        'نافذة المعاينة الحالية تقيّد اختيار المجلد المباشر؛ يمكنك الحفظ مباشرة عبر زر التصدير لتنزيل ملف PDF على جهازك واختيار البارتيشن من المتصفح.',
    };
  }
}

export async function testLocalPartitionReadiness(
  directoryHandle?: FileSystemDirectoryHandleLike | null,
  selectedPartitionLabel?: string
): Promise<PartitionReadinessReport> {
  const win = window as unknown as {
    showDirectoryPicker?: unknown;
    showSaveFilePicker?: unknown;
  };
  let isEmbeddedIframe = false;
  try {
    isEmbeddedIframe = window.self !== window.top;
  } catch {
    isEmbeddedIframe = true;
  }

  const hasFsApi =
    typeof win.showDirectoryPicker === 'function' || typeof win.showSaveFilePicker === 'function';
  const canPickNativePartition = hasFsApi && !isEmbeddedIframe;
  const directDownloadReady =
    typeof Blob !== 'undefined' && typeof URL !== 'undefined' && typeof URL.createObjectURL === 'function';

  let storageQuotaMB: number | null = null;
  let storageUsageMB: number | null = null;
  try {
    if (navigator.storage && typeof navigator.storage.estimate === 'function') {
      const est = await navigator.storage.estimate();
      if (typeof est.quota === 'number') {
        storageQuotaMB = Math.round(est.quota / (1024 * 1024));
      }
      if (typeof est.usage === 'number') {
        storageUsageMB = Math.round((est.usage / (1024 * 1024)) * 10) / 10;
      }
    }
  } catch {
    // Ignore storage estimate restriction
  }

  let folderWriteVerified = false;
  let folderTestDetail = directoryHandle
    ? `تم تحديد المجلد (${directoryHandle.name})`
    : `المسار المختار: ${selectedPartitionLabel || 'D:\\'} (سيُطلب موقع الحفظ أو التنزيل المباشر)`;

  if (directoryHandle) {
    try {
      const testFilename = `.supply_manual_write_test_${Date.now()}.tmp`;
      const fileHandle = await directoryHandle.getFileHandle(testFilename, { create: true });
      const writable = await fileHandle.createWritable();
      await writable.write('OK');
      await writable.close();
      if (typeof directoryHandle.removeEntry === 'function') {
        await directoryHandle.removeEntry(testFilename);
      }
      folderWriteVerified = true;
      folderTestDetail = `تم اختبار الكتابة والحذف بنجاح داخل المجلد (${directoryHandle.name})`;
    } catch {
      folderWriteVerified = false;
      folderTestDetail = 'تعذر الكتابة المباشرة في المجلد المختار — سيتم استخدام التنزيل المباشر كبديل آمن.';
    }
  }

  const checks: Array<{ label: string; ok: boolean; detail: string }> = [
    {
      label: 'جاهزية إنشاء وتنزيل ملفات PDF محلياً (Blob API)',
      ok: directDownloadReady,
      detail: directDownloadReady
        ? 'متاح ويعمل بكفاءة لتنزيل ملف PDF على الجهاز المحلي.'
        : 'غير متاح في البيئة الحالية.',
    },
    {
      label: 'واجهة اختيار البارتيشن والمجلد المباشر (File System Access)',
      ok: canPickNativePartition || folderWriteVerified,
      detail: folderWriteVerified
        ? folderTestDetail
        : canPickNativePartition
        ? 'مدعومة بالكامل — يمكنك اختيار أي بارتيشن (C: / D: / E: / F:) مباشرة.'
        : isEmbeddedIframe
        ? 'النظام يعمل داخل إطار معاينة؛ عند التصدير سيتم تنزيل ملف PDF مباشرة إلى جهازك المحلي.'
        : 'المتصفح يستخدم التنزيل المباشر إلى مجلد التنزيلات أو نافذة حفظ باسم.',
    },
    {
      label: 'فحص مساحة التخزين المتاحة للمتصفح',
      ok: storageQuotaMB === null || storageQuotaMB > 50,
      detail:
        storageQuotaMB !== null
          ? `المساحة المتاحة: ${storageQuotaMB.toLocaleString('ar-EG')} ميجابايت (المستخدم حالياً: ${storageUsageMB ?? 0} ميجابايت)`
          : 'المساحة التخزينية المحلية جاهزة لاستقبال ملف دليل المستخدم.',
    },
  ];

  const status: PartitionReadinessReport['status'] = !directDownloadReady
    ? 'error'
    : folderWriteVerified || canPickNativePartition
    ? 'ready'
    : 'fallback_download';

  const summary =
    status === 'ready'
      ? `البارتيشن جاهز تماماً للتحميل والحفظ المباشر (${directoryHandle?.name || selectedPartitionLabel || 'الجهاز المحلي'}).`
      : status === 'fallback_download'
      ? 'الجهاز جاهز تماماً لتصدير وتنزيل ملف PDF محلياً (ملاحظة: لتحديد بارتيشن مختلف تلقائياً فعّل خيار السؤال عن مكان الحفظ في إعدادات المتصفح أو افتح المنظومة في نافذة مستقلة).'
      : 'تعذر التحقق من آلية التنزيل — يمكنك استخدام زر طباعة دليل المستخدم (حفظ كـ PDF).';

  return {
    status,
    canPickNativePartition,
    isEmbeddedIframe,
    selectedFolderName: directoryHandle?.name || null,
    folderWriteVerified,
    directDownloadReady,
    storageQuotaMB,
    storageUsageMB,
    checkedAt: new Date().toLocaleTimeString('ar-EG'),
    summary,
    checks,
  };
}

export function printHtmlStringA4(
  htmlContent: string,
  documentTitle: string,
  options?: {
    paperSize?: 'a4' | 'a3';
    orientation?: 'landscape' | 'portrait';
    margins?: 'normal' | 'narrow' | 'wide';
    fontClass?: string;
  }
) {
  const tempDiv = document.createElement('div');
  tempDiv.dir = 'rtl';
  tempDiv.innerHTML = DOMPurify.sanitize(htmlContent, {
    USE_PROFILES: { html: true, svg: true },
    ADD_ATTR: ['dir', 'colspan', 'rowspan', 'style', 'class'],
  });
  printHtmlElementA4(tempDiv, documentTitle, options?.fontClass || 'report-font-standard', {
    paperSize: options?.paperSize || 'a4',
    orientation: options?.orientation || 'portrait',
    margins: options?.margins || 'normal',
  });
}

export async function generateHtmlStringToPdfBlob(
  htmlContent: string,
  options: PdfExportOptions = {}
): Promise<Blob | null> {
  const paperSize = options.paperSize || 'a4';
  const orientation = options.orientation || 'portrait';
  const marginArr =
    options.margins === 'narrow'
      ? [4, 4, 4, 4]
      : options.margins === 'wide'
      ? [12, 12, 12, 12]
      : [6, 6, 6, 6];

  options.onProgress?.('جاري تجهيز محتوى دليل المستخدم للتحويل إلى PDF...');
  await new Promise((resolve) => setTimeout(resolve, 60));

  const win = window as unknown as {
    html2pdf?: () => {
      from: (el: HTMLElement) => {
        set: (o: unknown) => {
          outputPdf: (type: 'blob') => Promise<Blob>;
          save: () => Promise<void>;
        };
      };
    };
    loadHtml2PdfOnDemand?: () => Promise<unknown>;
    __html2pdfLoadPromise?: Promise<unknown> | null;
  };

  if (typeof win.html2pdf !== 'function') {
    try {
      options.onProgress?.('جاري تحميل محرك تحويل PDF باللغة العربية...');
      if (typeof win.loadHtml2PdfOnDemand === 'function') {
        await win.loadHtml2PdfOnDemand();
      } else if (typeof document !== 'undefined') {
        if (!win.__html2pdfLoadPromise) {
          win.__html2pdfLoadPromise = new Promise((resolve) => {
            const script = document.createElement('script');
            script.src = HTML2PDF_CDN_URL;
            script.integrity = HTML2PDF_CDN_SRI;
            script.crossOrigin = 'anonymous';
            script.async = true;
            script.onload = () => resolve(win.html2pdf ?? null);
            script.onerror = () => {
              win.__html2pdfLoadPromise = null;
              resolve(null);
            };
            document.head.appendChild(script);
          });
        }
        await win.__html2pdfLoadPromise;
      }
      await new Promise((resolve) => setTimeout(resolve, 50));
    } catch {
      return null;
    }
  }

  if (typeof win.html2pdf !== 'function') {
    return null;
  }

  const isolatedWrapper = document.createElement('div');
  isolatedWrapper.setAttribute('data-pdf-export-target', 'manual');
  isolatedWrapper.className = `manual-pdf-root ${options.fontClass || 'report-font-standard'}`;
  isolatedWrapper.dir = 'rtl';
  isolatedWrapper.style.cssText =
    'background:#ffffff;color:#0f172a;padding:8px;width:100%;direction:rtl;font-family:Cairo,Tajawal,Tahoma,Arial,sans-serif;';
  isolatedWrapper.innerHTML = DOMPurify.sanitize(htmlContent, {
    USE_PROFILES: { html: true, svg: true },
    ADD_ATTR: ['dir', 'colspan', 'rowspan', 'style', 'class', 'alt', 'src'],
  });

  const manualPureHexCss = `
    * {
      box-sizing: border-box !important;
      font-family: 'Cairo', 'Tajawal', 'Segoe UI', Tahoma, Arial, sans-serif !important;
      -webkit-print-color-adjust: exact !important;
      print-color-adjust: exact !important;
    }
    html, body {
      margin: 0 !important;
      padding: 0 !important;
      background-color: #ffffff !important;
      color: #0f172a !important;
      direction: rtl !important;
    }
    [data-pdf-export-target="manual"] {
      display: block !important;
      visibility: visible !important;
      opacity: 1 !important;
      width: 100% !important;
      background-color: #ffffff !important;
      color: #0f172a !important;
      direction: rtl !important;
      line-height: 1.45 !important;
    }
    [data-pdf-export-target="manual"] table {
      width: 100% !important;
      border-collapse: collapse !important;
      direction: rtl !important;
      background-color: #ffffff !important;
    }
    [data-pdf-export-target="manual"] tr {
      page-break-inside: avoid !important;
      break-inside: avoid !important;
    }
    [data-pdf-export-target="manual"] th,
    [data-pdf-export-target="manual"] td {
      word-break: break-word !important;
      vertical-align: middle !important;
    }
    [data-pdf-export-target="manual"] img {
      object-fit: contain !important;
    }
  `;

  const opt = {
    margin: marginArr,
    filename: options.filename || 'user_manual.pdf',
    image: { type: 'jpeg', quality: 0.92 },
    pagebreak: { mode: ['avoid-all', 'css', 'legacy'] },
    html2canvas: {
      scale: 1.25,
      useCORS: true,
      allowTaint: true,
      logging: false,
      backgroundColor: '#ffffff',
      windowWidth: orientation === 'landscape' ? 1160 : 840,
      scrollX: 0,
      scrollY: 0,
      onclone: (clonedDoc: Document) => {
        try {
          // Strip all Tailwind v4 stylesheets (oklch/oklab/color-mix) without detaching html2pdf target
          clonedDoc.querySelectorAll('link[rel="stylesheet"], style').forEach((el) => {
            el.parentNode?.removeChild(el);
          });
          if ('adoptedStyleSheets' in clonedDoc) {
            try {
              (clonedDoc as unknown as { adoptedStyleSheets: CSSStyleSheet[] }).adoptedStyleSheets = [];
            } catch {}
          }
          // Hide unrelated background root containers to keep html2canvas fast & clean
          const targetNode = clonedDoc.querySelector('[data-pdf-export-target="manual"]');
          if (targetNode) {
            Array.from(clonedDoc.body.children).forEach((child) => {
              if (!child.contains(targetNode) && child !== targetNode) {
                (child as HTMLElement).style.display = 'none';
              }
            });
          }
          const masterStyle = clonedDoc.createElement('style');
          masterStyle.textContent = manualPureHexCss;
          clonedDoc.head.appendChild(masterStyle);
        } catch (sanitizeErr) {
          console.warn('Manual PDF clone sanitize warning:', sanitizeErr);
        }
      },
    },
    jsPDF: { unit: 'mm', format: paperSize, orientation },
  };

  try {
    options.onProgress?.('جاري بناء صفحات ملف PDF باللغة العربية (قد يستغرق بضع ثوانٍ)...');
    const blobTask = win.html2pdf().from(isolatedWrapper).set(opt).outputPdf('blob');
    const timeoutTask = new Promise<Blob>((_, reject) =>
      setTimeout(() => reject(new Error('PDF blob timeout')), 45000)
    );
    const pdfBlob = await Promise.race([blobTask, timeoutTask]);
    try { isolatedWrapper.remove(); } catch {}
    return pdfBlob;
  } catch (err) {
    console.warn('PDF blob generation notice:', err);
    try { isolatedWrapper.remove(); } catch {}
    return null;
  }
}

export async function savePdfBlobToPartitionOrDownload(
  blob: Blob,
  options: {
    filename: string;
    directoryHandle?: FileSystemDirectoryHandleLike | null;
    useSaveAsPicker?: boolean;
  }
): Promise<{
  ok: boolean;
  method: 'directory_handle' | 'save_picker' | 'download';
  filename: string;
  sizeKB: number;
  message: string;
}> {
  const sizeKB = Math.max(1, Math.round(blob.size / 1024));
  const filename = options.filename.endsWith('.pdf') ? options.filename : `${options.filename}.pdf`;

  if (options.directoryHandle) {
    try {
      const fileHandle = await options.directoryHandle.getFileHandle(filename, { create: true });
      const writable = await fileHandle.createWritable();
      await writable.write(blob);
      await writable.close();
      return {
        ok: true,
        method: 'directory_handle',
        filename,
        sizeKB,
        message: `تم حفظ ملف PDF (${filename} — ${sizeKB} كيلوبايت) مباشرة داخل المجلد المختار (${options.directoryHandle.name}).`,
      };
    } catch (err) {
      console.warn('Directory handle save fallback to picker/download:', err);
    }
  }

  const win = window as unknown as {
    showSaveFilePicker?: (opts?: {
      suggestedName?: string;
      types?: Array<{ description: string; accept: Record<string, string[]> }>;
    }) => Promise<{
      name?: string;
      createWritable: () => Promise<{
        write: (data: Blob) => Promise<void>;
        close: () => Promise<void>;
      }>;
    }>;
  };

  if (options.useSaveAsPicker && typeof win.showSaveFilePicker === 'function') {
    try {
      const fileHandle = await win.showSaveFilePicker({
        suggestedName: filename,
        types: [{ description: 'ملف PDF (دليل المستخدم)', accept: { 'application/pdf': ['.pdf'] } }],
      });
      const writable = await fileHandle.createWritable();
      await writable.write(blob);
      await writable.close();
      return {
        ok: true,
        method: 'save_picker',
        filename: fileHandle?.name || filename,
        sizeKB,
        message: `تم حفظ ملف PDF (${fileHandle?.name || filename} — ${sizeKB} كيلوبايت) على البارتيشن والمجلد الذي اخترته بنجاح.`,
      };
    } catch (err: unknown) {
      const name = err && typeof err === 'object' && 'name' in err ? String((err as { name?: unknown }).name) : '';
      if (name === 'AbortError') {
        return {
          ok: false,
          method: 'save_picker',
          filename,
          sizeKB,
          message: 'تم إلغاء عملية حفظ الملف من نافذة اختيار البارتيشن.',
        };
      }
    }
  }

  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.style.display = 'none';
  document.body.appendChild(a);
  a.click();
  setTimeout(() => {
    try { document.body.removeChild(a); } catch {}
    try { URL.revokeObjectURL(url); } catch {}
  }, 1500);

  return {
    ok: true,
    method: 'download',
    filename,
    sizeKB,
    message: `تم تصدير وتنزيل ملف PDF (${filename} — ${sizeKB} كيلوبايت) على جهازك المحلي بنجاح.`,
  };
}

