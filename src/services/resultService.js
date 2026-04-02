import mongoose from "mongoose";
import * as resultRepository from "../repositories/resultRepository.js";

/**
 * Helper untuk menghitung skor fitur berbobot (Weighted Average)
 * Rumus: Sum(Skor Modul * Bobot Fitur) / Sum(Bobot Fitur)
 */
export const calculateWeightedFeatureScores = async (userId) => {
  const user = await resultRepository.findUserById(userId, 'competencyProfile');
  if (!user || !user.competencyProfile) return {};

  const allModules = await resultRepository.findModul({}, 'featureWeights');
  const featureMap = {};

  user.competencyProfile.forEach(cp => {
    if (!cp.modulId || !cp.featureId) return;
    const fid = cp.featureId.toString();
    const mid = cp.modulId.toString();
    const rawScore = cp.score; 

    const module = allModules.find(m => m._id.toString() === mid);
    if (module && module.featureWeights) {
      const fw = module.featureWeights.find(f => f.featureId.toString() === fid);
      if (fw) {
        const weight = fw.weight || 0;
        if (!featureMap[fid]) featureMap[fid] = { weightedSum: 0, totalWeight: 0 };
        featureMap[fid].weightedSum += rawScore * weight;
        featureMap[fid].totalWeight += weight;
      }
    }
  });

  const finalScores = {};
  Object.keys(featureMap).forEach(fid => {
    const data = featureMap[fid];
    finalScores[fid] = data.totalWeight > 0 ? data.weightedSum / data.totalWeight : 0;
  });
  
  return finalScores;
};

/**
 * Menghitung rincian skor berdasarkan 4 komponen: Akurasi, Waktu, Stabilitas, Fokus.
 */
export const calculateFinalScoreDetails = (accuracyScore, timeTaken, totalDuration, answerChanges, tabExits, totalQuestions) => {
  // 1. Skor Waktu Pengerjaan (Sw) - Bobot 5%
  const timeEfficiency = totalDuration > 0 && timeTaken < totalDuration ? (1 - (timeTaken / totalDuration)) : 0;
  const timeScore = timeEfficiency * 100;

  // 2. Skor Stabilitas Jawaban (Sc) - Bobot 5%
  const changes = answerChanges || 0;
  const changePenalty = totalQuestions > 0 ? Math.min(changes / totalQuestions, 1) : 0;
  const answerStabilityScore = (1 - changePenalty) * 100;

  // 3. Skor Fokus (Sb) - Bobot 10%
  const exits = tabExits || 0;
  const focusPenalty = exits > 3 ? 1 : exits / 3;
  const focusScore = (1 - focusPenalty) * 100;

  // Kalkulasi Skor Akhir (Final Score)
  const finalScore = parseFloat(((accuracyScore * 0.80) + (timeScore * 0.05) + (answerStabilityScore * 0.05) + (focusScore * 0.10)).toFixed(2));

  return {
    finalScore,
    scoreDetails: {
      accuracy: parseFloat(accuracyScore.toFixed(2)),
      time: parseFloat(timeScore.toFixed(2)),
      stability: parseFloat(answerStabilityScore.toFixed(2)),
      focus: parseFloat(focusScore.toFixed(2)),
    }
  };
};

/**
 * Helper untuk menghitung dan update streak user
 */
export const updateUserStreak = async (userId) => {
  try {
    const results = await resultRepository.findResults({ userId }, null);
    let streak = 0;
    if (results.length > 0) {
      const uniqueDays = new Set();
      results.forEach(result => {
        const date = new Date(result.createdAt);
        date.setUTCHours(0, 0, 0, 0);
        uniqueDays.add(date.getTime());
      });
      const sortedDays = Array.from(uniqueDays).sort((a, b) => b - a);
      const today = new Date();
      today.setUTCHours(0, 0, 0, 0);
      const yesterday = new Date(today);
      yesterday.setUTCDate(yesterday.getUTCDate() - 1);

      if (sortedDays[0] === today.getTime() || sortedDays[0] === yesterday.getTime()) {
        streak = 1;
        for (let i = 0; i < sortedDays.length - 1; i++) {
          const diffTime = sortedDays[i] - sortedDays[i + 1];
          if (Math.round(diffTime / (1000 * 60 * 60 * 24)) === 1) streak++;
          else break;
        }
      }
    }
    await resultRepository.findUserAndUpdate(userId, { dailyStreak: streak });
  } catch (error) {
    console.error("Service: Error updating user streak:", error);
  }
};

/**
 * Menganalisis kelemahan sub-topik (untuk post-test-topik) atau topik (untuk post-test-modul).
 */
export const analyzeWeaknesses = async (testType, questions, answers, topikId) => {
  let weakSubTopics = [];
  let weakTopics = [];

  // --- Analisis Sub Topik Lemah (Post-Test Topik) ---
  if (testType === "post-test-topik") {
    const subTopicAnalysis = {};
    questions.forEach(q => {
      if (q.subMateriId) {
        const subId = q.subMateriId.toString();
        if (!subTopicAnalysis[subId]) subTopicAnalysis[subId] = { correct: 0, total: 0 };
        subTopicAnalysis[subId].total++;
        if (answers[q._id.toString()] === q.answer) subTopicAnalysis[subId].correct++;
      }
    });

    const weakSubTopicDetails = [];
    for (const subId in subTopicAnalysis) {
      const analysis = subTopicAnalysis[subId];
      const subTopicScore = analysis.total > 0 ? (analysis.correct / analysis.total) * 100 : 0;
      if (subTopicScore < 70) weakSubTopicDetails.push({ subId, score: parseFloat(subTopicScore.toFixed(2)) });
    }

    if (weakSubTopicDetails.length > 0) {
      const materiWithWeakSubTopics = await resultRepository.findMateri({ topikId: new mongoose.Types.ObjectId(topikId) });
      if (materiWithWeakSubTopics?.subMateris) {
        const weakSubTopicsMap = new Map(weakSubTopicDetails.map(d => [d.subId, d.score]));
        weakSubTopics = materiWithWeakSubTopics.subMateris
          .filter(sub => weakSubTopicsMap.has(sub._id.toString()))
          .map(sub => ({ subMateriId: sub._id, title: sub.title, score: weakSubTopicsMap.get(sub._id.toString()) }));
      }
    }
  }

  // --- Analisis Topik Lemah (Post-Test Modul) ---
  if (testType === "post-test-modul") {
    const topicPerformance = {};
    questions.forEach(q => {
      if (q.topikId) {
        const topikIdStr = q.topikId.toString();
        if (!topicPerformance[topikIdStr]) topicPerformance[topikIdStr] = { correct: 0, total: 0 };
        topicPerformance[topikIdStr].total++;
        if (answers[q._id.toString()] === q.answer) topicPerformance[topikIdStr].correct++;
      }
    });

    const weakTopicIds = [];
    for (const topikId in topicPerformance) {
      const perf = topicPerformance[topikId];
      const score = (perf.correct / perf.total) * 100;
      if (score < 70) weakTopicIds.push({ id: topikId, score: Math.round(score) });
    }

    if (weakTopicIds.length > 0) {
      const topicDetails = await resultRepository.findTopik({ '_id': { $in: weakTopicIds.map(t => new mongoose.Types.ObjectId(t.id)) } }, 'title slug');
      const topicScoreMap = new Map(weakTopicIds.map(t => [t.id, t.score]));
      weakTopics = topicDetails.map(topic => ({
        topikId: topic._id, title: topic.title, slug: topic.slug, score: topicScoreMap.get(topic._id.toString())
      }));
    }
  }

  return { weakSubTopics, weakTopics };
};

