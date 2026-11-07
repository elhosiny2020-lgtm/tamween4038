/**
 * Utility to sanitize CSS Color 4 functions (oklch, oklab, lch, lab, color, color-mix)
 * into standard rgb() / rgba() values so html2canvas / html2pdf.js can render without errors.
 */

let sharedCanvasCtx: CanvasRenderingContext2D | null = null;

function getCanvasContext(): CanvasRenderingContext2D | null {
  if (sharedCanvasCtx) return sharedCanvasCtx;
  if (typeof document === 'undefined') return null;
  const canvas = document.createElement('canvas');
  canvas.width = 1;
  canvas.height = 1;
  sharedCanvasCtx = canvas.getContext('2d', { willReadFrequently: true });
  return sharedCanvasCtx;
}

const colorCache = new Map<string, string>();

/**
 * Converts a single CSS color token (e.g. oklch(...), oklab(...), color(srgb ...))
 * into standard rgb(r, g, b) or rgba(r, g, b, a) using a 1x1 2D canvas pixel read.
 */
export function convertColorTokenToRgb(token: string): string {
  const trimmed = token.trim();
  const cached = colorCache.get(trimmed);
  if (cached) return cached;

  const ctx = getCanvasContext();
  if (!ctx) return 'rgb(0, 0, 0)';

  try {
    ctx.clearRect(0, 0, 1, 1);
    // Reset to transparent black first to detect invalid assignments
    ctx.fillStyle = 'rgba(0, 0, 0, 0)';
    ctx.fillStyle = trimmed;
    ctx.fillRect(0, 0, 1, 1);
    const data = ctx.getImageData(0, 0, 1, 1).data;
    const r = data[0];
    const g = data[1];
    const b = data[2];
    const a = data[3];

    let result: string;
    if (a === 0) {
      result = 'rgba(0, 0, 0, 0)';
    } else if (a === 255) {
      result = `rgb(${r}, ${g}, ${b})`;
    } else {
      result = `rgba(${r}, ${g}, ${b}, ${ Number((a / 255).toFixed(3)) })`;
    }

    colorCache.set(trimmed, result);
    return result;
  } catch {
    return 'rgb(0, 0, 0)';
  }
}

const UNSUPPORTED_COLOR_REGEX = /(?:oklch|oklab|lch|lab|color)\([^)]+\)/gi;
const GRADIENT_INTERPOLATION_REGEX = /\s+in\s+(?:oklab|oklch|srgb-linear|display-p3|srgb|hsl|hwb|lch|lab)(?:\s+(?:shorter|longer|increasing|decreasing)\s+hue)?/gi;

/**
 * Sanitizes any CSS property value string that may contain oklch(), oklab(), color(),
 * or gradient color-space interpolation (e.g. "linear-gradient(to right in oklab, ...)").
 */
export function sanitizeCssValue(value: string): string {
  if (!value) return value;
  const lower = value.toLowerCase();
  if (
    !lower.includes('oklch') &&
    !lower.includes('oklab') &&
    !lower.includes('lch(') &&
    !lower.includes('lab(') &&
    !lower.includes('color(') &&
    !lower.includes('color-mix(')
  ) {
    return value;
  }

  let sanitized = value.replace(GRADIENT_INTERPOLATION_REGEX, '');
  sanitized = sanitized.replace(UNSUPPORTED_COLOR_REGEX, (match) => convertColorTokenToRgb(match));

  // Also handle any remaining color-mix(...) without nested parens
  if (sanitized.toLowerCase().includes('color-mix(')) {
    sanitized = sanitized.replace(/color-mix\([^()]+\)/gi, (match) => convertColorTokenToRgb(match));
  }

  return sanitized;
}

const COLOR_PROPERTIES = [
  'color',
  'background-color',
  'background-image',
  'border-top-color',
  'border-right-color',
  'border-bottom-color',
  'border-left-color',
  'outline-color',
  'text-decoration-color',
  'column-rule-color',
  'caret-color',
  '-webkit-text-stroke-color',
  '-webkit-text-fill-color',
  'box-shadow',
  'text-shadow',
  'fill',
  'stroke',
  'stop-color',
  'flood-color',
  'lighting-color',
];

/**
 * Sanitizes a cloned Document (used inside html2canvas's onclone callback)
 * by rewriting stylesheets and inlining resolved RGB styles on all elements.
 */
export function sanitizeClonedDocumentForPdf(clonedDoc: Document): void {
  // 1. Sanitize all <style> elements in the cloned document
  const styleElements = clonedDoc.querySelectorAll('style');
  styleElements.forEach((styleEl) => {
    if (styleEl.textContent) {
      styleEl.textContent = sanitizeCssValue(styleEl.textContent);
    }
  });

  // 2. Walk every element in the cloned document and inline RGB values for any property using oklch/oklab/color()
  const win = clonedDoc.defaultView || window;
  const allElements: HTMLElement[] = [
    clonedDoc.documentElement as HTMLElement,
    clonedDoc.body as HTMLElement,
    ...Array.from(clonedDoc.querySelectorAll<HTMLElement>('*')),
  ].filter(Boolean);

  allElements.forEach((el) => {
    if (!el || !el.style) return;
    const computed = win.getComputedStyle(el);

    for (const prop of COLOR_PROPERTIES) {
      const val = computed.getPropertyValue(prop);
      if (!val) continue;
      const lower = val.toLowerCase();
      if (
        lower.includes('oklch') ||
        lower.includes('oklab') ||
        lower.includes('lch(') ||
        lower.includes('lab(') ||
        lower.includes('color(') ||
        lower.includes('color-mix(')
      ) {
        const cleanVal = sanitizeCssValue(val);
        el.style.setProperty(prop, cleanVal, 'important');
      }
    }
  });
}

/**
 * Sanitizes live <style> tags in the main document so that even before onclone runs,
 * getComputedStyle in the main document resolves to standard RGB colors.
 */
export function sanitizeLiveStylesheets(): void {
  if (typeof document === 'undefined') return;
  const styleElements = document.querySelectorAll('style');
  styleElements.forEach((styleEl) => {
    const content = styleEl.textContent;
    if (
      content &&
      (content.includes('oklch') || content.includes('oklab') || content.includes('in oklab'))
    ) {
      styleEl.textContent = sanitizeCssValue(content);
    }
  });
}
