// Helper to sanitize modern CSS color functions (oklch, oklab, color-mix, light-dark)
// in live and cloned documents before html2canvas parses stylesheets, preventing PDF export crashes,
// and enforcing official Deep Navy (#0F2342) headers with white text and crisp alternating rows
// for all PDF and Print operations.

export interface PdfExportOptions {
  filename?: string;
  title?: string;
  paperSize?: 'a4' | 'a3';
  orientation?: 'landscape' | 'portrait';
  margins?: 'normal' | 'narrow' | 'wide';
  fontClass?: string;
  onProgress?: (stage: string) => void;
}

function createColorConverter() {
  const canvas = document.createElement('canvas');
  canvas.width = 1;
  canvas.height = 1;
  const ctx = canvas.getContext('2d');
  const colorCache = new Map<string, string>();

  const convertColorToRgb = (colorStr: string): string => {
    if (colorCache.has(colorStr)) return colorCache.get(colorStr)!;
    if (!ctx) return '#0f2342';
    try {
      ctx.clearRect(0, 0, 1, 1);
      ctx.fillStyle = '#0f2342';
      ctx.fillStyle = colorStr;
      const computed = ctx.fillStyle;
      if (computed && !computed.includes('oklch') && !computed.includes('oklab')) {
        colorCache.set(colorStr, computed);
        return computed;
      }
    } catch {
      // fallback
    }
    colorCache.set(colorStr, '#0f2342');
    return '#0f2342';
  };

  const sanitizeCssText = (css: string): string => {
    let cleaned = css.replace(/(?:oklch|oklab|lch|lab)\([^)]+\)/gi, (match) => convertColorToRgb(match));
    cleaned = cleaned.replace(/color-mix\([^)]+\)/gi, '#1e293b');
    return cleaned;
  };

  return { sanitizeCssText };
}

export function sanitizeLiveStylesheets() {
  try {
    const { sanitizeCssText } = createColorConverter();
    const styleElements = document.querySelectorAll('style');
    styleElements.forEach((styleEl) => {
      if (
        styleEl.textContent &&
        (styleEl.textContent.includes('oklch') ||
          styleEl.textContent.includes('oklab') ||
          styleEl.textContent.includes('color-mix'))
      ) {
        styleEl.textContent = sanitizeCssText(styleEl.textContent);
      }
    });
  } catch (err) {
    console.warn('Live stylesheet sanitizer warning:', err);
  }
}