/**
 * Memproses logika khusus Pre-Test Global (Skor Fitur & Level Belajar).
 */
export const processPreTestGlobal = async (questions, answers) => {
  const allFeatures = await resultRepository.findFeatures();
  const relevantModulIds = [...new Set(questions.map(q => q.modulId).filter(id => id))].map(id => new mongoose.Types.ObjectId(id));
  const relevantModules = await resultRepository.findModul({ _id: { $in: relevantModulIds } }, 'featureWeights title');
  const moduleWeightsMap = new Map(relevantModules.map(m => [m._id.toString(), m.featureWeights]));
  const moduleTitleMap = new Map(relevantModules.map(m => [m._id.toString(), m.title]));

  const featureScores = {}; 
  const moduleFeatureScores = {}; 

  // Inisialisasi struktur data per modul
  relevantModulIds.forEach(modulId => {
    const moduleIdStr = modulId.toString();
    const moduleWeights = moduleWeightsMap.get(moduleIdStr) || [];
    moduleFeatureScores[moduleIdStr] = {
      moduleTitle: moduleTitleMap.get(moduleIdStr) || 'Unknown Module',
      questionCount: 0,
      features: {}
    };
    moduleWeights.forEach(fw => {
      const featureIdStr = fw.featureId.toString();
      const featureInfo = allFeatures.find(af => af._id.toString() === featureIdStr);
      moduleFeatureScores[moduleIdStr].features[featureIdStr] = {
        accumulatedWeightedScore: 0,
        weight: fw.weight || 0,
        name: featureInfo?.name || 'Unknown',
        group: featureInfo?.group || 'Dasar'
      };
    });
  });

  // Proses setiap soal
  questions.forEach(q => {
    const isCorrect = answers[q._id.toString()] === q.answer;
    const moduleIdStr = q.modulId ? q.modulId.toString() : null;
    const moduleWeights = moduleIdStr ? moduleWeightsMap.get(moduleIdStr) : [];

    // 1. Hitung Global Feature Scores
    if (moduleWeights && moduleWeights.length > 0) {
      moduleWeights.forEach(fw => {
        const featureId = fw.featureId.toString();
        if (!featureScores[featureId]) {
          const featureInfo = allFeatures.find(af => af._id.toString() === featureId);
          featureScores[featureId] = { earned: 0, max: 0, name: featureInfo?.name || 'Unknown', group: featureInfo?.group || 'Dasar' };
        }
        featureScores[featureId].max += (fw.weight || 0);
        if (isCorrect) featureScores[featureId].earned += (fw.weight || 0);
      });
    }

    // 2. Hitung Per-Module Feature Scores
    if (moduleIdStr && moduleFeatureScores[moduleIdStr]) {
      moduleFeatureScores[moduleIdStr].questionCount++;
      if (isCorrect) {
        for (const featureIdStr in moduleFeatureScores[moduleIdStr].features) {
          const featureData = moduleFeatureScores[moduleIdStr].features[featureIdStr];
          featureData.accumulatedWeightedScore += 100; 
        }
      }
    }
  });

  // Format Output: Skor Fitur Berdasarkan Modul
  const featureScoresByModule = Object.entries(moduleFeatureScores).map(([moduleId, data]) => {
    const features = Object.entries(data.features).map(([featureId, fData]) => ({
      featureId,
      featureName: fData.name,
      group: fData.group,
      score: data.questionCount > 0 ? parseFloat((fData.accumulatedWeightedScore / data.questionCount).toFixed(2)) : 0,
    }));
    return { moduleId, moduleTitle: data.moduleTitle, features };
  });

  // Format Output: Skor Fitur Global Terhitung
  const calculatedFeatureScores = Object.entries(featureScores).map(([featureId, data]) => ({
    featureId,
    featureName: data.name,
    group: data.group,
    score: data.max > 0 ? (data.earned / data.max) * 100 : 0,
  }));

  // Hitung Akurasi Total (Weighted)
  let totalEarnedWeight = 0;
  let totalMaxWeight = 0;
  Object.values(featureScores).forEach(data => {
    totalEarnedWeight += data.earned;
    totalMaxWeight += data.max;
  });
  const accuracyScore = totalMaxWeight > 0 ? (totalEarnedWeight / totalMaxWeight) * 100 : 0;

  // Hitung Rata-rata Grup
  const groupScores = { Dasar: [], Menengah: [], Lanjutan: [] };
  calculatedFeatureScores.forEach(fs => {
    const groupName = fs.group ? fs.group.charAt(0).toUpperCase() + fs.group.slice(1).toLowerCase() : 'Dasar';
    if (groupScores[groupName]) groupScores[groupName].push(fs.score);
  });
  const calculateAverage = (scores) => scores.length > 0 ? scores.reduce((a, b) => a + b, 0) / scores.length : 0;
  const avgScoreDasar = calculateAverage(groupScores.Dasar);
  const avgScoreMenengah = calculateAverage(groupScores.Menengah);

  // --- LOGIKA PENENTUAN LEVEL (Berdasarkan Formula Global) ---
  const checkGroupPass = (groupName, threshold) => {
    const featuresInGroup = allFeatures.filter(f => {
      const g = f.group ? f.group.charAt(0).toUpperCase() + f.group.slice(1).toLowerCase() : 'Dasar';
      return g === groupName;
    });

    if (featuresInGroup.length === 0) return false;

    return featuresInGroup.every(f => {
      const fid = f._id.toString();
      const featureScoreObj = calculatedFeatureScores.find(cfs => cfs.featureId === fid);
      const score = featureScoreObj ? featureScoreObj.score : 0;
      return score >= threshold;
    });
  };

  let learningLevel = "Dasar";
  const passedDasarForLanjutan = checkGroupPass('Dasar', 85);
  const passedMenengahForLanjutan = checkGroupPass('Menengah', 75);
  
  if (passedDasarForLanjutan && passedMenengahForLanjutan) {
    learningLevel = "Lanjutan";
  } else {
    const passedDasarForMenengah = checkGroupPass('Dasar', 75);
    if (passedDasarForMenengah) {
      learningLevel = "Menengah";
    }
  }

  return {
    accuracyScore,
    featureScoresByModule,
    calculatedFeatureScores,
    avgScoreDasar,
    avgScoreMenengah,
    learningLevel
  };
};

/**
 * Menghitung ulang level belajar user berdasarkan profil kompetensi saat ini.
 */
