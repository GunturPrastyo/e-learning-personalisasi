import { put } from "@vercel/blob";

/**
 * @desc    Upload image for rich text editor
 * @route   POST /api/upload/image
 * @access  Private/Admin
 */
export const uploadImage = async (req, res) => {
  try {
    if (req.file) {
      const originalName = req.file.originalname || `image-${Date.now()}`;
      const blobName = `uploads/${Date.now()}-${originalName}`;
      
      const { url } = await put(blobName, req.file.buffer, { 
        access: 'public',
        contentType: req.file.mimetype,
      });

      res.status(200).json({
        imageUrl: url,
      });
    } else {
      res.status(400).json({ message: "Gagal mengunggah gambar, tidak ada file yang diterima." });
    }
  } catch (error) {
    console.error("Error uploading image to Vercel Blob:", error);
    res.status(500).json({ message: "Gagal mengunggah gambar ke server." });
  }
};