export function sanitizeClonedDocumentForPdf(clonedDoc: Document) {
  try {
    const { sanitizeCssText } = createColorConverter();

    // 1. Collect all rules from document.styleSheets
    const collectedCss: string[] = [];
    try {
      Array.from(document.styleSheets).forEach((sheet) => {
        try {
          const rules = sheet.cssRules || sheet.rules;
          if (!rules) return;
          for (let i = 0; i < rules.length; i++) {
            collectedCss.push(rules[i].cssText);
          }
        } catch {
          // Cross-origin stylesheet, ignore
        }
      });
    } catch {
      // ignore
    }

    // 2. Remove external <link rel="stylesheet"> from clonedDoc so html2canvas doesn't re-parse raw oklch() files
    const linkElements = clonedDoc.querySelectorAll('link[rel="stylesheet"]');
    linkElements.forEach((linkEl) => {
      linkEl.parentNode?.removeChild(linkEl);
    });

    // 3. Sanitize all existing <style> tags inside clonedDoc
    const styleElements = clonedDoc.querySelectorAll('style');
    styleElements.forEach((styleEl) => {
      if (styleEl.textContent) {
        styleEl.textContent = sanitizeCssText(styleEl.textContent);
      }
    });

    // 4. Remove .no-print class from any ancestor of .print-container so .print-container is NEVER hidden
    const printContainer = clonedDoc.querySelector('.print-container') as HTMLElement | null;
    if (printContainer) {
      let curr: HTMLElement | null = printContainer;
      while (curr) {
        curr.classList.remove('no-print');
        curr.style.display = 'block';
        curr.style.visibility = 'visible';
        curr.style.opacity = '1';
        curr.style.overflow = 'visible';
        curr.style.maxHeight = 'none';
        curr.style.height = 'auto';
        curr.style.zoom = '1';
        curr.style.transform = 'none';
        curr = curr.parentElement;
      }
    }

    // 5. Inject the sanitized stylesheet rules + Official Governmental Deep Navy Report Override into clonedDoc.head
    const masterStyle = clonedDoc.createElement('style');
    const sanitizedAllRules = sanitizeCssText(collectedCss.join('\n'));
    masterStyle.textContent = `
      ${sanitizedAllRules}

      .report-modal-overlay,
      .report-modal-dialog,
      .report-scroll-wrapper,
      .report-zoom-wrapper,
      .print-container {
        display: block !important;
        visibility: visible !important;
        opacity: 1 !important;
        overflow: visible !important;
        max-height: none !important;
        height: auto !important;
        zoom: 1 !important;
        transform: none !important;
        background: #ffffff !important;
        direction: rtl !important;
        font-family: 'Cairo', 'Tajawal', 'Segoe UI', Tahoma, sans-serif !important;
      }

      /* Official Governmental Report Table Styling: Deep Navy (#0F2342) Headers with White Bold Text */
      .print-container table {
        display: table !important;
        border-collapse: collapse !important;
        width: 100% !important;
        border: 1.5px solid #0f2342 !important;
        margin-top: 8px !important;
        direction: rtl !important;
      }
      .print-container thead {
        display: table-header-group !important;
      }
      .print-container tbody {
        display: table-row-group !important;
      }
      .print-container tfoot {
        display: table-footer-group !important;
      }
      .print-container tr {
        display: table-row !important;
        page-break-inside: avoid !important;
        break-inside: avoid !important;
      }
      .print-container thead th,
      .print-container th {
        display: table-cell !important;
        background-color: #0f2342 !important;
        color: #ffffff !important;
        -webkit-text-fill-color: #ffffff !important;
        border: 1px solid #1e3a8a !important;
        font-weight: 800 !important;
        padding: 6px 5px !important;
        text-align: center !important;
        vertical-align: middle !important;
      }
      .print-container tbody td {
        display: table-cell !important;
        color: #0f172a !important;
        -webkit-text-fill-color: #0f172a !important;
        border: 1px solid #cbd5e1 !important;
        font-weight: 700 !important;
        padding: 5px 4px !important;
        vertical-align: middle !important;
        word-break: break-word !important;
      }
      .print-container tbody tr:nth-child(odd) td {
        background-color: #ffffff !important;
      }
      .print-container tbody tr:nth-child(even) td {
        background-color: #f8fafc !important;
      }
      .print-container tfoot tr,
      .print-container tfoot td {
        background-color: #dbeafe !important;
        color: #0f2342 !important;
        -webkit-text-fill-color: #0f2342 !important;
        border: 1.5px solid #0f2342 !important;
        font-weight: 900 !important;
        padding: 6px 5px !important;
      }
      .print-container .no-print {
        display: none !important;
      }
    `;
    clonedDoc.head.appendChild(masterStyle);

    // 6. Sanitize any inline style attributes containing oklch/oklab or CSS zoom
    const allElements = clonedDoc.querySelectorAll('*');
    allElements.forEach((el) => {
      const htmlEl = el as HTMLElement;
      const styleAttr = htmlEl.getAttribute('style');
      if (styleAttr) {
        let updatedStyle = styleAttr;
        if (updatedStyle.includes('oklch') || updatedStyle.includes('oklab') || updatedStyle.includes('color-mix')) {
          updatedStyle = sanitizeCssText(updatedStyle);
        }
        if (updatedStyle.includes('zoom')) {
          updatedStyle = updatedStyle.replace(/zoom\s*:\s*[^;]+;?/gi, 'zoom: 1;');
        }
        htmlEl.setAttribute('style', updatedStyle);
      }
    });
  } catch (err) {
    console.warn('PDF CSS sanitizer warning:', err);
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
    window.print();
    return;
  }

  const size = (options?.paperSize || 'a4').toUpperCase();
  const orient = options?.orientation || 'landscape';
  const marginMm =
    options?.margins === 'narrow' ? '5mm' : options?.margins === 'wide' ? '15mm' : '10mm';

  try {
    let iframe = document.getElementById('report-fast-print-iframe') as HTMLIFrameElement | null;
    if (!iframe) {
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
    }

    const iframeDoc = iframe.contentWindow?.document;
    if (!iframeDoc) {
      window.print();
      return;
    }

    const cloned = element.cloneNode(true) as HTMLElement;
    cloned.querySelectorAll('.no-print').forEach((n) => n.remove());

    iframeDoc.open();
    iframeDoc.write(`
      <!DOCTYPE html>
      <html dir="rtl" lang="ar">
      <head>
        <meta charset="utf-8">
        <title>${documentTitle}</title>
        <link href="https://fonts.googleapis.com/css2?family=Cairo:wght@500;600;700;800;900&display=swap" rel="stylesheet">
        <style>
          @page {
            size: ${size} ${orient};
            margin: ${marginMm};
          }
          * {
            box-sizing: border-box;
            font-family: 'Cairo', 'Tajawal', 'Segoe UI', Tahoma, sans-serif !important;
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
          }
          html, body {
            margin: 0 !important;
            padding: 0 !important;
            width: 100% !important;
            background: #ffffff !important;
            color: #0f172a !important;
            direction: rtl !important;
            font-weight: 700 !important;
          }
          .no-print {
            display: none !important;
          }
          .print-container {
            width: 100% !important;
            max-width: 100% !important;
            margin: 0 !important;
            padding: 2mm !important;
            background: #ffffff !important;
            color: #0f172a !important;
          }
          table {
            width: 100% !important;
            border-collapse: collapse !important;
            table-layout: auto !important;
            page-break-inside: auto;
            border: 1.5px solid #0f2342 !important;
            margin-top: 8px !important;
            direction: rtl !important;
          }
          tr {
            page-break-inside: avoid !important;
            break-inside: avoid !important;
            page-break-after: auto;
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
          th {
            background-color: #0f2342 !important;
            color: #ffffff !important;
            -webkit-text-fill-color: #ffffff !important;
            border: 1px solid #1e3a8a !important;
            font-weight: 800 !important;
            padding: 6px 5px !important;
            text-align: center !important;
            vertical-align: middle !important;
          }
          td {
            border: 1px solid #cbd5e1 !important;
            color: #0f172a !important;
            padding: 5px 4px !important;
            word-break: break-word !important;
            line-height: 1.3 !important;
            text-align: center !important;
            vertical-align: middle !important;
            font-weight: 700 !important;
          }
          .text-right {
            text-align: right !important;
          }
          .report-font-compact th, .report-font-compact td { font-size: 7.5pt !important; }
          .report-font-standard th, .report-font-standard td { font-size: 8.5pt !important; }
          .report-font-large th, .report-font-large td { font-size: 9.5pt !important; }
          tbody tr:nth-child(odd) td {
            background-color: #ffffff !important;
          }
          tbody tr:nth-child(even) td {
            background-color: #f8fafc !important;
          }
          tfoot tr, tfoot td {
            background-color: #dbeafe !important;
            color: #0f2342 !important;
            -webkit-text-fill-color: #0f2342 !important;
            font-weight: 900 !important;
            border: 1.5px solid #0f2342 !important;
          }
          .num-enlarged {
            font-weight: 800 !important;
          }
          img {
            max-width: 52px !important;
            max-height: 52px !important;
            object-fit: contain !important;
          }
        </style>
      </head>
      <body class="${fontClass}">
        <div class="print-container">
          ${cloned.innerHTML}
        </div>
      </body>
      </html>
    `);
    iframeDoc.close();

    setTimeout(() => {
      try {
        iframe?.contentWindow?.focus();
        iframe?.contentWindow?.print();
      } catch {
        window.print();
      }
    }, 220);
  } catch {
    window.print();
  }
}