export const recalculateUserLearningLevel = async (userId) => {
  // 1. Hitung skor berbobot terbaru untuk setiap fitur
  const userFeatureScores = await calculateWeightedFeatureScores(userId);

  // 2. Ambil semua fitur yang tersedia di sistem untuk referensi kelengkapan
  const allFeatures = await resultRepository.findFeatures();

  // 3. Fungsi helper untuk mengecek apakah SEMUA fitur dalam grup memenuhi threshold
  const checkGroupPass = (groupName, threshold) => {
    // Filter fitur sistem berdasarkan grup
    const featuresInGroup = allFeatures.filter(f => {
      const g = f.group ? f.group.charAt(0).toUpperCase() + f.group.slice(1).toLowerCase() : 'Dasar';
      return g === groupName;
    });

    if (featuresInGroup.length === 0) return false;

    // Cek setiap fitur di grup tersebut
    return featuresInGroup.every(f => {
      const fid = f._id.toString();
      const score = userFeatureScores[fid] || 0; // Jika user belum punya nilai, anggap 0
      return score >= threshold;
    });
  };

  // 4. Terapkan aturan penentuan level (Per Fitur)
  // Syarat Lanjutan: Semua fitur Dasar >= 85 DAN Semua fitur Menengah >= 75
  const passedDasarForLanjutan = checkGroupPass('Dasar', 85);
  const passedMenengahForLanjutan = checkGroupPass('Menengah', 75);
  
  if (passedDasarForLanjutan && passedMenengahForLanjutan) {
    return "Lanjutan";
  }

  // Syarat Menengah: Semua fitur Dasar >= 75
  const passedDasarForMenengah = checkGroupPass('Dasar', 75);
  
  if (passedDasarForMenengah) {
    return "Menengah";
  }

  return "Dasar";
};

/**
 * Menentukan apakah modul terkunci untuk user berdasarkan level belajar.
 */
export const isModuleLockedForUser = (moduleCategory, userLearningLevel) => {
  // Jika level pengguna belum ditentukan (null/undefined/kosong), kunci semua modul.
  if (!userLearningLevel) return true;

  const level = userLearningLevel.charAt(0).toUpperCase() + userLearningLevel.slice(1).toLowerCase();
  const category = moduleCategory ? moduleCategory.toLowerCase() : '';

  // Normalisasi kategori modul agar mendukung 'mudah'/'dasar', 'sedang'/'menengah', dll.
  const isDasar = ['dasar', 'mudah'].includes(category);
  const isMenengah = ['menengah', 'sedang'].includes(category);

  // Aturan 1: Jika level pengguna 'Lanjutan', semua modul terbuka.
  if (level === 'Lanjutan' || level === 'Lanjut') {
    return false;
  }

  // Aturan 2: Jika level pengguna 'Menengah', modul 'mudah' dan 'sedang' terbuka.
  if (level === 'Menengah') {
    // Modul terbuka jika kategorinya Dasar atau Menengah. Terkunci jika Lanjutan/Sulit.
    return !(isDasar || isMenengah);
  }

  // Aturan 3: Jika level pengguna 'Dasar', hanya modul 'mudah' yang terbuka.
  if (level === 'Dasar') {
    // Modul terkunci jika kategorinya BUKAN Dasar.
    return !isDasar;
  }

  return true; // Defaultnya, kunci modul jika ada level yang tidak dikenal.
};

/**
 * Helper: Simpan hasil hanya jika skor baru lebih tinggi dari sebelumnya (High Score Strategy)
 */
export const saveBestResult = async (query, updateData, finalScore) => {
  const existingResult = await resultRepository.findOneResult(query);
  const previousBestScore = existingResult ? existingResult.score : null;

  if (!existingResult || finalScore > existingResult.score) {
    const result = await resultRepository.findOneAndUpdateResult(
      query,
      { ...updateData, timestamp: new Date() },
      { new: true, upsert: true, setDefaultsOnInsert: true }
    );
    return { result, bestScore: finalScore, previousBestScore };
  }
  return { result: existingResult, bestScore: existingResult.score, previousBestScore };
};

/**
 * Helper untuk memetakan jawaban ke format database
 */
export const mapAnswers = (questions, answers) => {
  return questions.map(q => ({
    questionId: q._id,
    selectedOption: answers[q._id.toString()],
    subMateriId: q.subMateriId,
    topikId: q.topikId
  }));
};

/**
 * Handler khusus untuk Post-Test Topik
 */
export const handlePostTestTopik = async (userId, topikId, modulId, finalScore, correct, total, scoreDetails, questions, answers, weakSubTopics, timeTaken) => {
  const query = { userId, topikId, testType: "post-test-topik" };
  const updateData = {
    userId, testType: "post-test-topik", score: finalScore, correct, total, scoreDetails,
    answers: mapAnswers(questions, answers), weakSubTopics, timeTaken, modulId, topikId
  };
  return await saveBestResult(query, updateData, finalScore);
};

/**
 * Handler khusus untuk Pre-Test Global
 */
export const handlePreTestGlobalResult = async (userId, finalScore, correct, total, scoreDetails, timeTaken, preTestData) => {
  const existingResult = await resultRepository.findOneResult({ userId, testType: "pre-test-global" });
  const previousBestScore = existingResult ? existingResult.score : null;
  const { featureScoresByModule, calculatedFeatureScores, learningLevel } = preTestData;

  // Simpan profil kompetensi (Raw Score)
  const competencyProfileData = featureScoresByModule.flatMap(mod => 
    mod.features.map(feat => ({
      featureId: new mongoose.Types.ObjectId(feat.featureId),
      modulId: new mongoose.Types.ObjectId(mod.moduleId),
      score: feat.score
    }))
  );

  const user = await resultRepository.findUserById(userId);
  user.competencyProfile = competencyProfileData;
  await resultRepository.saveUser(user);

  // Hitung ulang level belajar
  const newLearningLevel = await recalculateUserLearningLevel(userId);
  user.learningLevel = newLearningLevel;
  await resultRepository.saveUser(user);

  const result = await resultRepository.findOneAndUpdateResult(
    { userId, testType: "pre-test-global" },
    {
      userId, testType: "pre-test-global", score: finalScore, correct, total, scoreDetails, timeTaken,
      featureScores: calculatedFeatureScores.map(fs => ({ featureId: fs.featureId, featureName: fs.featureName, score: fs.score })),
      learningPath: newLearningLevel, timestamp: new Date(),
    },
    { new: true, upsert: true, setDefaultsOnInsert: true, set: { featureScoresByModule } }
  );

  return { result, bestScore: finalScore, previousBestScore, learningPathResult: newLearningLevel };
};

/**
 * Handler khusus untuk Post-Test Modul
 */
export const handlePostTestModul = async (userId, modulId, finalScore, correct, total, scoreDetails, weakTopics, questions, answers, timeTaken) => {
  const objectModulId = new mongoose.Types.ObjectId(modulId);
  const query = { userId, modulId: objectModulId, testType: "post-test-modul" };
  const updateData = {
    userId, testType: "post-test-modul", score: finalScore, correct, total, scoreDetails, weakTopics,
    answers: mapAnswers(questions, answers), timeTaken, modulId: objectModulId
  };

  const { result, bestScore, previousBestScore } = await saveBestResult(query, updateData, finalScore);

  // Perbarui Profil Kompetensi & Level Belajar
  const competencyUpdates = [];
  let learningPathResult = null;
  
  const updateResult = await updateUserCompetencyFromModuleScore(userId, modulId, bestScore);
  if (updateResult) {
      competencyUpdates.push(...updateResult.competencyUpdates);
      learningPathResult = updateResult.learningPathResult;
  }

  return { result, bestScore, previousBestScore, competencyUpdates, learningPathResult };
};

