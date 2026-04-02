import asyncHandler from "../middlewares/asyncHandler.js";
import mongoose from "mongoose";
import { PDFDocument, rgb, StandardFonts } from 'pdf-lib';
import path from 'path';
import fs from 'fs';
import * as resultService from '../services/resultService.js';

/**
 * @desc    Simpan hasil tes (Pembuatan manual)
 */
const createResult = async (req, res) => {
  try {
    const { testType, score, correct, total, timeTaken, modulId, totalDuration } = req.body;
    const userId = req.user._id;

    const newResult = await resultService.createTestResult(userId, testType, score, correct, total, timeTaken, modulId, totalDuration);

    res.status(201).json({
      message: "Hasil tes berhasil disimpan.",
      data: newResult,
    });
  } catch (error) {
    console.error("Controller: Gagal menyimpan hasil tes:", error);
    res.status(500).json({ message: "Terjadi kesalahan pada server." });
  }
};

/**
 * @desc    Kirim jawaban tes (pre-test, post-test topik, post-test modul)
 */
const submitTest = async (req, res) => {
  try {
    const userId = req.user._id;
    const { testType, modulId, topikId, answers, timeTaken, answerChanges, tabExits } = req.body;

    const resultDetails = await resultService.submitUserTest(userId, testType, modulId, topikId, answers, timeTaken, answerChanges, tabExits);

    res.status(201).json({
      message: "Jawaban berhasil disubmit.",
      data: resultDetails,
    });
  } catch (error) {
    console.error("Controller: Gagal submit tes:", error);
    res.status(500).json({ message: "Terjadi kesalahan pada server." });
  }
};

/**
 * @desc    Catat waktu belajar untuk sebuah topik
 * @route   POST /api/results/log-study-time
 * @access  Private
 */
const logStudyTime = async (req, res) => {
  try {
    const userId = req.user._id;
    const { topikId, durationInSeconds } = req.body;

    const newResult = await resultService.logUserStudyTime(userId, topikId, durationInSeconds);

    res.status(201).json({ success: true, message: "Waktu belajar berhasil dicatat." });
  } catch (error) {
    console.error("Controller: Gagal mencatat waktu belajar:", error);
    res.status(500).json({ message: "Terjadi kesalahan pada server." });
  }
};

/**
 * @desc    Simpan atau perbarui progres tes pengguna
 */
const saveProgress = async (req, res) => {
  try {
    const userId = req.user._id;
    const { testType, modulId, topikId, answers, currentIndex } = req.body;

    const progress = await resultService.saveUserProgress(userId, testType, modulId, topikId, answers, currentIndex);

    res.status(200).json({ message: "Progress berhasil disimpan.", data: progress });
  } catch (error) {
    console.error("Controller: Gagal menyimpan progress:", error);
    res.status(500).json({ message: "Terjadi kesalahan pada server." });
  }
};

/**
 * @desc    Ambil progres tes pengguna
 */
const getProgress = async (req, res) => {
  try {
    const userId = req.user._id;
    const { modulId, topikId, testType } = req.query;

    if (!testType) {
        return res.status(400).json({ message: "Parameter testType diperlukan." });
    }

    if (modulId && !mongoose.Types.ObjectId.isValid(modulId)) {
        return res.status(400).json({ message: `Format modulId tidak valid: ${modulId}` });
    }
    if (topikId && !mongoose.Types.ObjectId.isValid(topikId)) {
        return res.status(400).json({ message: `Format topikId tidak valid: ${topikId}` });
    }

    if (!topikId && !modulId) {
        return res.status(400).json({ message: "Salah satu dari topikId atau modulId diperlukan." });
    }

    const query = { userId, testType };
    if (modulId) query.modulId = new mongoose.Types.ObjectId(modulId);
    if (topikId) query.topikId = new mongoose.Types.ObjectId(topikId);

    const progress = await Result.findOne(query);

    if (!progress) {
      return res.status(200).json(null);
    }

    res.status(200).json(progress);
  } catch (error) {
    console.error("Controller: Gagal mengambil progress:", error);
    res.status(500).json({ message: "Terjadi kesalahan pada server." });
  }
};