// Universal Standalone PDF Exporter with Arabic RTL support, progress feedback, and safe naming
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
      : [7, 7, 7, 7];

  options.onProgress?.('جاري تجهيز الخطوط العربية وتنسيق الصفحات...');
  sanitizeLiveStylesheets();

  const win = window as unknown as {
    html2pdf?: () => {
      from: (el: HTMLElement) => { set: (o: any) => { save: () => Promise<void> } };
    };
    loadHtml2PdfOnDemand?: () => Promise<any>;
  };

  if (typeof win.html2pdf !== 'function' && typeof win.loadHtml2PdfOnDemand === 'function') {
    try {
      options.onProgress?.('جاري تحميل محرك تصدير PDF...');
      await win.loadHtml2PdfOnDemand();
    } catch (e) {
      console.warn('html2pdf dynamic loading notice:', e);
    }
  }

  const opt = {
    margin: marginArr,
    filename: finalFilename,
    image: { type: 'jpeg', quality: 0.96 },
    pagebreak: { mode: ['avoid-all', 'css', 'legacy'] },
    html2canvas: {
      scale: 1.6,
      useCORS: true,
      logging: false,
      backgroundColor: '#ffffff',
      windowWidth: paperSize === 'a3' ? 1800 : 1440,
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
      options.onProgress?.('جاري توليد ملف PDF باللغة العربية...');
      const pdfTask = win.html2pdf().from(element).set(opt).save();
      const timeoutTask = new Promise<void>((_, reject) =>
        setTimeout(() => reject(new Error('PDF generation timed out')), 12000)
      );
      await Promise.race([pdfTask, timeoutTask]);
      options.onProgress?.('تم استخراج وتنزيل ملف PDF بنجاح');
      return true;
    } catch (err) {
      console.warn('PDF generation fallback to print preview:', err);
      printHtmlElementA4(element, rawTitle, options.fontClass || 'report-font-standard', {
        paperSize,
        orientation,
        margins: options.margins,
      });
      return true;
    }
  } else {
    printHtmlElementA4(element, rawTitle, options.fontClass || 'report-font-standard', {
      paperSize,
      orientation,
      margins: options.margins,
    });
    return true;
  }
}