/**
 * Helper untuk update kompetensi user dari skor modul 
 */
export const updateUserCompetencyFromModuleScore = async (userId, modulId, bestScore) => {
    const modul = await resultRepository.findModul({_id: modulId}, 'featureWeights title');
    if (!modul || !modul[0]?.featureWeights) return null; // findModul returns an array
    const actualModul = modul[0];

    const userToSave = await resultRepository.findUserById(userId);
    if (!userToSave) return null;

    const scoresBefore = await calculateWeightedFeatureScores(userId);
    let profile = userToSave.competencyProfile || [];

    actualModul.featureWeights.forEach(fw => {
        if (fw.featureId) { // Assuming featureId is already populated or just the ID
            const fid = fw.featureId.toString();
            const existingIndex = profile.findIndex(cp => 
                cp.modulId && cp.modulId.toString() === modulId && cp.featureId.toString() === fid
            );

            if (existingIndex > -1) {
                profile[existingIndex].score = Math.max(profile[existingIndex].score, bestScore);
            } else {
                profile.push({
                    featureId: new mongoose.Types.ObjectId(fid),
                    modulId: new mongoose.Types.ObjectId(modulId),
                    score: bestScore
                });
            }
        }
    });

    userToSave.competencyProfile = profile;
    await resultRepository.saveUser(userToSave);

    const scoresAfter = await calculateWeightedFeatureScores(userId);
    const competencyUpdates = [];

    Object.keys(scoresAfter).forEach(fid => {
        const oldScore = scoresBefore[fid] || 0;
        const newScore = scoresAfter[fid];
        if (newScore > oldScore) {
            const featureObj = actualModul.featureWeights.find(fw => fw.featureId && fw.featureId.toString() === fid);
            const featureName = featureObj ? (featureObj.featureId.name || 'Unknown Feature') : 'Unknown Feature';
            competencyUpdates.push({
                featureName, oldScore, newScore,
                diff: parseFloat((newScore - oldScore).toFixed(2)),
                percentIncrease: oldScore > 0 ? Math.round(((newScore - oldScore) / oldScore) * 100) : 100
            });
        }
    });

    const newLearningLevel = await recalculateUserLearningLevel(userId);
    userToSave.learningLevel = newLearningLevel;
    await resultRepository.saveUser(userToSave);

    return { competencyUpdates, learningPathResult: newLearningLevel };
};

export const createTestResult = async (userId, testType, score, correct, total, timeTaken, modulId, totalDuration) => {
  if (!testType || score == null || correct == null || total == null || timeTaken == null) {
    throw new Error("Data hasil tes tidak lengkap.");
  }

  const accuracyScore = score; 
  const timeEfficiency = totalDuration > 0 && timeTaken < totalDuration ? (1 - (timeTaken / totalDuration)) : 0;
  const timeScore = timeEfficiency * 100;

  const scoreDetails = {
    accuracy: parseFloat(accuracyScore.toFixed(2)),
    time: parseFloat(timeScore.toFixed(2)),
    stability: 100,
    focus: 100,
  };

  const newResult = await resultRepository.createResult({
    userId,
    testType,
    score,
    correct,
    total,
    scoreDetails, 
    timeTaken,
    ...(modulId && { modulId }), 
  });

  return newResult;
};

export const submitUserTest = async (userId, testType, modulId, topikId, answers, timeTaken, answerChanges, tabExits) => {
  if (!testType || !answers || Object.keys(answers).length === 0 || timeTaken === undefined) {
    throw new Error("Data jawaban tidak lengkap.");
  }
  if (testType === "post-test-topik" && (!topikId || !mongoose.Types.ObjectId.isValid(topikId))) throw new Error("Topik ID valid diperlukan.");
  if (testType === "post-test-modul" && (!modulId || !mongoose.Types.ObjectId.isValid(modulId))) throw new Error("Modul ID valid diperlukan.");

  const questionIds = Object.keys(answers);
  const query = { _id: { $in: questionIds } };
  if (testType === 'post-test-topik' && topikId) query.topikId = new mongoose.Types.ObjectId(topikId);
  if (testType === 'post-test-modul' && modulId) query.modulId = new mongoose.Types.ObjectId(modulId);

  const questions = await resultRepository.findQuestions(query, "+answer +durationPerQuestion +subMateriId +topikId");

  if (questions.length === 0) throw new Error("Soal tidak ditemukan.");

  const correctAnswers = questions.reduce((count, q) => 
      answers[q._id.toString()] === q.answer ? count + 1 : count, 0);

  const totalQuestions = questions.length;
  const totalDuration = questions.reduce((acc, q) => acc + (q.durationPerQuestion || 60), 0);

  let accuracyScore;
  let preTestData = null;

  if (testType === "pre-test-global") {
    preTestData = await processPreTestGlobal(questions, answers);
    accuracyScore = preTestData.accuracyScore;
  } else {
    accuracyScore = totalQuestions > 0 ? (correctAnswers / totalQuestions) * 100 : 0;
  }

  const { finalScore, scoreDetails } = calculateFinalScoreDetails(
    accuracyScore, timeTaken, totalDuration, answerChanges, tabExits, totalQuestions
  );

  const { weakSubTopics, weakTopics } = await analyzeWeaknesses(testType, questions, answers, topikId);

  let resultData;

  if (testType === "post-test-topik") {
      resultData = await handlePostTestTopik(userId, topikId, modulId, finalScore, correctAnswers, totalQuestions, scoreDetails, questions, answers, weakSubTopics, timeTaken);
  } else if (testType === "pre-test-global") {
      resultData = await handlePreTestGlobalResult(userId, finalScore, correctAnswers, totalQuestions, scoreDetails, timeTaken, preTestData);
  } else if (testType === "post-test-modul") {
      resultData = await handlePostTestModul(userId, modulId, finalScore, correctAnswers, totalQuestions, scoreDetails, weakTopics, questions, answers, timeTaken);
  } else {
      const newResult = await resultRepository.createResult({
      userId, testType, score: finalScore, correct: correctAnswers, total: totalQuestions,
      scoreDetails, answers: mapAnswers(questions, answers), weakSubTopics: [], timeTaken,
      ...(modulId && { modulId: new mongoose.Types.ObjectId(modulId) }),
      ...(topikId && { topikId: new mongoose.Types.ObjectId(topikId) }),
      timestamp: new Date(),
    });
    resultData = { result: newResult, bestScore: finalScore };
  }
  
  const { result, bestScore, previousBestScore, learningPathResult, competencyUpdates } = resultData;

  if (testType === "post-test-topik" && topikId && bestScore >= 70) {
    await resultRepository.findUserAndUpdate(userId, { $addToSet: { topicCompletions: new mongoose.Types.ObjectId(topikId) } });
    await resultRepository.deleteOneResult({ userId, topikId, testType: "post-test-topik-progress" });
  }

  await updateUserStreak(userId);

  return {
    ...(result.toObject ? result.toObject() : result),
    weakTopics,
    weakSubTopics,
    score: finalScore,
    correct: correctAnswers,
    total: totalQuestions,
    bestScore,
    previousBestScore,
    learningPath: learningPathResult,
    scoreDetails,
    competencyUpdates,
    ...(testType === "pre-test-global" && {
      featureScores: preTestData.calculatedFeatureScores,
      avgScoreDasar: preTestData.avgScoreDasar,
      avgScoreMenengah: preTestData.avgScoreMenengah,
      featureScoresByModule: preTestData.featureScoresByModule,
    }),
  };
};

