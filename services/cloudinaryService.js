const streamifier = require("streamifier");
const cloudinary = require("../config/cloudinary");

exports.uploadBufferToCloudinary = (buffer, folder) => {
  return new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      { folder, resource_type: "image" },
      (error, result) => {
        if (error) return reject(error);
        resolve(result); // has .secure_url and .public_id
      }
    );
    streamifier.createReadStream(buffer).pipe(stream);
  });
};

exports.deleteFromCloudinary = async (publicId) => {
  if (!publicId) return;
  try {
    await cloudinary.uploader.destroy(publicId);
  } catch (err) {
    console.error("[cloudinary destroy]", err);
  }
};