/**
 * @desc    Hapus progres tes pengguna
 */
const deleteProgress = async (req, res) => {
  try {
    const userId = req.user._id;
    const { modulId, topikId, testType } = req.query;

    await resultService.deleteUserProgress(userId, modulId, topikId, testType);
    res.status(200).json({ message: "Progress berhasil dihapus." });
  } catch (error) {
    console.error("Controller: Gagal menghapus progress:", error);
    res.status(500).json({ message: "Terjadi kesalahan pada server." });
  }
};

/**
 * @desc    Ambil hasil terbaru berdasarkan topik untuk pengguna saat ini dalam modul tertentu
 */
const getLatestResultByTopic = async (req, res) => {
  try {
    const userId = req.user._id;
    const { modulId, topikId } = req.query;

    const latestResult = await resultService.getLatestTopicResult(userId, modulId, topikId);

    res.status(200).json(latestResult);

  } catch (error) {
    console.error("Controller: Gagal mengambil hasil post-test topik:", error);
    res.status(500).json({ message: "Terjadi kesalahan pada server." });
  }
};

/**
 * @desc    Ambil hasil terbaru berdasarkan tipe tes untuk pengguna saat ini
 */
const getLatestResultByType = async (req, res) => {
  try {
    const userId = req.user._id;
    const { testType } = req.params;
    const { modulId } = req.query;

    const latestResult = await resultService.getLatestTestResultByType(userId, testType, modulId);

    res.status(200).json(latestResult);

  } catch (error) {
    console.error(`Controller: Gagal mengambil hasil tes tipe ${testType}:`, error);
    res.status(500).json({ message: "Terjadi kesalahan pada server." });
  }
};

/**
 * @desc    Hapus hasil berdasarkan tipe tes untuk pengguna saat ini
 */
const deleteResultByType = async (req, res) => {
  try {
    const userId = req.user._id;
    const { testType } = req.params;
    const { modulId } = req.query; 

    const deletedCount = await resultService.deleteTestResultByType(userId, testType, modulId);

    res.status(200).json({ message: `Hasil tes untuk tipe ${testType} berhasil dihapus.` });
  } catch (error) {
    console.error(`Controller: Gagal menghapus hasil tes tipe ${testType}:`, error);
    res.status(500).json({ message: "Terjadi kesalahan pada server." });
  }
};

/**
 * @desc    Ambil semua hasil
 */
const getResults = async (req, res) => {
  try {
    const results = await resultService.getAllResults();
    res.status(200).json(results);
  } catch (error) {
    console.error("Controller: Gagal mengambil semua hasil tes:", error);
    res.status(500).json({ message: "Terjadi kesalahan pada server." });
  }
};

/**
 * @desc    Ambil hasil berdasarkan ID pengguna
 */
const getResultsByUser = async (req, res) => {
  try {
    const results = await resultService.getResultsByUserId(req.params.userId);
    res.status(200).json(results);
  } catch (error) {
    console.error("Controller: Gagal mengambil hasil tes pengguna:", error);
    res.status(500).json({ message: "Terjadi kesalahan pada server." });
  }
};

/**
 * @desc    Ambil total waktu belajar pengguna
 */
const getStudyTime = async (req, res) => {
  try {
    const userId = req.user._id;
    const totalTime = await resultService.getTotalStudyTime(userId);
    res.status(200).json({ totalTimeInSeconds: totalTime });
  } catch (error) {
    console.error("Controller: Gagal mengambil waktu belajar:", error);
    res.status(500).json({ message: "Terjadi kesalahan pada server." });
  }
};

/**
 * @desc    Ambil data analitik untuk pengguna saat ini (skor rata-rata, topik terlemah)
 */
const getAnalytics = async (req, res) => {
  try {
    const userId = req.user?._id;
    const analyticsData = await resultService.getUserAnalytics(userId);
    res.status(200).json(analyticsData);
  } catch (error) {
    console.error("Controller: Error fetching analytics:", error);
    res.status(500).json({ message: "Terjadi kesalahan pada server." });
  }
};

/**
 * @desc    Ambil streak belajar harian pengguna
 */
