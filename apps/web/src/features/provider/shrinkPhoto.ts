// Phone cameras save 2 to 5 MB photos. Shrinking them before upload saves farmers' data and keeps
// most photos under the API's 5 MB limit (decision 66); farmers see them at phone width.
const MAX_EDGE_PX = 1600;
const JPEG_QUALITY = 0.82;

const loadBitmap = async (file: Blob) => {
  try {
    return await createImageBitmap(file);
  } catch {
    // A file the browser cannot decode goes up as it is, and the API's type check answers for it.
    return undefined;
  }
};

const encodeJpeg = (canvas: HTMLCanvasElement) =>
  new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', JPEG_QUALITY));

/** A smaller JPEG of the photo, or the photo itself when the browser cannot make a smaller one. */
export const shrinkPhoto = async (file: Blob): Promise<Blob> => {
  if (typeof createImageBitmap !== 'function') return file;
  const bitmap = await loadBitmap(file);
  if (!bitmap) return file;

  const scale = Math.min(1, MAX_EDGE_PX / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  const context = canvas.getContext('2d');
  if (!context) {
    bitmap.close();
    return file;
  }
  // JPEG has no transparency, so a PNG's clear areas would otherwise turn black.
  context.fillStyle = 'white';
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();

  const shrunk = await encodeJpeg(canvas);
  return shrunk && shrunk.size < file.size ? shrunk : file;
};
