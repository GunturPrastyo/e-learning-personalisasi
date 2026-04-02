import * as analyticRepository from '../repositories/analyticRepository.js';

export const getAdminAnalyticsData = async (queryType) => {
    // --- OPTIMISASI: Polling Ringan untuk User Online ---
    if (queryType === 'online-users') {
        const twoMinutesAgo = new Date(Date.now() - 2 * 60 * 1000);
        const onlineUsers = await analyticRepository.countUsers({ 
          lastActiveAt: { $gte: twoMinutesAgo },
          role: 'user'
        });
        return { onlineUsers };
    }

    // --- 1. Total Jam Belajar (Semua User) ---
    const totalStudyTimeResult = await analyticRepository.aggregateResults([
      { $match: { testType: 'study-session' } },
      { $group: { _id: null, totalSeconds: { $sum: "$timeTaken" } } },
    ]);
    const totalStudyHours = totalStudyTimeResult.length > 0 ? Math.floor(totalStudyTimeResult[0].totalSeconds / 3600) : 0;

    // --- 2. Rata-rata Progres Belajar (Semua User) ---
    const allUsersProgress = await analyticRepository.aggregateUsers([
      { $project: { totalCompletions: { $size: { $ifNull: ["$topicCompletions", []] } } } }
    ]);
    const totalTopics = await analyticRepository.countTopics();
    const averageProgress = totalTopics > 0 && allUsersProgress.length > 0
      ? Math.round(
        (allUsersProgress.reduce((sum, user) => sum + user.totalCompletions, 0) / (allUsersProgress.length * totalTopics)) * 100
      )
      : 0;

    // --- 3. Rata-rata Skor Keseluruhan (Semua User) ---
    const overallAverageScoreResult = await analyticRepository.aggregateResults([
      { $match: { testType: "post-test-topik" } },
      { $group: { _id: null, averageScore: { $avg: "$score" } } },
    ]);
    const overallAverageScore = overallAverageScoreResult.length > 0 ? parseFloat(overallAverageScoreResult[0].averageScore.toFixed(1)) : 0;

    // --- 4. Total Pengguna Terdaftar ---
    const totalUsers = await analyticRepository.countUsers();

    // --- 4.5 Siswa Aktif (7 Hari Terakhir) ---
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    const activeUsers = await analyticRepository.countUsers({ 
      lastActiveAt: { $gte: sevenDaysAgo },
      role: 'user'
    });

    // --- 4.6 User Online (Aktivitas 2 Menit Terakhir) ---
    const twoMinutesAgo = new Date(Date.now() - 2 * 60 * 1000);
    const onlineUsers = await analyticRepository.countUsers({ 
      lastActiveAt: { $gte: twoMinutesAgo },
      role: 'user'
    });

    // --- 5. Topik Paling Sulit (Skor Rata-rata Terendah) ---
    const hardestTopicResult = await analyticRepository.aggregateResults([
        { $match: { testType: "post-test-topik" } },
        {
          $group: {
            _id: "$topikId",
            averageScore: { $avg: "$score" },
            attempts: { $sum: 1 }
          }
        },
        { $match: { attempts: { $gte: 3 } } },
        { $sort: { averageScore: 1 } },
        { $limit: 1 },
        {
          $lookup: {
            from: "topiks",
            localField: "_id",
            foreignField: "_id",
            as: "topikDetails"
          }
        },
        { $unwind: { path: "$topikDetails", preserveNullAndEmptyArrays: true } },
        {
          $lookup: {
            from: "moduls",
            localField: "topikDetails.modulId",
            foreignField: "_id",
            as: "modulDetails"
          }
        },
        { $unwind: { path: "$modulDetails", preserveNullAndEmptyArrays: true } },
        {
          $project: {
            _id: 0,
            topicId: "$topikDetails._id",
            topicTitle: "$topikDetails.title",
            topicSlug: "$topikDetails.slug",
            moduleSlug: "$modulDetails.slug",
            averageScore: { $round: ["$averageScore", 1] }
          }
        }
    ]);
    const weakestTopicOverall = hardestTopicResult.length > 0 ? hardestTopicResult[0] : null;

    // --- 6. Kecepatan Belajar per Modul (Rata-rata Waktu Pengerjaan Tes) ---
    const moduleLearningSpeed = await analyticRepository.aggregateResults([
        {
            $match: {
              testType: { $in: ["post-test-topik", "post-test-modul"] },
              modulId: { $exists: true, $ne: null },
            },
          },
          {
            $group: {
              _id: "$modulId",
              averageTime: { $avg: "$timeTaken" },
            },
          },
          {
            $lookup: {
              from: "moduls",
              localField: "_id",
              foreignField: "_id",
              as: "modulDetails",
            },
          },
          { $unwind: "$modulDetails" },
          {
            $project: {
              _id: 0,
              moduleTitle: "$modulDetails.title",
              averageTimeInSeconds: { $round: ["$averageTime", 0] },
            },
          },
          { $sort: { averageTimeInSeconds: 1 } },
    ]);

    // --- 7. Distribusi Nilai per Modul (untuk Radar Chart) ---
    const moduleScoreDistribution = await analyticRepository.aggregateResults([
        {
            $match: {
              testType: { $in: ["post-test-topik", "post-test-modul"] },
              modulId: { $exists: true, $ne: null },
            },
          },
          {
            $group: {
              _id: "$modulId",
              topicTotalScore: {
                $sum: { $cond: [{ $eq: ["$testType", "post-test-topik"] }, "$score", 0] }
              },
              topicCount: {
                $sum: { $cond: [{ $eq: ["$testType", "post-test-topik"] }, 1, 0] }
              },
              moduleTotalScore: {
                $sum: { $cond: [{ $eq: ["$testType", "post-test-modul"] }, "$score", 0] }
              },
              moduleCount: {
                $sum: { $cond: [{ $eq: ["$testType", "post-test-modul"] }, 1, 0] }
              },
            },
          },
          {
            $lookup: {
              from: "moduls",
              localField: "_id",
              foreignField: "_id",
              as: "modulDetails",
            },
          },
          { $unwind: "$modulDetails" },
          {
            $project: {
              _id: 0,
              subject: "$modulDetails.title",
              topicScore: {
                $round: [
                  { $cond: [{ $eq: ["$topicCount", 0] }, 0, { $divide: ["$topicTotalScore", "$topicCount"] }] },
                  1
                ]
              },
              moduleScore: {
                $round: [
                  { $cond: [{ $eq: ["$moduleCount", 0] }, 0, { $divide: ["$moduleTotalScore", "$moduleCount"] }] },
                  1
                ]
              },
              fullMark: 100,
            },
          },
    ]);

    // --- 8. Analitik per Modul (untuk Tabel) ---
    const overallTestTimeStats = await analyticRepository.aggregateResults([
      { $match: { testType: { $in: ["post-test-topik", "post-test-modul"] } } },
      { $group: { _id: null, overallAverageTime: { $avg: "$timeTaken" } } }
    ]);
    const overallAverageTime = overallTestTimeStats.length > 0 ? overallTestTimeStats[0].overallAverageTime : 600;

    const moduleAnalytics = await analyticRepository.aggregateModuls([
        {
            $lookup: {
              from: "results",
              let: { modulId: "$_id" },
              pipeline: [
                {
                  $match: {
                    $expr: {
                      $and: [
                        { $eq: ["$modulId", "$$modulId"] },
                        { $in: ["$testType", ["post-test-topik", "post-test-modul"]] }
                      ]
                    }
                  }
                },
                { $sort: { timestamp: -1 } },
                {
                  $group: {
                    _id: "$userId",
                    latestScore: { $first: "$score" },
                    averageTime: { $avg: "$timeTaken" }
                  }
                }
              ],
              as: "studentResults"
            }
          },
          {
            $project: {
              _id: 0,
              moduleTitle: "$title",
              totalStudents: { $size: "$studentResults" },
              averageScore: {
                $cond: [{ $eq: [{ $size: "$studentResults" }, 0] }, 0, { $avg: "$studentResults.latestScore" }]
              },
              averageTime: {
                $cond: [{ $eq: [{ $size: "$studentResults" }, 0] }, 0, { $avg: "$studentResults.averageTime" }]
              },
              remedialStudentCount: {
                $size: {
                  $filter: {
                    input: "$studentResults",
                    as: "res",
                    cond: { $lt: ["$$res.latestScore", 70] }
                  }
                }
              }
            }
          },
          {
            $addFields: {
              averageTimeInSeconds: { $round: ["$averageTime", 0] },
              averageScore: { $round: ["$averageScore", 1] },
              remedialRate: {
                $round: [
                  {
                    $cond: [
                      { $eq: ["$totalStudents", 0] }, 0,
                      { $multiply: [{ $divide: ["$remedialStudentCount", "$totalStudents"] }, 100] }
                    ]
                  },
                  0
                ]
              },
              scorePoints: {
                $switch: {
                  branches: [
                    { case: { $lt: ["$averageScore", 65] }, then: 2 },
                    { case: { $lt: ["$averageScore", 80] }, then: 1 },
                  ],
                  default: 0
                }
              },
              timePoints: {
                $switch: {
                  branches: [
                    { case: { $gt: ["$averageTime", overallAverageTime * 1.4] }, then: 2 },
                    { case: { $gt: ["$averageTime", overallAverageTime * 1.1] }, then: 1 },
                  ],
                  default: 0
                }
              },
            }
          },
          {
            $addFields: {
              remedialPoints: {
                $switch: {
                  branches: [
                    { case: { $gt: ["$remedialRate", 25] }, then: 2 },
                    { case: { $gt: ["$remedialRate", 10] }, then: 1 },
                  ],
                  default: 0
                }
              }
            }
          },
          {
            $addFields: {
              weightedScore: {
                $add: [
                  { $multiply: ["$scorePoints", 0.5] },
                  { $multiply: ["$remedialPoints", 0.3] },
                  { $multiply: ["$timePoints", 0.2] }
                ]
              }
            }
          }
    ]);

    // --- 9. Analitik per Topik (untuk Tabel) ---
    const topicAnalytics = await analyticRepository.aggregateResults([
        {
            $match: {
              testType: "post-test-topik",
              topikId: { $exists: true, $ne: null },
            },
          },
          { $sort: { timestamp: -1 } },
          {
            $group: {
              _id: { topikId: "$topikId", userId: "$userId" },
              latestScore: { $first: "$score" },
              averageTime: { $avg: "$timeTaken" }
            }
          },
          {
            $group: {
              _id: "$_id.topikId",
              averageScore: { $avg: "$latestScore" },
              averageTime: { $avg: "$averageTime" },
              totalStudents: { $sum: 1 },
              remedialStudentCount: {
                $sum: { $cond: [{ $lt: ["$latestScore", 70] }, 1, 0] }
              }
            }
          },
          { $lookup: { from: "topiks", localField: "_id", foreignField: "_id", as: "topikDetails" } },
          { $unwind: "$topikDetails" },
          { $lookup: { from: "moduls", localField: "topikDetails.modulId", foreignField: "_id", as: "modulDetails" } },
          { $unwind: "$modulDetails" },
          {
            $project: {
              _id: 0,
              topicTitle: "$topikDetails.title",
              moduleTitle: "$modulDetails.title",
              averageTimeInSeconds: { $round: ["$averageTime", 0] },
              averageScore: { $round: ["$averageScore", 1] },
              remedialRate: {
                $round: [
                  { $cond: [
                      { $eq: ["$totalStudents", 0] }, 0, 
                      { $multiply: [{ $divide: ["$remedialStudentCount", "$totalStudents"] }, 100] }] },
                  0
                ]
              },
             
              scorePoints: { $switch: { branches: [ { case: { $lt: ["$averageScore", 65] }, then: 2 }, { case: { $lt: ["$averageScore", 80] }, then: 1 }, ], default: 0 } },
              timePoints: { $switch: { branches: [ { case: { $gt: ["$averageTime", overallAverageTime * 1.4] }, then: 2 }, { case: { $gt: ["$averageTime", overallAverageTime * 1.1] }, then: 1 }, ], default: 0 } },
            }
          },
          {
            $addFields: {
              remedialPoints: {
                $switch: {
                  branches: [
                    { case: { $gt: ["$remedialRate", 25] }, then: 2 },
                    { case: { $gt: ["$remedialRate", 10] }, then: 1 },
                  ],
                  default: 0
                }
              }
            }
          },
          {
            $addFields: {
              weightedScore: { $add: [ { $multiply: ["$scorePoints", 0.5] }, { $multiply: ["$remedialPoints", 0.3] }, { $multiply: ["$timePoints", 0.2] } ] }
            }
          }
    ]);

    return {
        totalStudyHours,
        averageProgress,
        overallAverageScore,
        totalUsers,
        activeUsers,
        onlineUsers,
        weakestTopicOverall,
        moduleLearningSpeed, 
        moduleScoreDistribution,
        moduleAnalytics,
        topicAnalytics, 
    };
};