export const logUserStudyTime = async (userId, topikId, durationInSeconds) => {
  if (!topikId || durationInSeconds === undefined || durationInSeconds <= 0) {
    throw new Error("Data waktu belajar tidak lengkap atau tidak valid.");
  }

  const newResult = await resultRepository.createResult({
    userId,
    topikId,
    testType: 'study-session',
    timeTaken: durationInSeconds,
    score: 0,
    correct: 0,
    total: 0,
  });

  await updateUserStreak(userId);
  return newResult;
};

export const saveUserProgress = async (userId, testType, modulId, topikId, answers, currentIndex) => {
  if (!testType || (!topikId && !modulId)) {
    throw new Error("Data progress tidak lengkap (perlu testType dan salah satu dari topikId/modulId).");
  }

  const query = { userId, testType };
  if (modulId) query.modulId = new mongoose.Types.ObjectId(modulId);
  if (topikId) query.topikId = new mongoose.Types.ObjectId(topikId);

  const progress = await resultRepository.findOneAndUpdateResult( 
    query,
    {
      $set: {
        progressAnswers: Object.entries(answers || {}).map(([questionId, selectedOption]) => ({
          questionId,
          selectedOption,
        })),
        currentIndex: currentIndex || 0,
        ...(modulId && { modulId: new mongoose.Types.ObjectId(modulId) }),
        ...(topikId && { topikId: new mongoose.Types.ObjectId(topikId) }),
      },
    },
    {
      new: true, 
      upsert: true, 
      setDefaultsOnInsert: true,
    }
  );
  return progress;
};

export const getUserProgress = async (userId, modulId, topikId, testType) => {
  if (!testType) {
      throw new Error("Parameter testType diperlukan.");
  }

  if (modulId && !mongoose.Types.ObjectId.isValid(modulId)) {
      console.warn(`[getUserProgress] Invalid modulId received: ${modulId}`);
      throw new Error(`Format modulId tidak valid: ${modulId}`);
  }
  if (topikId && !mongoose.Types.ObjectId.isValid(topikId)) {
      console.warn(`[getUserProgress] Invalid topikId received: ${topikId}`);
      throw new Error(`Format topikId tidak valid: ${topikId}`);
  }

  if (!topikId && !modulId) {
      throw new Error("Salah satu dari topikId atau modulId diperlukan.");
  }

  const query = { userId, testType };
  if (modulId) query.modulId = new mongoose.Types.ObjectId(modulId);
  if (topikId) query.topikId = new mongoose.Types.ObjectId(topikId);

  const progress = await resultRepository.findOneResult(query);
  return progress;
};

export const deleteUserProgress = async (userId, modulId, topikId, testType) => {
  if (!testType || (!topikId && !modulId)) {
    throw new Error("Parameter testType dan salah satu dari topikId/modulId diperlukan untuk menghapus progress.");
  }

  const query = { userId, testType };
  if (modulId) query.modulId = modulId;
  if (topikId) query.topikId = topikId;

  await resultRepository.deleteOneResult(query);
};

export const getLatestTopicResult = async (userId, modulId, topikId) => {
  if (!modulId || !mongoose.Types.ObjectId.isValid(modulId)) {
    throw new Error("Modul ID tidak valid.");
  }
  if (!topikId || !mongoose.Types.ObjectId.isValid(topikId)) {
    throw new Error("Topik ID tidak valid.");
  }

  const latestResult = await resultRepository.findOneResult({
    userId,
    modulId: new mongoose.Types.ObjectId(modulId),
    topikId: new mongoose.Types.ObjectId(topikId),
    testType: "post-test-topik",
  }, null); // No specific select options, get all fields

  return latestResult;
};

export const getLatestTestResultByType = async (userId, testType, modulId) => {
  if (!testType) {
    throw new Error("Parameter testType diperlukan.");
  }

  const query = { userId, testType };

  if (modulId) {
      if (!mongoose.Types.ObjectId.isValid(modulId)) {
          console.warn(`[getLatestTestResultByType] Invalid modulId received: ${modulId}`);
          return null;
      }
      query.modulId = new mongoose.Types.ObjectId(modulId);
  } else if (testType === 'post-test-modul') {
      console.log(`[getLatestTestResultByType] Missing modulId for post-test-modul`);
      return null;
  }

  const latestResult = await resultRepository.findOneResult(query, '+weakTopics +scoreDetails');

  if (latestResult && modulId && String(latestResult.modulId) !== String(modulId)) {
      console.warn(`[getLatestTestResultByType] Mismatch detected! Req: ${modulId}, Found: ${latestResult.modulId}. Returning null.`);
      return null;
  }

  return latestResult;
};

export const deleteTestResultByType = async (userId, testType, modulId) => {
  if (!testType) {
    throw new Error("Parameter testType diperlukan.");
  }

  const query = { userId, testType };

  if (testType === 'post-test-modul') {
    if (!modulId || !mongoose.Types.ObjectId.isValid(modulId)) {
      throw new Error("Modul ID valid diperlukan untuk menghapus post-test modul.");
    }
    query.modulId = new mongoose.Types.ObjectId(modulId);
  }

  const result = await resultRepository.deleteManyResults(query);

  if (result.deletedCount === 0) {
    return 0; // Indicate no documents were deleted
  }
  return result.deletedCount;
};

export const getAllResults = async () => {
  return await resultRepository.findResults({}, "userId");
};

export const getResultsByUserId = async (userId) => {
  return await resultRepository.findResults({ userId });
};

export const getTotalStudyTime = async (userId) => {
  const results = await resultRepository.aggregateResults([
    { $match: { userId: new mongoose.Types.ObjectId(userId) } },
    {
      $group: {
        _id: "$userId",
        totalTimeInSeconds: { $sum: "$timeTaken" },
      },
    },
  ]);
  return results.length > 0 ? results[0].totalTimeInSeconds : 0;
};

