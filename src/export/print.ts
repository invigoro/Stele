/** One image to print, and its real size. */
export interface PrintPage {
  blob: Blob;
  widthMm: number;
  heightMm: number;
}

/**
 * Prints images at their real size, one per sheet of paper, turning the paper to suit
 * their shape and shrinking one only if it still wouldn't fit. Uses the #print-sheet
 * element, which only shows when printing.
 */
export async function printImages(pages: readonly PrintPage[]): Promise<void> {
  const sheet = document.getElementById('print-sheet');
  if (!sheet || pages.length === 0) throw new Error('index.html is missing #print-sheet');
  const urls = pages.map((page) => URL.createObjectURL(page.blob));
  const images = pages.map((page, i) => {
    const image = document.createElement('img');
    image.alt = '';
    image.style.width = `${page.widthMm}mm`;
    image.style.height = `${page.heightMm}mm`;
    image.src = urls[i];
    return image;
  });
  sheet.replaceChildren(...images);
  const style = document.createElement('style');
  const landscape = pages[0].widthMm > pages[0].heightMm;
  style.textContent = `@page { size: ${landscape ? 'landscape' : 'portrait'}; margin: 10mm; }`;
  document.head.append(style);
  const cleanUp = () => {
    style.remove();
    sheet.replaceChildren();
    for (const url of urls) URL.revokeObjectURL(url);
  };
  try {
    await Promise.all(images.map((image) => image.decode()));
    window.print();
  } finally {
    // Some browsers return from print() before printing finishes; let them read the images first.
    window.addEventListener('afterprint', cleanUp, { once: true });
    setTimeout(cleanUp, 60_000);
  }
}
