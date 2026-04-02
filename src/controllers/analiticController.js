import * as analyticService from '../services/analyticService.js';

/**
 * @desc    Get aggregated analytics data for the admin dashboard
 * @route   GET /api/analytics/admin-analytics
 * @access  Private (Admin)
 */
export const getAdminAnalytics = async (req, res) => {
  try {
    const analyticsData = await analyticService.getAdminAnalyticsData(req.query.type);
    res.status(200).json(analyticsData);
  } catch (error) {
    console.error("Error fetching admin analytics:", error);
    res.status(500).json({ message: "Terjadi kesalahan pada server." });
  }
};

/**
 * @desc    Get a list of all users (for selection)
 * @route   GET /api/analytics/users-list
 * @access  Private (Admin)
 */
export const getUsersList = async (req, res) => {
  try {
    const users = await analyticService.getUsersListWithScores();
    res.status(200).json(users);
  } catch (error) {
    console.error("Error fetching users list:", error);
    res.status(500).json({ message: "Terjadi kesalahan pada server." });
  }
};

/**
 * @desc    Get leaderboard of students per module based on post-test-modul score
 * @route   GET /api/analytics/module-leaderboard
 * @access  Private (Admin)
 */
export const getModuleLeaderboard = async (req, res) => {
  try {
    const leaderboard = await analyticService.getLeaderboardByModule();
    res.status(200).json(leaderboard);
  } catch (error) {
    console.error("Error fetching module leaderboard:", error);
    res.status(500).json({ message: "Terjadi kesalahan pada server." });
  }
};

/**
 * @desc    Get analytics data for a specific student
 * @route   GET /api/analytics/student-analytics/:userId
 * @access  Private (Admin)
 */
export const getStudentAnalytics = async (req, res) => {
  try {
    const { userId } = req.params;
    const studentAnalytics = await analyticService.getAnalyticsForStudent(userId);
    res.status(200).json(studentAnalytics);
  } catch (error) {
    console.error("Error fetching student analytics:", error);
    if (error.message === 'Siswa tidak ditemukan.') {
        return res.status(404).json({ message: error.message });
    }
    res.status(500).json({ message: "Terjadi kesalahan pada server." });
  }
};