const getDailyStreak = async (req, res) => {
  try {
    const userId = req.user._id;
    const streak = await resultService.getDailyUserStreak(userId);
    res.status(200).json({ streak });
  } catch (error) {
    console.error("Controller: Error fetching daily streak:", error);
    res.status(500).json({ message: "Server Error" });
  }
};

/**
 * @desc    Ambil aktivitas belajar mingguan pengguna
 */
const getWeeklyActivity = async (req, res) => {
  try {
    const userId = req.user._id;
    const weeklySeconds = await resultService.getWeeklyUserActivity(userId);
    res.status(200).json({ weeklySeconds });
  } catch (error) {
    console.error("Controller: Error fetching weekly activity:", error);
    res.status(500).json({ message: "Terjadi kesalahan pada server." });
  }
};

/**
 * @desc    Ambil rata-rata aktivitas belajar mingguan kelas
 */
const getClassWeeklyActivity = async (req, res) => {
  try {
    const sevenDaysAgo = new Date();
    const weeklyAverages = await resultService.getClassWeeklyUserActivity();
    res.status(200).json({ weeklyAverages });
  } catch (error) {
    console.error("Controller: Error fetching class weekly activity:", error);
    res.status(500).json({ message: "Terjadi kesalahan pada server." });
  }
};

/**
 * @desc    Ambil skor post-test modul terbaru pengguna
 */
const getModuleScores = async (req, res) => {
  try {
    const userId = req.user._id;
    const moduleScores = await resultService.getModuleScoresForUser(userId);
    res.status(200).json(moduleScores);
  } catch (error) {
    console.error("Controller: Error fetching module scores:", error);
    res.status(500).json({ message: "Terjadi kesalahan pada server." });
  }
};

/**
 * @desc    Ambil data perbandingan rata-rata pengguna vs kelas untuk post-test modul
 */
const getComparisonAnalytics = async (req, res) => {
  try {
    const userId = req.user._id;
    const analytics = await resultService.getComparisonAnalyticsForUser(userId);
    res.status(200).json(analytics);
  } catch (error) {
    console.error("Controller: Error fetching comparison analytics:", error);
    res.status(500).json({ message: "Terjadi kesalahan pada server." });
  }
};

/**
 * @desc    Ambil rekomendasi belajar untuk pengguna
 */
const getLearningRecommendations = async (req, res) => {
  try {
    const userId = req.user._id;
    const recommendations = await resultService.getLearningRecommendationsForUser(userId);
    res.status(200).json(recommendations);
  } catch (error) {
    console.error("Controller: Error fetching learning recommendations:", error);
    res.status(500).json({ message: "Terjadi kesalahan pada server." });
  }
};

/**
 * @desc    Ambil topik yang perlu diperkuat untuk pengguna
 */
const getTopicsToReinforce = async (req, res) => {
  try {
    const userId = req.user._id;
    const topics = await resultService.getTopicsToReinforceForUser(userId);
    res.status(200).json(topics);
  } catch (error) {
    console.error("Controller: Error fetching topics to reinforce:", error);
    res.status(500).json({ message: "Terjadi kesalahan pada server." });
  }
};

/**
 * @desc    Cek apakah pengguna telah menyelesaikan post-test modul
 * @param   {string} userId - ID pengguna.
 * @param   {string} modulId - ID modul.
 * @returns {Promise<boolean>} - True jika hasil ada, false jika tidak.
 */
const hasCompletedModulePostTest = async (userId, modulId) => {
  if (!userId || !modulId) {
    return false;
  }
  try {
    const result = await Result.findOne({
      userId: new mongoose.Types.ObjectId(userId),
      modulId: new mongoose.Types.ObjectId(modulId),
      testType: "post-test-modul",
    });
    return !!result;
  } catch (error) {
    console.error("Error checking module post-test completion:", error);
    return false;
  }
};

/**
 * @desc    Ambil performa pengguna di seluruh sub-topik
 */
const getSubTopicPerformance = async (req, res) => {
  try {
    const userId = req.user._id;
    const performance = await resultService.getSubTopicPerformanceForUser(userId);
    res.status(200).json(performance);
  } catch (error) {
    console.error("Controller: Error fetching sub-topic performance:", error);
    res.status(500).json({ message: "Terjadi kesalahan pada server." });
  }
};

