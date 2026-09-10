/* Document Vault file storage — Cloudinary rather than local disk,
   since the backend runs on Render.com whose local filesystem is not
   persistent across deploys/restarts. Requires CLOUDINARY_CLOUD_NAME/
   API_KEY/API_SECRET in .env (see README note in the plan/chat). */
import { v2 as cloudinary } from 'cloudinary';

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

export function isCloudinaryConfigured() {
  return !!(process.env.CLOUDINARY_CLOUD_NAME && process.env.CLOUDINARY_API_KEY && process.env.CLOUDINARY_API_SECRET);
}

/* uploads a buffer (from multer's memory storage) as a raw/auto
   resource under a per-customer folder, returns { url, publicId }. */
export function uploadBuffer(buffer, { folder, filename }) {
  return new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      { folder, public_id: filename, resource_type: 'auto', overwrite: true },
      (err, result) => {
        if (err) return reject(err);
        resolve({ url: result.secure_url, publicId: result.public_id });
      }
    );
    stream.end(buffer);
  });
}

export function deleteAsset(publicId) {
  if (!publicId) return Promise.resolve();
  return cloudinary.uploader.destroy(publicId, { resource_type: 'auto' }).catch(() => {});
}
