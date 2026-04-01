import multer from "multer";

// Menggunakan memoryStorage agar file disimpan di buffer, bukan di disk.
// Ini penting untuk lingkungan serverless seperti Vercel.
const storage = multer.memoryStorage();

// Filter untuk memastikan hanya tipe file tertentu yang diizinkan.
const fileFilter = (req, file, cb) => {
  // Izinkan gambar dan PDF. Anda bisa menambahkan tipe file lain di sini.
  if (file.mimetype.startsWith("image/") || file.mimetype === 'application/pdf') {
    cb(null, true);
  } else {
    cb(new Error("Tipe file tidak didukung. Hanya gambar dan PDF yang diperbolehkan."), false);
  }
};

// Konfigurasi multer dengan storage dan file filter.
// Tambahkan batas ukuran file jika diperlukan, misalnya 5MB.
export const upload = multer({ 
  storage, 
  fileFilter,
  limits: { fileSize: 1024 * 1024 * 5 } // 5 MB limit
});