export const getUsersListWithScores = async () => {
    const users = await analyticRepository.aggregateUsers([
        { $match: { role: 'user' } },
        {
          $lookup: {
            from: 'results',
            localField: '_id',
            foreignField: 'userId',
            pipeline: [
             
              { $match: { testType: { $in: ['post-test-topik', 'post-test-modul'] } } },
              { $project: { score: 1 } }
            ],
            as: 'scores'
          }
        },
        {
          $addFields: {
            averageScore: {
              $cond: {
                if: { $gt: [{ $size: "$scores" }, 0] },
                then: { $avg: "$scores.score" },
                else: 0 
              }
            }
          }
        },
        {
          $project: {
            _id: 1,
            name: 1,
            kelas: 1,
            averageScore: { $round: ["$averageScore", 1] }
          }
        },
        { $sort: { averageScore: 1 } }
      ]);
      return users;
};

export const getLeaderboardByModule = async () => {
    const leaderboard = await analyticRepository.aggregateModuls([
        { $sort: { order: 1, title: 1 } }, 
        {
          $lookup: {
            from: "results",
            let: { modulId: "$_id" },
            pipeline: [
              {
                $match: {
                  $expr: {
                    $and: [
                      { $eq: ["$modulId", "$$modulId"] },
                      { $eq: ["$testType", "post-test-modul"] } 
                    ]
                  }
                }
              },
          
              {
                $lookup: {
                  from: "users",
                  localField: "userId",
                  foreignField: "_id",
                  as: "user"
                }
              },
              { $unwind: "$user" },
              { $match: { "user.role": "user" } }, 
              {
                $project: {
                  _id: 0,
                  userId: "$user._id",
                  name: "$user.name",
                  kelas: "$user.kelas",
                  score: 1 
                }
              },
              { $sort: { score: -1 } } 
            ],
            as: "students"
          }
        },
        {
          $project: {
            _id: 1,
            moduleTitle: "$title",
            students: 1
          }
        }
      ]);
      return leaderboard;
};

