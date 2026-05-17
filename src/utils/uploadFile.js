import { base44 } from "@/api/base44Client";

/**
 * Upload a file to Cloudflare R2 via the uploadToR2 backend function.
 * Replaces base44.integrations.Core.UploadFile() — zero integration credits used.
 * Returns { file_url: string }
 */
export async function uploadFile(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = async () => {
      try {
        const res = await base44.functions.invoke("uploadToR2", {
          fileBase64: reader.result, // includes data:mime;base64, prefix — backend strips it
          fileName: file.name,
          fileType: file.type,
        });
        if (!res.data?.file_url) throw new Error(res.data?.error || "Upload failed");
        resolve({ file_url: res.data.file_url });
      } catch (err) {
        reject(err);
      }
    };
    reader.onerror = () => reject(new Error("Failed to read file"));
    reader.readAsDataURL(file);
  });
}