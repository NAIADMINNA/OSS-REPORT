import { toPng } from 'html-to-image';

let cachedFontEmbedCSS: string | null = null;
let fontFetchPromise: Promise<string> | null = null;

const GOOGLE_FONTS_CSS_URL =
  'https://fonts.googleapis.com/css2?family=Prompt:ital,wght@0,300;0,400;0,500;0,600;0,700;0,800;0,900;1,400&family=Sarabun:ital,wght@0,300;0,400;0,500;0,600;0,700;0,800;1,400&display=swap';

function blobToDataURL(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      if (typeof reader.result === 'string') {
        resolve(reader.result);
      } else {
        reject(new Error('Failed to convert font blob to data URL'));
      }
    };
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

/**
 * Fetches Google Fonts (Prompt & Sarabun) and embeds all font files as base64 data URLs.
 * Prevents html-to-image SecurityError while ensuring 100% accurate Thai glyph metrics in SVG foreignObject.
 */
export async function getEmbeddedGoogleFontsCSS(): Promise<string> {
  if (cachedFontEmbedCSS !== null) {
    return cachedFontEmbedCSS;
  }
  if (fontFetchPromise) {
    return fontFetchPromise;
  }

  fontFetchPromise = (async () => {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000);

      const cssResponse = await fetch(GOOGLE_FONTS_CSS_URL, {
        signal: controller.signal,
      });
      clearTimeout(timeoutId);

      if (!cssResponse.ok) {
        return '';
      }

      let cssText = await cssResponse.text();
      const urlRegex = /url\((['"]?)(https:\/\/[^)'"]+)\1\)/g;
      const matches = Array.from(cssText.matchAll(urlRegex));

      const uniqueUrls = Array.from(new Set(matches.map((m) => m[2])));
      const urlToDataMap = new Map<string, string>();

      await Promise.all(
        uniqueUrls.map(async (fontUrl) => {
          try {
            const fontRes = await fetch(fontUrl);
            if (fontRes.ok) {
              const blob = await fontRes.blob();
              const dataUrl = await blobToDataURL(blob);
              urlToDataMap.set(fontUrl, dataUrl);
            }
          } catch {
            // Ignore individual font file failure
          }
        })
      );

      for (const [fontUrl, dataUrl] of urlToDataMap.entries()) {
        cssText = cssText.split(fontUrl).join(dataUrl);
      }

      cachedFontEmbedCSS = cssText;
      return cssText;
    } catch {
      return '';
    } finally {
      fontFetchPromise = null;
    }
  })();

  return fontFetchPromise;
}

/**
 * Captures the poster DOM node to a high-resolution PNG Data URL with embedded Thai fonts
 * and normalized 780px dimensions regardless of current preview zoom scale.
 */
export async function capturePosterToPng(
  element: HTMLElement,
  pixelRatio = 2
): Promise<string> {
  if (typeof document !== 'undefined' && document.fonts?.ready) {
    try {
      await document.fonts.ready;
    } catch {
      // ignore
    }
  }

  const fontEmbedCSS = await getEmbeddedGoogleFontsCSS();
  const width = 780;
  const height = Math.max(element.scrollHeight || 0, element.offsetHeight || 0, 1100);

  try {
    return await toPng(element, {
      cacheBust: true,
      pixelRatio,
      width,
      height,
      style: {
        transform: 'none',
        transformOrigin: 'top center',
        width: `${width}px`,
        minWidth: `${width}px`,
        maxWidth: `${width}px`,
      },
      ...(fontEmbedCSS
        ? { fontEmbedCSS, skipFonts: false }
        : { skipFonts: true }),
    });
  } catch (firstErr) {
    console.warn('Initial poster capture failed, retrying with fallback options...', firstErr);
    return await toPng(element, {
      cacheBust: false,
      pixelRatio: 1.5,
      width,
      height,
      style: {
        transform: 'none',
        width: `${width}px`,
      },
      skipFonts: true,
    });
  }
}