export const getAnalyticsForStudent = async (userId) => {
    const user = await analyticRepository.findUserById(userId);

    if (!user) {
      throw new Error('Siswa tidak ditemukan.');
    }

    // 1. Progress Belajar
    const totalTopics = await analyticRepository.countTopics();
    const progress = totalTopics > 0 ? Math.round((user.topicCompletions.length / totalTopics) * 100) : 0;

    // 2. Rata-rata Waktu & Topik Terlemah
    const userTestResults = await analyticRepository.aggregateResults([
      { $match: { userId: user._id, testType: { $in: ["post-test-topik", "post-test-modul"] } } },
    ]);

    const averageTimeInSeconds = userTestResults.length > 0
      ? Math.round(userTestResults.reduce((sum, r) => sum + r.timeTaken, 0) / userTestResults.length)
      : 0;

    const averageScore = userTestResults.length > 0
      ? Math.round(userTestResults.reduce((sum, r) => sum + r.score, 0) / userTestResults.length)
      : 0;

    const topicResults = userTestResults.filter(r => r.testType === 'post-test-topik');
    let weakestTopic = null;
    if (topicResults.length > 0) {
      const weakestResult = topicResults.sort((a, b) => a.score - b.score)[0];
      const topicDetails = await analyticRepository.findTopicById(weakestResult.topikId, 'title');
      if (topicDetails) {
        weakestTopic = {
          topicTitle: topicDetails.title,
          score: weakestResult.score,
        };
      }
    }

    // 3. Ambil semua hasil tes topik siswa untuk digabungkan nanti
    const topicPerformances = await analyticRepository.aggregateResults([
        {
          $match: {
            userId: user._id,
            testType: "post-test-topik",
            topikId: { $exists: true, $ne: null }
          }
        },
        { $sort: { timestamp: -1 } },
        {
          $group: {
            _id: "$topikId",
            latestScore: { $first: "$score" },
            averageTime: { $avg: "$timeTaken" },
            modulId: { $first: "$modulId" } 
          }
        },
        { $lookup: { from: "topiks", localField: "_id", foreignField: "_id", as: "topicDetails" } },
        { $unwind: "$topicDetails" }
      ]);
      const topicPerformancesMap = new Map(topicPerformances.map(p => [p._id.toString(), p]));
  
      // 3. Detail Performa per Modul
       const performanceByModule = await analyticRepository.aggregateResults([
         {
           $match: {
             userId: user._id,
             modulId: { $exists: true, $ne: null },
             testType: { $in: ["post-test-topik", "post-test-modul"] }
           }
         },
         { $sort: { timestamp: -1 } },
         {
           $group: {
             _id: "$modulId",
             moduleScore: {
               $max: { $cond: [{ $eq: ["$testType", "post-test-modul"] }, "$score", null] }
             },
             avgTopicScore: {
               $avg: { $cond: [{ $eq: ["$testType", "post-test-topik"] }, "$score", "$$REMOVE"] }
             },
             averageTime: { $avg: "$timeTaken" },
             topicIds: {
               $addToSet: {
                 $cond: [
                   { $eq: ["$testType", "post-test-topik"] },
                   "$topikId",
                   "$$REMOVE"
                 ]
               }
             }
           }
         },
         { $lookup: { from: "moduls", localField: "_id", foreignField: "_id", as: "modulDetails" } },
         { $unwind: "$modulDetails" },
         {
           $project: {
             _id: 0,
             moduleTitle: "$modulDetails.title",
             moduleId: "$_id", 
             moduleScore: { $ifNull: [{ $round: ["$moduleScore", 0] }, 0] },
             topicScore: { $ifNull: [{ $round: ["$avgTopicScore", 0] }, 0] },
             timeInSeconds: { $round: ["$averageTime", 0] },
             topicIds: 1 
           }
         },
         { $sort: { moduleTitle: 1 } }
       ]);
  
      // Gabungkan data topik ke dalam data modul
      const detailedPerformance = performanceByModule.map(modulePerf => {
        const topics = (modulePerf.topicIds || [])
          .map((topicId) => {
            const topicData = topicPerformancesMap.get(topicId.toString());
            if (!topicData) return null;
            return {
              topicTitle: topicData.topicDetails.title,
              score: Math.round(topicData.latestScore),
              timeInSeconds: Math.round(topicData.averageTime),
            };
          })
          .filter(Boolean); 
        return { ...modulePerf, topics };
      });
  
      return {
        progress,
        averageTimeInSeconds,
        averageScore, 
        weakestTopic,
        detailedPerformance: detailedPerformance.map(({ moduleId, topicIds, ...rest }) => rest), 
      };
};