// Helper to sanitize modern CSS color functions (oklch, oklab, color-mix, light-dark)
// in live and cloned documents before html2canvas parses stylesheets, preventing PDF export crashes,
// and enforcing pure black (#000000) text for all report elements.

function createColorConverter() {
  const canvas = document.createElement('canvas');
  canvas.width = 1;
  canvas.height = 1;
  const ctx = canvas.getContext('2d');
  const colorCache = new Map<string, string>();

  const convertColorToRgb = (colorStr: string): string => {
    if (colorCache.has(colorStr)) return colorCache.get(colorStr)!;
    if (!ctx) return '#000000';
    try {
      ctx.clearRect(0, 0, 1, 1);
      ctx.fillStyle = '#000000';
      ctx.fillStyle = colorStr;
      const computed = ctx.fillStyle;
      if (computed && !computed.includes('oklch') && !computed.includes('oklab')) {
        colorCache.set(colorStr, computed);
        return computed;
      }
    } catch {
      // fallback
    }
    colorCache.set(colorStr, '#000000');
    return '#000000';
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

    // 1. Collect all rules from document.styleSheets (including external <link rel="stylesheet"> in production builds)
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

    // 4. Inject the sanitized stylesheet rules + strict pure black (#000000) report override into clonedDoc.head
    const masterStyle = clonedDoc.createElement('style');
    const sanitizedAllRules = sanitizeCssText(collectedCss.join('\n'));
    masterStyle.textContent = `
      ${sanitizedAllRules}

      /* Strict PDF Report Override: Pure Black (#000000) Text & Crisp Borders */
      .print-container,
      .print-container * {
        color: #000000 !important;
        -webkit-text-fill-color: #000000 !important;
        text-shadow: none !important;
      }
      .print-container {
        background-color: #ffffff !important;
        zoom: 1 !important;
        transform: none !important;
      }
      .print-container table {
        border-collapse: collapse !important;
        width: 100% !important;
        border: 1.5px solid #000000 !important;
      }
      .print-container th {
        background-color: #e2e8f0 !important;
        color: #000000 !important;
        border: 1px solid #000000 !important;
        font-weight: 900 !important;
      }
      .print-container td {
        color: #000000 !important;
        border: 1px solid #000000 !important;
        font-weight: 700 !important;
      }
      .print-container tfoot tr,
      .print-container tfoot td {
        background-color: #cbd5e1 !important;
        color: #000000 !important;
        border: 1.5px solid #000000 !important;
        font-weight: 900 !important;
      }
      .no-print {
        display: none !important;
      }
    `;
    clonedDoc.head.appendChild(masterStyle);

    // 5. Sanitize any inline style attributes containing oklch/oklab or CSS zoom
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