/**
 * @desc    Ambil papan peringkat streak
 * @route   GET /api/results/streak-leaderboard
 * @access  Private
 */
const getStreakLeaderboard = async (req, res) => {
  try {
    const leaderboard = await resultService.getStreakLeaderboardData();
    res.status(200).json(leaderboard);
  } catch (error) {
    console.error("Controller: Error fetching streak leaderboard:", error);
    res.status(500).json({ message: "Terjadi kesalahan pada server." });
  }
};

// @desc    Buat sertifikat untuk pengguna yang sedang login
const generateCertificate = asyncHandler(async (req, res) => {
    const { name } = req.query; 

    if (!name) {
        res.status(400);
        throw new Error('Nama pada sertifikat tidak boleh kosong.');
    }

    // Batasi nama menjadi maksimal 3 kata
    const truncatedName = name.split(' ').slice(0, 3).join(' ');

    // 1. Muat template PDF dari file
    const templatePath = path.resolve(process.cwd(), 'src', 'assets', 'certificate-template.pdf');
    const templateBytes = await fs.promises.readFile(templatePath);
    const pdfDoc = await PDFDocument.load(templateBytes);

    // 2. Gunakan font standar yang sudah ada di pdf-lib
    const customFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold); 
    // 3. Ambil halaman pertama dari template
    const page = pdfDoc.getPages()[0];
    const { width, height } = page.getSize();

    // Mengatur header untuk respons file PDF
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="Sertifikat_${name.replace(/\s+/g, '_')}.pdf"`);

    // 4. Gambar teks nama di atas template
    const nameToDraw = truncatedName.toUpperCase();
    const nameWidth = customFont.widthOfTextAtSize(nameToDraw, 36);
    page.drawText(nameToDraw, {
        x: (width - nameWidth) / 2, //  Posisi tengah horizontal
        y: height / 2 + 30,         // Posisi tengah vertikal + 30px
        font: customFont,
        size: 36,
        color: rgb(0.1, 0.1, 0.1), // Warna gelap
    });

    // 5. Gambar teks tanggal di atas template
    const date = new Date().toLocaleDateString('id-ID', { year: 'numeric', month: 'long', day: 'numeric' });
    const dateWidth = customFont.widthOfTextAtSize(date, 14);
    page.drawText(date, {
        x: (width - dateWidth) / 2, //  Posisi tengah horizontal
        y: height / 2 - 100,        // Di bawah nama
        font: customFont,
        size: 14,
        color: rgb(0.3, 0.3, 0.3), // Warna abu-abu
    });

    // 6. Simpan PDF ke buffer
    const pdfBytes = await pdfDoc.save();

    // 7. Kirim buffer sebagai respons
    res.end(Buffer.from(pdfBytes));
});

// @desc    Ambil peta kompetensi pengguna dari hasil pre-test
const getCompetencyMap = asyncHandler(async (req, res) => {  
  const competencyMap = await resultService.getCompetencyMapForUser(req.user._id);
  res.json(competencyMap);
});

// @desc    Cek apakah user sudah mengerjakan Pre-Test
const checkPreTestStatus = async (req, res) => {
  try {
    const userId = req.user._id;
    const status = await resultService.checkUserPreTestStatus(userId);
    res.status(200).json(status);
  } catch (error) {
    console.error('Controller: Error checking pre-test status:', error);
    res.status(500).json({ message: 'Internal Server Error' });
  }
};

export {
    createResult, getResults, getResultsByUser, submitTest, logStudyTime,
    getStudyTime, getAnalytics, getDailyStreak, getWeeklyActivity,
    getClassWeeklyActivity, 
    getModuleScores, getComparisonAnalytics, getLearningRecommendations, getTopicsToReinforce,
    saveProgress, getProgress, getLatestResultByTopic, getLatestResultByType, deleteResultByType,
    deleteProgress, getCompetencyMap, getStreakLeaderboard, getSubTopicPerformance,
    generateCertificate, checkPreTestStatus,
    // Exporting these for external use, e.g., in modulController.js
};