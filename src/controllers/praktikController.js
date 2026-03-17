import Materi from "../models/Materi.js";
import vm from "vm";

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

export const runPractice = async (req, res) => {
  try {
    const { practiceId, code, type } = req.body;

    // Cari materi yang memiliki practice dengan ID tersebut
    const materi = await Materi.findOne({ "practices._id": practiceId });
    if (!materi) {
      return res.status(404).json({ message: "Praktik tidak ditemukan." });
    }

    // Ambil detail praktik yang spesifik
    const practice = materi.practices.find(p => p._id.toString() === practiceId);
    
    let isAnswerCorrect = false;
    let outputLogs = [];

    // Fungsi validasi berdasarkan Regex/Keyword
    const validateCode = (codeToCheck, logs) => {
      if (!practice.expectedOutputRegex || practice.expectedOutputRegex.length === 0) return true;
      
      const normalizedCode = codeToCheck.replace(/\s+/g, '').toLowerCase();
      const joinedLogs = logs.join(' ').replace(/\s+/g, '').toLowerCase();

      return practice.expectedOutputRegex.every(keyword => {
        const normalizedKeyword = keyword.replace(/\s+/g, '').toLowerCase();
        return normalizedCode.includes(normalizedKeyword) || joinedLogs.includes(normalizedKeyword);
      });
    };

    // Eksekusi jika Javascript
    if (type === 'javascript') {
      const sandbox = {
        console: {
          log: (...args) => outputLogs.push(args.map(a => String(a)).join(' ')),
          error: (...args) => outputLogs.push('Error: ' + args.join(' '))
        }
      };
      
      try {
        vm.createContext(sandbox);
        vm.runInContext(code, sandbox, { timeout: 2000 }); // Timeout 2 detik untuk mencegah infinite loop
        
        if (validateCode(code, outputLogs)) {
          isAnswerCorrect = true;
          outputLogs.push("✅ Jawaban Benar!");
        } else {
          outputLogs.push("❌ Jawaban belum tepat. Coba lagi!");
        }
      } catch (err) {
        outputLogs.push(err.toString());
      }
    } else if (type === 'html') {
      // Untuk HTML, kita hanya memvalidasi sintaks yang ditulis
      if (validateCode(code, [])) {
        isAnswerCorrect = true;
      }
    }

    return res.status(200).json({
      isCorrect: isAnswerCorrect,
      output: outputLogs
    });

  } catch (error) {
    console.error("Gagal mengeksekusi praktik:", error);
    return res.status(500).json({ message: "Terjadi kesalahan pada server saat mengeksekusi kode." });
  }
};