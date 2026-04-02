import * as userService from '../services/userService.js';

// ========================= VERIFY EMAIL =========================
export const verifyEmail = async (req, res) => {
  try {
    const result = await userService.verifyUserEmail(req.body.token);
    res.status(200).json(result);
  } catch (error) {
    console.error("Verify Email Controller Error:", error);
    const statusCode = error.message.includes("diperlukan") || error.message.includes("valid") || error.message.includes("terdaftar") ? 400 : 500;
    res.status(statusCode).json({ message: error.message });
  }
};

// ========================= GET USER PROFILE =========================
export const getUserProfile = async (req, res) => {
  try {
    const user = await userService.getUserProfile(req.user.id);
    res.json(user);
  } catch (error) {
    console.error("Get Profile Controller Error:", error);
    res.status(error.message.includes("ditemukan") ? 404 : 500).json({ message: error.message });
  }
};

// ========================= REGISTER =========================
export const registerUser = async (req, res) => {
  try {
    const result = await userService.registerNewUser(req.body);
    res.status(200).json(result);
  } catch (error) {
    console.error("Register Controller Error:", error);
    res.status(error.message.includes("digunakan") ? 400 : 500).json({ message: error.message });
  }
};

// ========================= UPDATE USER PROFILE =========================
export const updateUserProfile = async (req, res) => {
  try {
    const result = await userService.updateUserProfile(req.user.id, req.body, req.file);
    res.status(200).json(result);
  } catch (error) {
    console.error("Update Profile Controller Error:", error);
    res.status(error.message.includes("ditemukan") ? 404 : 500).json({ message: error.message });
  }
};

// ========================= CHANGE PASSWORD =========================
export const changePassword = async (req, res) => {
  try {
    const result = await userService.changeUserPassword(req.user.id, req.body);
    res.status(200).json(result);
  } catch (error) {
    console.error("Change Password Controller Error:", error);
    res.status(error.message.includes("ditemukan") ? 404 : 400).json({ message: error.message });
  }
};

// ========================= LOGIN MANUAL =========================
export const loginUser = async (req, res) => {
  try {
    const result = await userService.login(req.body);
    res.status(200).json(result);
  } catch (error) {
    console.error("Login Controller Error:", error);
    res.status(error.message.includes("verifikasi") ? 401 : 400).json({ message: error.message });
  }
};

// ========================= REGISTER/LOGIN GOOGLE =========================
export const googleAuth = async (req, res) => {
  try {
    const result = await userService.authenticateWithGoogle(req.body.token);
    res.status(200).json(result);
  } catch (error) {
    console.error("Google Auth Error:", error);
    res.status(500).json({ message: error.message || "Autentikasi Google gagal. Silakan coba lagi." });
  }
};

// ========================= FORGOT PASSWORD =========================
export const forgotPassword = async (req, res) => {
  try {
    const result = await userService.forgotPassword(req.body.email);
    res.status(200).json(result);
  } catch (error) {
    console.error("Forgot Password Controller Error:", error);
    res.status(error.message.includes("terdaftar") ? 404 : 500).json({ message: error.message });
  }
};

// ========================= RESET PASSWORD =========================
export const resetPassword = async (req, res) => {
  try {
    const result = await userService.resetPassword(req.params.token, req.body);
    res.status(200).json(result);
  } catch (error) {
    console.error("Reset Password Controller Error:", error);
    res.status(400).json({ message: error.message });
  }
};

// ========================= LOGOUT =========================
export const logoutUser = async (req, res) => {
  try {
    const result = await userService.logout(req.user?._id || req.user?.id);
    res.status(200).json(result);
  } catch (error) {
    console.error("Logout Controller Error:", error);
    res.status(500).json({ message: error.message });
  }
};

// ========================= COMPLETE TOPIK =========================
export const completeTopic = async (req, res) => {
  try {
    const result = await userService.completeTopicForUser(req.user._id, req.body.topikId);
    res.status(200).json(result);
  } catch (error) {
    console.error("Complete Topic Controller Error:", error);
    res.status(error.message.includes("ditemukan") ? 404 : 400).json({ message: error.message });
  }
};

// ========================= GET COMPETENCY PROFILE =========================
export const getCompetencyProfile = async (req, res) => {
  try {
    const result = await userService.getUserCompetencyProfile(req.user._id);
    res.status(200).json(result);
  } catch (error) {
    console.error("Get Competency Profile Controller Error:", error);
    res.status(500).json({ message: error.message });
  }
};

// ========================= ADMIN: GET ALL USERS =========================
export const getAllUsers = async (req, res) => {
  try {
    const users = await userService.getAllUsers();
    res.status(200).json(users);
  } catch (error) {
    console.error("Get All Users Controller Error:", error);
    res.status(500).json({ message: error.message });
  }
};

// ========================= ADMIN: CREATE USER =========================
export const createUser = async (req, res) => {
  try {
    const result = await userService.createNewUser(req.body);
    res.status(201).json(result);
  } catch (error) {
    console.error("Create User Controller Error:", error);
    res.status(error.message.includes("digunakan") ? 400 : 500).json({ message: error.message });
  }
};

// ========================= ADMIN: UPDATE USER =========================
export const updateUser = async (req, res) => {
  try {
    const updatedUser = await userService.updateUserById(req.params.id, req.body);
    res.status(200).json(updatedUser);
  } catch (error) {
    console.error("Update User Controller Error:", error);
    res.status(error.message.includes("ditemukan") ? 404 : 400).json({ message: error.message });
  }
};

// ========================= ADMIN: DELETE USER =========================
export const deleteUser = async (req, res) => {
  try {
    const result = await userService.deleteUserById(req.params.id, req.user.id);
    res.status(200).json(result);
  } catch (error) {
    console.error("Delete User Controller Error:", error);
    res.status(error.message.includes("ditemukan") ? 404 : 400).json({ message: error.message });
  }
};

// ========================= GET USER STATUS (TOUR & STREAK) =========================
export const getUserStatus = async (req, res) => {
  try {
    const status = await userService.getUserStatus(req.user.id);
    res.status(200).json(status);
  } catch (error) {
    console.error("Get User Status Controller Error:", error);
    res.status(error.message.includes("not found") ? 404 : 500).json({ message: error.message });
  }
};

// ========================= UPDATE USER STATUS =========================
export const updateUserStatus = async (req, res) => {
  try {
    const { key, value } = req.body;
    const result = await userService.updateUserStatus(req.user.id, key, value);
    res.status(200).json(result);
  } catch (error) {
    console.error("Update User Status Controller Error:", error);
    res.status(error.message.includes("Invalid") ? 400 : 500).json({ message: error.message });
  }
};

// ========================= SEND STUDY REMINDERS =========================
export const sendStudyReminders = async (req, res) => {
  try {
    const result = await userService.sendStudyReminders();
    res.status(200).json(result);
  } catch (error) {
    console.error("Send Reminders Controller Error:", error);
    res.status(500).json({ message: error.message });
  }
};
