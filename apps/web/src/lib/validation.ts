export const MAX_UPLOAD_BYTES = 15 * 1024 * 1024;
export const ALLOWED_UPLOAD_EXTENSIONS = ['.pptx', '.pdf', '.md', '.txt'] as const;

export type UploadValidationResult =
  | { ok: true; extension: string }
  | { ok: false; code: 'UNSUPPORTED_FILE_TYPE' | 'FILE_TOO_LARGE'; message: string };

/**
 * Validates presentation file extension and 15 MB client cap before reading/uploading.
 */
export function validatePresentationUploadFile(file: {
  name: string;
  size: number;
}): UploadValidationResult {
  const lower = file.name.trim().toLowerCase();
  const matchedExt = ALLOWED_UPLOAD_EXTENSIONS.find((ext) => lower.endsWith(ext));
  if (!matchedExt) {
    return {
      ok: false,
      code: 'UNSUPPORTED_FILE_TYPE',
      message: `不支持的文件格式（${file.name || '未知文件'}）。仅支持 .pptx、.pdf、.md、.txt 文档。`,
    };
  }
  if (file.size > MAX_UPLOAD_BYTES) {
    const mb = (file.size / (1024 * 1024)).toFixed(2);
    return {
      ok: false,
      code: 'FILE_TOO_LARGE',
      message: `文件体积 (${mb} MB) 超出 15 MB 上限，请精简后再上传或直接粘贴文本。`,
    };
  }
  return { ok: true, extension: matchedExt };
}