export const getUserAnalytics = async (userId) => {
  if (!userId) {
    throw new Error("User tidak terautentikasi.");
  }

  const averageScoreResult = await resultRepository.aggregateResults([
    {
      $match: {
        userId: new mongoose.Types.ObjectId(userId),
        testType: { $in: ["post-test-topik", "post-test-modul"] },
      },
    },
    {
      $group: {
        _id: null,
        averageScore: { $avg: "$score" },
      },
    },
  ]);

  const classAverageScoreResult = await resultRepository.aggregateResults([
    {
      $match: {
        testType: { $in: ["post-test-topik", "post-test-modul"] },
      },
    },
    {
      $group: {
        _id: null,
        averageScore: { $avg: "$score" },
      },
    },
  ]);

  const totalStudyTime = await getTotalStudyTime(userId);
  const dailyStreak = await getDailyUserStreak(userId);

  const averageScore = averageScoreResult.length > 0 ? parseFloat(averageScoreResult[0].averageScore.toFixed(2)) : 0;
  const classAverageScore = classAverageScoreResult.length > 0 ? parseFloat(classAverageScoreResult[0].averageScore.toFixed(2)) : 0;

  const weakestTopicResult = await resultRepository.aggregateResults([
    {
      $match: {
        userId: new mongoose.Types.ObjectId(userId),
        testType: "post-test-topik",
      },
    },
    {
      $sort: { createdAt: -1 }, 
    },
    {
      $group: {
        _id: "$topikId", 
        latestScore: { $first: "$score" }, 
        latestTopikId: { $first: "$topikId" }, 
      },
    },
    {
      $match: {
        latestScore: { $lt: 70 },
      },
    },
    {
      $sort: { latestScore: 1 }, 
    },
    {
      $limit: 1, 
    },
    {
      $lookup: {
        from: "topiks", 
        localField: "latestTopikId",
        foreignField: "_id",
        as: "topikDetails",
      },
    },
    { $unwind: { path: "$topikDetails", preserveNullAndEmptyArrays: true } },
    {
      $lookup: {
        from: "moduls",
        localField: "topikDetails.modulId",
        foreignField: "_id",
        as: "modulDetails",
      },
    },
    { $unwind: { path: "$modulDetails", preserveNullAndEmptyArrays: true } },
    {
      $project: {
        _id: 0,
        topicId: "$topikDetails._id",
        title: "$topikDetails.title",
        topicSlug: "$topikDetails.slug",
        score: { $round: ["$latestScore", 2] },
        modulSlug: { $ifNull: ["$modulDetails.slug", ""] }, 
      },
    },
  ]);

  const weakestTopic = weakestTopicResult.length > 0 ? weakestTopicResult[0] : null;

  return {
    averageScore,
    classAverageScore,
    weakestTopic,
    totalStudyTime,
    dailyStreak,
  };
};

export const getDailyUserStreak = async (userId) => {
  const results = await resultRepository.findResults({ userId }, null);

  if (results.length === 0) {
    return 0;
  }

  const uniqueDays = new Set();
  results.forEach(result => {
    const date = new Date(result.createdAt);
    date.setHours(0, 0, 0, 0); 
    uniqueDays.add(date.getTime());
  });

  const sortedDays = Array.from(uniqueDays).sort((a, b) => b - a);

  let streak = 0;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);

  if (sortedDays[0] === today.getTime() || sortedDays[0] === yesterday.getTime()) {
    streak = 1;
    for (let i = 0; i < sortedDays.length - 1; i++) {
      const diffTime = sortedDays[i] - sortedDays[i + 1];
      if (Math.round(diffTime / (1000 * 60 * 60 * 24)) === 1) streak++;
      else break; 
    }
  }
  return streak;
};

export const getWeeklyUserActivity = async (userId) => {
  const sevenDaysAgo = new Date();
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
  sevenDaysAgo.setHours(0, 0, 0, 0);

  const activity = await resultRepository.aggregateResults([
    {
      $match: {
        userId: new mongoose.Types.ObjectId(userId),
        createdAt: { $gte: sevenDaysAgo },
      },
    },
    {
      $group: {
        _id: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt" } },
        totalSeconds: { $sum: "$timeTaken" },
      },
    },
    { $sort: { _id: 1 } },
  ]);

  const activityMap = new Map(activity.map(item => [item._id, item.totalSeconds]));

  const weeklySeconds = Array(7).fill(0).map((_, i) => {
    const d = new Date();
    d.setDate(d.getDate() - (6 - i));
    const dateString = d.toISOString().split('T')[0];
    return activityMap.get(dateString) || 0; 
  });
  return weeklySeconds;
};

export const getClassWeeklyUserActivity = async () => {
  const sevenDaysAgo = new Date();
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
  sevenDaysAgo.setHours(0, 0, 0, 0);

  const activity = await resultRepository.aggregateResults([
    {
      $match: {
        createdAt: { $gte: sevenDaysAgo },
        timeTaken: { $exists: true, $gt: 0 }
      },
    },
    {
      $group: {
        _id: {
          date: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt" } },
          userId: "$userId"
        },
        totalSecondsPerUser: { $sum: "$timeTaken" }
      }
    },
    {
      $group: {
        _id: "$_id.date", 
        averageSeconds: { $avg: "$totalSecondsPerUser" }
      }
    },
    { $sort: { _id: 1 } }, 
  ]);

  const activityMap = new Map(activity.map(item => [item._id, item.averageSeconds]));

  const weeklyAverages = Array(7).fill(0).map((_, i) => {
    const d = new Date();
    d.setDate(d.getDate() - (6 - i));
    const dateString = d.toISOString().split('T')[0];
    return activityMap.get(dateString) || 0;
  });
  return weeklyAverages;
};

export const getModuleScoresForUser = async (userId) => {
  const objectUserId = new mongoose.Types.ObjectId(userId);

  const moduleScores = await resultRepository.aggregateResults([
    {
      $lookup: {
        from: "moduls", // Assuming 'moduls' is the collection name for Modul model
        let: { modul_id: "$_id" },
        pipeline: [
          {
            $match: {
              $expr: {
                $and: [
                  { $eq: ["$_id", "$$modul_id"] },
                ],
              },
            },
          },
        ],
        as: "modulDetails",
      },
    },
    { $unwind: "$modulDetails" },
    {
      $lookup: {
        from: "results",
        let: { modul_id: "$modulDetails._id" },
        pipeline: [
          {
            $match: {
              $expr: {
                $and: [
                  { $eq: ["$modulId", "$$modul_id"] },
                  { $eq: ["$userId", objectUserId] },
                  { $eq: ["$testType", "post-test-modul"] },
                ],
              },
            },
          },
          { $sort: { createdAt: -1 } }, 
          { $limit: 1 }, 
        ],
        as: "userResult",
      },
    },
    {
      $project: {
        _id: 0,
        moduleTitle: "$modulDetails.title",
        score: { $ifNull: [{ $arrayElemAt: ["$userResult.score", 0] }, 0] },
      },
    },
  ]);
  return moduleScores;
};

