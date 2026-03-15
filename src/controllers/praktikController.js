import Materi from "../models/Materi.js";

export const getPraktikByTopicId = async (req, res) => {
  try {
    const { topicId } = req.params;
    // Karena practices adalah array di dalam model Materi
    const materi = await Materi.findOne({ topikId: topicId }).select("practices");
    
    if (!materi || !materi.practices) {
      return res.status(200).json([]);
    }

    res.status(200).json(materi.practices);
  } catch (error) {
    console.error("Gagal mengambil data praktik:", error);
    res.status(500).json({ message: "Terjadi kesalahan server" });
  }
};