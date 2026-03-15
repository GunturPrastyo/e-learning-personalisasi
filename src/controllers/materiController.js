import Materi from '../models/Materi.js';
import Topik from '../models/Topik.js';

// [GET] Mengambil Materi berdasarkan Modul Slug dan Topik Slug
export const getMateriByTopik = async (req, res) => {
  try {
    const { slug, topikSlug } = req.params;

    // Cari topik terlebih dahulu untuk mendapatkan ID-nya
    const topik = await Topik.findOne({ slug: topikSlug });
    
    if (!topik) {
      return res.status(404).json({ message: "Topik tidak ditemukan" });
    }

    // Cari materi berdasarkan topikId
    const materi = await Materi.findOne({ topikId: topik._id });

    if (!materi) {
      return res.status(404).json({ 
        message: "Materi belum ada", 
        topikId: topik._id 
      });
    }

    res.status(200).json(materi);
  } catch (error) {
    console.error("Error fetching materi:", error);
    res.status(500).json({ message: "Terjadi kesalahan pada server" });
  }
};

// [POST] Menyimpan atau Memperbarui Materi (Upsert)
export const saveMateri = async (req, res) => {
  try {
    const { topikId, subMateris, youtube, practices } = req.body;

    if (!topikId) {
      return res.status(400).json({ message: "topikId sangat diperlukan" });
    }

    // Dapatkan modulId dari Topik jika tidak dikirim dari frontend, ini dibutuhkan oleh skema Materi
    const topik = await Topik.findById(topikId);
    if (!topik) {
        return res.status(404).json({ message: "Topik tidak ditemukan" });
    }

    const materi = await Materi.findOneAndUpdate(
      { topikId },
      {
        topikId,
        modulId: topik.modulId,
        subMateris,
        youtube,
        practices
      },
      { new: true, upsert: true, runValidators: true }
    );

    res.status(200).json({ message: "Materi berhasil disimpan", materi });
  } catch (error) {
    console.error("Error saving materi:", error);
    res.status(500).json({ message: "Terjadi kesalahan saat menyimpan materi" });
  }
};