export const getComparisonAnalyticsForUser = async (userId) => {
  const objectUserId = new mongoose.Types.ObjectId(userId);
  const allModulesData = await resultRepository.aggregateResults([
    {
      $lookup: {
        from: "moduls",
        let: { modul_id: "$_id" },
        pipeline: [
          { $match: { $expr: { $eq: ["$_id", "$$modul_id"] } } },
        ],
        as: "modulDetails",
      },
    },
    { $unwind: "$modulDetails" },
    { $sort: { "modulDetails.title": 1 } }, 
    {
      $lookup: {
        from: "results",
        let: { modul_id: "$modulDetails._id" },
        pipeline: [
          { $match: { $expr: { $and: [ { $eq: ["$modulId", "$$modul_id"] }, { $eq: ["$userId", objectUserId] }, { $eq: ["$testType", "post-test-modul"] } ] } } },
          { $sort: { createdAt: -1 } },
          { $limit: 1 }
        ],
        as: "userResult"
      }
    },
    {
      $lookup: {
        from: "results",
        let: { modul_id: "$modulDetails._id" },
        pipeline: [
          { $match: { $expr: { $and: [ { $eq: ["$modulId", "$$modul_id"] }, { $eq: ["$testType", "post-test-modul"] } ] } } },
          { $sort: { createdAt: -1 } },
          { $group: { _id: "$userId", latestScore: { $first: "$score" } } },
          { $group: { _id: null, averageScore: { $avg: "$latestScore" } } }
        ],
        as: "classResult"
      }
    },
    {
      $project: {
        _id: 0,
        moduleTitle: "$modulDetails.title",
        userScore: { $ifNull: [{ $arrayElemAt: ["$userResult.score", 0] }, 0] },
        classAverage: { $ifNull: [{ $round: [{ $arrayElemAt: ["$classResult.averageScore", 0] }, 2] }, 0] }
      }
    }
  ]);

  const labels = allModulesData.map(d => d.moduleTitle);
  const userScores = allModulesData.map(d => d.userScore);
  const classAverages = allModulesData.map(d => d.classAverage);

  const allUsersAverageScores = await resultRepository.aggregateResults([
    { $match: { testType: "post-test-modul", modulId: { $exists: true } } },
    { $sort: { createdAt: -1 } },
    { $group: { _id: { modulId: "$modulId", userId: "$userId" }, latestScore: { $first: "$score" } } },
    { $group: { _id: "$_id.userId", userAverage: { $avg: "$latestScore" } } },
    { $sort: { userAverage: -1 } }
  ]);

  const totalParticipants = allUsersAverageScores.length;
  const userRankIndex = allUsersAverageScores.findIndex(u => u._id.equals(userId));
  const rank = userRankIndex !== -1 ? userRankIndex + 1 : totalParticipants;

  const userOverallAverage = userScores.length > 0 
    ? userScores.reduce((sum, s) => sum + s, 0) / userScores.length 
    : 0;

  const classOverallAverage = classAverages.length > 0 
    ? classAverages.reduce((sum, s) => sum + s, 0) / classAverages.length 
    : 0;

  const scoreDifference = classOverallAverage > 0 
    ? parseFloat((((userOverallAverage - classOverallAverage) / classOverallAverage) * 100).toFixed(2))
    : 0;

  return { 
    labels, 
    userScores, 
    classAverages,
    rank,
    totalParticipants,
    scoreDifference,
  };
};

export const getLearningRecommendationsForUser = async (userId) => {
  const weakestModuleResult = await resultRepository.aggregateResults([
    { $match: { userId, testType: "post-test-modul", modulId: { $exists: true } } },
    { $sort: { createdAt: -1 } },
    { $group: { _id: "$modulId", latestScore: { $first: "$score" } } },
    { $sort: { latestScore: 1 } },
    { $limit: 1 },
    { $lookup: { from: "moduls", localField: "_id", foreignField: "_id", as: "modulDetails" } },
    { $unwind: { path: "$modulDetails", preserveNullAndEmptyArrays: true } },      
    { $project: { _id: 1, title: "$modulDetails.title", slug: "$modulDetails.slug", icon: "$modulDetails.icon", score: { $round: ["$latestScore", 2] } } },
  ]);

  let repeatModule = null;
  if (weakestModuleResult.length > 0 && weakestModuleResult[0].score < 70) {
    const weakestModule = weakestModuleResult[0];

    const topicsInModule = await resultRepository.findTopik({ modulId: weakestModule._id }, '_id');
    const topicIdsInModule = topicsInModule.map(t => t._id);

    const topicScores = await resultRepository.aggregateResults([
      { $match: { userId, testType: "post-test-topik", topikId: { $in: topicIdsInModule } } },
      { $sort: { createdAt: -1 } },
      { $group: { _id: "$topikId", latestScore: { $first: "$score" } } },
    ]);

    const allTopicsMastered = topicIdsInModule.length > 0 && topicScores.length === topicIdsInModule.length && topicScores.every(s => s.latestScore >= 70);

    let weakestTopicInModuleResult = [];
    if (!allTopicsMastered) {
      weakestTopicInModuleResult = await resultRepository.aggregateResults([
        { $match: { userId, modulId: new mongoose.Types.ObjectId(weakestModule._id), testType: "post-test-topik" } },
        { $sort: { createdAt: -1 } },
        { $group: { _id: "$topikId", latestScore: { $first: "$score" } } },
        { $sort: { latestScore: 1 } },
        { $limit: 1 },
        { $lookup: { from: "topiks", localField: "_id", foreignField: "_id", as: "topicDetails" } },
        { $unwind: { path: "$topicDetails", preserveNullAndEmptyArrays: true } },
        { $project: { _id: "$topicDetails._id", title: "$topicDetails.title", slug: "$topicDetails.slug" } },
      ]);
    }

    repeatModule = {
      moduleTitle: weakestModule.title,
      moduleIcon: weakestModule.icon,
      moduleScore: weakestModule.score,
      weakestTopic: !allTopicsMastered && weakestTopicInModuleResult.length > 0 ? weakestTopicInModuleResult[0].title : null,
      moduleSlug: weakestModule.slug,
      weakestTopicDetails: !allTopicsMastered && weakestTopicInModuleResult.length > 0 ? weakestTopicInModuleResult[0] : null,
      allTopicsMastered: allTopicsMastered,
    };
  }

  const weakestOverallTopicResult = await resultRepository.aggregateResults([
    { $match: { userId, testType: "post-test-topik", topikId: { $exists: true } } },
    { $sort: { createdAt: -1 } },
    { $group: { _id: "$topikId", latestScore: { $first: "$score" } } },
    { $sort: { latestScore: 1 } },
    { $limit: 1 },
    { $lookup: { from: "topiks", localField: "_id", foreignField: "_id", as: "topikDetails" } },
    { $unwind: { path: "$topikDetails", preserveNullAndEmptyArrays: true } },
    { $lookup: { from: "moduls", localField: "topikDetails.modulId", foreignField: "_id", as: "modulDetails" } },
    { $unwind: { path: "$modulDetails", preserveNullAndEmptyArrays: true } },
      { $project: { _id: 0, topicId: "$topikDetails._id", topicTitle: "$topikDetails.title", topicSlug: "$topikDetails.slug", modulSlug: "$modulDetails.slug", score: { $round: ["$latestScore", 2] } } }
  ]);

  let deepenTopic = null;

  if (weakestOverallTopicResult.length > 0 && weakestOverallTopicResult[0].score < 70) {
    deepenTopic = {
      ...weakestOverallTopicResult[0]
    };
  }

  const user = await resultRepository.findUserById(userId, 'topicCompletions');
  const modulesWithProgress = await resultRepository.aggregateResults([
      { $lookup: { from: "topiks", localField: "_id", foreignField: "modulId", as: "topics" } },
      {
          $project: {
              _id: 1, title: 1, slug: 1, icon: 1, category: 1, order: 1, 
              topics: { _id: 1, title: 1, slug: 1, order: 1 }, 
              totalTopics: { $size: "$topics" },
          }
      }
  ]);

  const modulesWithCompletion = modulesWithProgress.map(m => {
      const completedTopics = m.topics.filter(t => user.topicCompletions.some(ct => ct.equals(t._id))).length;
      const progress = m.totalTopics > 0 ? Math.round((completedTopics / m.totalTopics) * 100) : 0;
      return { ...m, completedTopics, progress };
  });

  let continueToModule = null;
  const preTestResult = await resultRepository.findOneResult({ userId, testType: 'pre-test-global' }, null);

  if (preTestResult && preTestResult.learningPath) {
      const learningPath = preTestResult.learningPath.toLowerCase();
      const categoryMap = { 'dasar': 'mudah', 'menengah': 'sedang', 'lanjutan': 'sulit' };
      const userCategory = categoryMap[learningPath];

      const sortedModules = [...modulesWithCompletion].sort((a, b) => (a.order || 0) - (b.order || 0));

      let recommendedModule = sortedModules.find(m => m.category === userCategory && m.progress > 0 && m.progress < 100);

      if (!recommendedModule) {
          recommendedModule = sortedModules.find(m => m.category === userCategory && m.progress === 0);
      }

      if (recommendedModule) {
          const sortedTopics = [...recommendedModule.topics].sort((a, b) => a.order - b.order);
          const nextTopicInRecommendedModule = sortedTopics.find(
              t => !user.topicCompletions.some(ct => ct.equals(t._id))
          );

          continueToModule = {
              moduleTitle: recommendedModule.title,
              moduleSlug: recommendedModule.slug,
              moduleIcon: recommendedModule.icon,
              nextTopic: nextTopicInRecommendedModule ? { title: nextTopicInRecommendedModule.title, id: nextTopicInRecommendedModule._id.toString() } : null,
          };
      }
  }

  return {
    repeatModule,
    deepenTopic,
    continueToModule,
  };
};

