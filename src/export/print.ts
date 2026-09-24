/**
 * Prints an image at its real size (`widthMm` × `heightMm`), on a page turned to suit
 * its shape, shrinking it only if it still wouldn't fit. Uses the #print-sheet element,
 * which only shows when printing.
 */
export async function printImage(blob: Blob, widthMm: number, heightMm: number): Promise<void> {
  const sheet = document.getElementById('print-sheet');
  const image = sheet?.querySelector('img');
  if (!sheet || !image) throw new Error('index.html is missing #print-sheet');
  const url = URL.createObjectURL(blob);
  const page = document.createElement('style');
  page.textContent = `@page { size: ${widthMm > heightMm ? 'landscape' : 'portrait'}; margin: 10mm; }`;
  document.head.append(page);
  const cleanUp = () => {
    page.remove();
    URL.revokeObjectURL(url);
  };
  try {
    image.style.width = `${widthMm}mm`;
    image.style.height = `${heightMm}mm`;
    image.src = url;
    await image.decode();
    window.print();
  } finally {
    // Some browsers return from print() before printing finishes; let them read the image first.
    window.addEventListener('afterprint', cleanUp, { once: true });
    setTimeout(cleanUp, 60_000);
  }
}
