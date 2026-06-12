import { base44 } from "@/api/base44Client";

const MAX_FILE_SIZE_MB = 10;
const UPLOAD_TIMEOUT_MS = 45000; // 45 seconds

/**
 * Upload a file to Cloudflare R2 via the uploadToR2 backend function.
 * Returns { file_url: string }
 * Throws a typed error with .code for caller to display user-friendly messages.
 */
export async function uploadFile(file, { timeoutMs = UPLOAD_TIMEOUT_MS } = {}) {
  // File size validation
  if (file.size > MAX_FILE_SIZE_MB * 1024 * 1024) {
    const err = new Error(`This file is too large. Please upload a file under ${MAX_FILE_SIZE_MB}MB.`);
    err.code = "FILE_TOO_LARGE";
    throw err;
  }

  // MIME type validation
  const allowed = ["image/jpeg", "image/jpg", "image/png", "image/webp", "application/pdf"];
  if (!allowed.includes(file.type)) {
    const err = new Error("Please upload a JPG, PNG, WebP, or PDF file.");
    err.code = "UNSUPPORTED_FORMAT";
    throw err;
  }

  // Read file with timeout
  const base64 = await new Promise((resolve, reject) => {
    const reader = new FileReader();
    const timer = setTimeout(() => {
      reader.abort();
      const err = new Error("File read timed out. Please try again.");
      err.code = "READ_TIMEOUT";
      reject(err);
    }, 10000);
    reader.onload = () => { clearTimeout(timer); resolve(reader.result); };
    reader.onerror = () => { clearTimeout(timer); const err = new Error("Failed to read file. Please try a different file."); err.code = "READ_ERROR"; reject(err); };
    reader.readAsDataURL(file);
  });

  // Upload with timeout
  const uploadPromise = base44.functions.invoke("uploadToR2", {
    fileBase64: base64,
    fileName: file.name,
    fileType: file.type,
  });
  const timeoutPromise = new Promise((_, reject) => {
    setTimeout(() => {
      const err = new Error("Your upload is taking longer than expected. Please check your connection and try again.");
      err.code = "UPLOAD_TIMEOUT";
      reject(err);
    }, timeoutMs);
  });

  const res = await Promise.race([uploadPromise, timeoutPromise]);
  if (!res.data?.file_url) {
    const err = new Error(res.data?.error || "Storage upload failed. Please try again.");
    err.code = "STORAGE_FAILED";
    throw err;
  }
  return { file_url: res.data.file_url };
}