export const getTopicsToReinforceForUser = async (userId) => {
  const topics = await resultRepository.aggregateResults([
    { $match: { userId, testType: "post-test-topik", topikId: { $exists: true } } },
    { $sort: { createdAt: -1 } },
    {
      $group: {
        _id: "$topikId",
        latestScore: { $first: "$score" },
        weakSubTopics: { $first: "$weakSubTopics" }, 
      },
    },
    { $sort: { latestScore: 1 } },
    { $lookup: { from: "topiks", localField: "_id", foreignField: "_id", as: "topicDetails" } },
    { $unwind: { path: "$topicDetails", preserveNullAndEmptyArrays: true } },
    { $match: { topicDetails: { $ne: [] } } },
    {
      $project: {
        _id: 0,
        topicTitle: { $arrayElemAt: ["$topicDetails.title", 0] },
        score: { $round: ["$latestScore", 2] },
        weakSubTopics: { $ifNull: ["$weakSubTopics", []] }, 
        status: {
          $switch: {
            branches: [
              { case: { $lt: ["$latestScore", 60] }, then: "Perlu review" },
              { case: { $lt: ["$latestScore", 70] }, then: "Butuh latihan" },
            ],
            default: "Sudah bagus",
          },
        },
      },
    },
  ]);
  return topics;
};

export const hasCompletedModulePostTest = async (userId, modulId) => {
  if (!userId || !modulId) {
    return false;
  }
  try {
    const result = await resultRepository.findOneResult({
      userId: new mongoose.Types.ObjectId(userId),
      modulId: new mongoose.Types.ObjectId(modulId),
      testType: "post-test-modul",
    });
    return !!result;
  } catch (error) {
    console.error("Service: Error checking module post-test completion:", error);
    return false;
  }
};

export const getSubTopicPerformanceForUser = async (userId) => {
  const performance = await resultRepository.aggregateResults([
    { $match: { userId: new mongoose.Types.ObjectId(userId), testType: "post-test-topik" } },
    { $unwind: "$answers" },
    { $match: { "answers.subMateriId": { $exists: true, $ne: null } } },
    {
      $lookup: {
        from: "questions",
        localField: "answers.questionId",
        foreignField: "_id",
        as: "questionDetails"
      }
    },
    { $unwind: "$questionDetails" },
    {
      $group: {
        _id: "$answers.subMateriId",
        correct: {
          $sum: {
            $cond: [{ $eq: ["$answers.selectedOption", "$questionDetails.answer"] }, 1, 0]
          }
        },
        total: { $sum: 1 }
      }
    },
    {
      $project: {
        averageScore: { $round: [{ $multiply: [{ $divide: ["$correct", "$total"] }, 100] }, 2] }
      }
    },
    { $sort: { averageScore: 1 } },
    { $lookup: { from: "materis", localField: "_id", foreignField: "subMateris._id", as: "materiDetails" } },
    { $unwind: "$materiDetails" },
    { $unwind: "$materiDetails.subMateris" },
    { $match: { $expr: { $eq: ["$_id", "$materiDetails.subMateris._id"] } } },
    { $project: { _id: 0, subTopicTitle: "$materiDetails.subMateris.title", score: "$averageScore" } }
  ]);
  return performance;
};

export const getStreakLeaderboardData = async () => {
  const leaderboard = await resultRepository.findUsers({ role: 'user', dailyStreak: { $gt: 0 } }, 'name avatar dailyStreak');
  return leaderboard;
};

export const getCompetencyMapForUser = async (userId) => {  
  const userFeatureScores = await calculateWeightedFeatureScores(userId);

  const allUsers = await resultRepository.findUsers({ role: 'user' }, 'competencyProfile');
  const featureTotalScoreMap = new Map();
  const featureUserCountMap = new Map();

  allUsers.forEach(u => {
    if (u.competencyProfile && Array.isArray(u.competencyProfile)) {
      const userFeatureAvgScores = new Map();
      const userFeatureCounts = new Map();

      u.competencyProfile.forEach(comp => {
        const fid = comp.featureId.toString();
        userFeatureAvgScores.set(fid, (userFeatureAvgScores.get(fid) || 0) + comp.score);
        userFeatureCounts.set(fid, (userFeatureCounts.get(fid) || 0) + 1);
      });

      userFeatureAvgScores.forEach((total, fid) => {
        const count = userFeatureCounts.get(fid);
        const avg = count > 0 ? total / count : 0;
        featureTotalScoreMap.set(fid, (featureTotalScoreMap.get(fid) || 0) + avg);
        featureUserCountMap.set(fid, (featureUserCountMap.get(fid) || 0) + 1);
      });
    }
  });

  const allFeatures = await resultRepository.findFeatures();

  const groupedFeatures = {
    Dasar: [],
    Menengah: [],
    Lanjutan: [],
  };

  allFeatures.forEach(feature => {
    const fid = feature._id.toString();
    const count = featureUserCountMap.get(fid) || 0;
    const total = featureTotalScoreMap.get(fid) || 0;
    const average = count > 0 ? Math.round(total / count) : 0;

    const featureData = {
      name: feature.name,
      score: userFeatureScores[fid] || 0,
      average: average,
    };
    if (groupedFeatures[feature.group]) {
      groupedFeatures[feature.group].push(featureData);
    }
  });

  return groupedFeatures;
};

export const checkUserPreTestStatus = async (userId) => {
  const preTestResult = await resultRepository.findOneResult({
    userId: userId,
    testType: 'pre-test-global' 
  });

  if (preTestResult) {
    const user = await resultRepository.findUserById(userId, 'learningLevel');

    return {
      hasTakenPreTest: true,
      learningLevel: user?.learningLevel || preTestResult.learningLevel || 'dasar', 
      score: preTestResult.score
    };
  }

  return {
    hasTakenPreTest: false,
    learningLevel: null
  };
};