import { GoogleGenerativeAI } from "@google/generative-ai";

export const askAITutor = async (req, res) => {
  try {
    const { question, context } = req.body;

    if (!question || !context) {
      return res.status(400).json({ message: "Pertanyaan dan konteks materi harus disertakan." });
    }

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return res.status(500).json({ message: "Konfigurasi API Key Gemini tidak ditemukan." });
    }

    // Inisialisasi Google Generative AI
    const genAI = new GoogleGenerativeAI(apiKey);

    const model = genAI.getGenerativeModel({
      model: "gemini-2.5-flash",
      systemInstruction: `Kamu adalah asisten tutor E-Learning yang sangat ramah dan sabar. 
Tugas utamamu adalah menjawab pertanyaan siswa HANYA berdasarkan 'Konteks Materi' yang diberikan.
ATURAN:
1. Jika pertanyaan siswa BISA dijawab menggunakan informasi dari 'Konteks Materi', jawablah dengan jelas dan mudah dipahami.
2. Jika siswa bertanya sesuatu yang TIDAK ADA hubungannya atau di luar dari 'Konteks Materi', tolak dengan sopan. Gunakan kalimat seperti: "Maaf ya, untuk saat ini saya hanya bisa membantu menjawab pertanyaan seputar materi yang sedang kamu pelajari ini."
3. Jangan pernah memberikan informasi dari pengetahuan umummu sendiri jika itu melenceng jauh dari materi.
4. Pastikan jawabanmu diformat menggunakan Markdown. Jika kamu perlu memberikan contoh kode, wajib gunakan markdown code blocks (\`\`\`language ... \`\`\`).`,
    });

    const prompt = `Konteks Materi:\n"""\n${context}\n"""\n\nPertanyaan Siswa: ${question}`;

    const result = await model.generateContent(prompt);
    const response = await result.response;
    const text = response.text();

    return res.status(200).json({ answer: text });
  } catch (error) {
    console.error("Error memanggil AI Tutor:", error);
    return res.status(500).json({ 
      message: "Terjadi kesalahan pada server saat menghubungi tutor AI.",
      detail: error.message || error.toString() 
    });
  }
};