/**
 * How the editor sends a chosen file. Locally it goes in the save request itself. On
 * Vercel a request can't carry more than 4.5 MB, so the file first goes from the browser
 * straight to the private Blob store (uploads/tmp/), and the save carries a reference to it;
 * the server takes it from there (src/cms/api.ts › toFile) and deletes the temporary copy.
 */
import { upload } from '@vercel/blob/client';

let direct = false;
export const useDirectUploads = (on: boolean) => {
  direct = on;
};

/** The form value for a file: the file itself, or a reference to its uploaded copy */
export async function formValue(file: File): Promise<File | string> {
  if (!direct) return file;
  const blob = await upload(`uploads/tmp/${file.name}`, file, {
    access: 'private',
    handleUploadUrl: '/admin/api/upload',
    multipart: file.size > 8 * 1024 * 1024,
    contentType: file.type || undefined,
  });
  return JSON.stringify({ pathname: blob.pathname, name: file.name, type: file.type });
}
