import bcrypt from "bcryptjs";
import crypto from "crypto";
import jwt from "jsonwebtoken";
import validator from "validator";
import { OAuth2Client } from "google-auth-library";
import * as userRepository from "../repositories/userRepository.js";
import sendEmail from "../utils/sendEmail.js";
import { put, del } from "@vercel/blob";

const client = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);

export const verifyUserEmail = async (token) => {
  if (!token) {
    throw new Error("Token verifikasi diperlukan.");
  }

  let decoded;
  try {
    decoded = jwt.verify(token, process.env.JWT_SECRET);
  } catch (err) {
    throw new Error("Link verifikasi tidak valid atau sudah kadaluwarsa.");
  }

  const { name, email, password, role } = decoded;

  const existingUser = await userRepository.findOneUser({ email });
  if (existingUser) {
    throw new Error("Email sudah terdaftar.");
  }

  await userRepository.createUser({ name, email, password, role, isVerified: true });
  
  return { message: "Email berhasil diverifikasi. Silakan login.", email };
};

export const getUserProfile = async (userId) => {
  const user = await userRepository.findUserById(userId, "-password");
  if (!user) {
    throw new Error("User tidak ditemukan");
  }
  return user;
};

export const registerNewUser = async ({ name, email, password, confirmPassword }) => {
  if (!name || !email || !password || !confirmPassword) {
    throw new Error("Nama, email, password, dan konfirmasi password wajib diisi.");
  }
  if (!validator.isEmail(email)) {
    throw new Error("Format email tidak valid.");
  }
  if (password.length < 8) {
    throw new Error("Password harus memiliki minimal 8 karakter.");
  }
  if (password !== confirmPassword) {
    throw new Error("Konfirmasi password tidak cocok.");
  }

  const existingUser = await userRepository.findOneUser({ email });
  if (existingUser) {
    throw new Error("Email sudah digunakan");
  }

  const hashedPassword = await bcrypt.hash(password, 10);
  const userPayload = { name, email, password: hashedPassword, role: "user" };
  const verificationToken = jwt.sign(userPayload, process.env.JWT_SECRET, { expiresIn: '1h' });

  const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
  const verifyUrl = `${frontendUrl}/verif-email?token=${verificationToken}`;
  
  const message = `Verifikasi email Anda: ${verifyUrl}`;
  const htmlMessage = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <style>
        body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background-color: #f3f4f6; margin: 0; padding: 0; line-height: 1.6; }
        .container { max-width: 600px; margin: 30px auto; background-color: #ffffff; border-radius: 16px; overflow: hidden; box-shadow: 0 4px 6px rgba(0,0,0,0.1); border: 1px solid #e5e7eb; }
        .header { background-color: #2563eb; padding: 30px 20px; text-align: center; }
        .content { padding: 20px 30px 40px; color: #374151; text-align: center; }
        .button { background-color: #2563eb; color: #ffffff !important; padding: 14px 28px; border-radius: 12px; text-decoration: none; font-weight: 600; display: inline-block; margin: 25px 0; }
        .footer { background-color: #f9fafb; padding: 20px; text-align: center; font-size: 12px; color: #6b7280; border-top: 1px solid #e5e7eb; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
        
        </div>
        <div class="content">
          <h2 style="margin-top: 0; color: #111827;">Verifikasi Email</h2>
          <p>Halo <strong>${name}</strong>,</p>
          <p>Terima kasih telah mendaftar. Silakan klik tombol di bawah ini untuk memverifikasi email Anda dan mengaktifkan akun:</p>
          <a href="${verifyUrl}" class="button">Verifikasi Email Saya</a>
        </div>
        <div class="footer">
          <p>&copy; ${new Date().getFullYear()} E-Learning Personalisasi.</p>
        </div>
      </div>
    </body>
    </html>
  `;

  await sendEmail({
    email: email,
    subject: 'Verifikasi Email - E-Learning Personalisasi',
    message,
    html: htmlMessage
  });

  return { message: "Registrasi berhasil. Silakan cek email Anda untuk verifikasi." };
};

export const updateUserProfile = async (userId, data, file) => {
    const { name, email, fontSize, fontStyle, reminderEnabled } = data;

    const user = await userRepository.findUserById(userId);
    if (!user) {
      throw new Error("User tidak ditemukan");
    }

    if (email && email !== user.email) {
      const existingUser = await userRepository.findOneUser({ email });
      if (existingUser) {
        throw new Error("Email sudah digunakan");
      }
      user.email = email;
    }

    user.name = name || user.name;
    if (fontSize) user.fontSize = fontSize;
    if (fontStyle) user.fontStyle = fontStyle;
    if (reminderEnabled !== undefined) {
      user.reminderEnabled = reminderEnabled === 'true' || reminderEnabled === true;
    }

    if (file) {
      if (user.avatar && user.avatar.includes("blob.vercel-storage.com")) {
        try {
          await del(user.avatar);
        } catch (err) {
          console.error("Gagal menghapus avatar lama dari Vercel Blob:", err);
        }
      }
      const originalName = file.originalname || `avatar-${Date.now()}`;
      const blobName = `avatars/${Date.now()}-${originalName}`;
      const { url } = await put(blobName, file.buffer, {
        access: 'public',
        contentType: file.mimetype,
      });
      user.avatar = url;
    }

    await userRepository.saveUser(user);

    const userObject = user.toObject();
    delete userObject.password;

    return {
      message: "Profil berhasil diperbarui",
      user: { ...userObject, hasPassword: !!user.password },
    };
};

export const changeUserPassword = async (userId, { currentPassword, newPassword }) => {
    const user = await userRepository.findUserById(userId);
    if (!user) {
      throw new Error("User tidak ditemukan");
    }

    if (!user.password) {
      throw new Error("Tidak dapat mengubah password untuk akun Google");
    }

    const isMatch = await bcrypt.compare(currentPassword, user.password);
    if (!isMatch) {
      throw new Error("Password saat ini salah");
    }

    user.password = await bcrypt.hash(newPassword, 10);
    await userRepository.saveUser(user);

    return { message: "Password berhasil diubah" };
};

export const login = async ({ email, password }) => {
    if (!validator.isEmail(email)) {
      throw new Error("Format email tidak valid.");
    }

    const user = await userRepository.findOneUser({ email });
    if (!user) {
      throw new Error("Email tidak ditemukan");
    }

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      throw new Error("Password salah");
    }

    if (user.isVerified === false) {
      throw new Error("Email belum diverifikasi. Silakan cek inbox email Anda.");
    }

    const token = jwt.sign({ id: user._id, role: user.role }, process.env.JWT_SECRET, { expiresIn: "7d" });

    user.lastActiveAt = new Date();
    await userRepository.saveUser(user);

    const userObject = user.toObject();
    delete userObject.password;

    return {
      message: "Login berhasil",
      user: { ...userObject, hasPassword: true }, 
      token: token, 
    };
};

export const authenticateWithGoogle = async (token) => {
    let email, name, picture;

    try {
      const ticket = await client.verifyIdToken({
        idToken: token,
        audience: process.env.GOOGLE_CLIENT_ID,
      });
      const payload = ticket.getPayload();
      email = payload.email;
      name = payload.name;
      picture = payload.picture;
    } catch (idTokenError) {
      client.setCredentials({ access_token: token });
      const userinfo = await client.request({
        url: "https://www.googleapis.com/oauth2/v3/userinfo",
      });
      email = userinfo.data.email;
      name = userinfo.data.name;
      picture = userinfo.data.picture;
    }

    let user = await userRepository.findOneUser({ email });

    if (!user) {
      user = await userRepository.createUser({
        email, name, avatar: picture, role: 'user', isVerified: true, password: null 
      });
    } else {
      user.name = user.name || name;
      user.avatar = user.avatar || picture;
      user.lastActiveAt = new Date();
      await userRepository.saveUser(user);
    }

    const jwtToken = jwt.sign({ id: user._id, role: user.role }, process.env.JWT_SECRET, { expiresIn: "7d" });

    const userObject = user.toObject();
    delete userObject.password;

    return {
      message: "Autentikasi Google berhasil",
      user: { ...userObject, hasPassword: !!user.password },
      token: jwtToken,
    };
};

export const forgotPassword = async (email) => {
    if (!email) {
      throw new Error('Email wajib diisi.');
    }

    const user = await userRepository.findOneUser({ email });

    if (!user) {
      throw new Error('Email tidak terdaftar.');
    }

    if (!user.password) {
      return { success: false, message: 'Akun ini menggunakan login Google. Silakan login dengan Google.' };
    }

    const resetToken = crypto.randomBytes(32).toString('hex');
    user.resetPasswordToken = crypto.createHash('sha256').update(resetToken).digest('hex');
    user.resetPasswordExpire = Date.now() + 15 * 60 * 1000;
    await userRepository.saveUser(user);

    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
    const resetUrl = `${frontendUrl}/reset-password/${resetToken}`;
    
    const message = `Anda meminta reset password. Silakan klik link berikut: ${resetUrl}`; 
    const htmlMessage = `...`; // Copy from original controller

    await sendEmail({
      email: user.email,
      subject: 'Reset Password Token',
      message,
      html: htmlMessage, 
    });

    return { success: true, message: 'Jika email terdaftar, link reset telah dikirim.' };
};

export const resetPassword = async (token, { password, confirmPassword }) => {
    const resetPasswordToken = crypto.createHash("sha256").update(token).digest("hex");

    const user = await userRepository.findOneUser({
      resetPasswordToken,
      resetPasswordExpire: { $gt: Date.now() },
    });

    if (!user) {
      throw new Error("Token tidak valid atau telah kedaluwarsa");
    }

    if (password !== confirmPassword) {
       throw new Error("Password tidak cocok");
    }
    user.password = await bcrypt.hash(password, 10);
    
    user.resetPasswordToken = undefined;
    user.resetPasswordExpire = undefined;

    await userRepository.saveUser(user);

    return { message: "Password berhasil diubah. Silakan login." };
};

export const logout = async (userId) => {
    if (userId) {
      await userRepository.findUserByIdAndUpdate(userId, { lastActiveAt: new Date(0) });
    }
    return { message: "Logout berhasil" };
};

export const completeTopicForUser = async (userId, topikId) => {
    if (!topikId) {
      throw new Error("topikId diperlukan");
    }

    const user = await userRepository.findUserById(userId);
    if (!user) {
      throw new Error("User tidak ditemukan");
    }

    await userRepository.updateOneUser(
      { _id: userId }, 
      { $addToSet: { topicCompletions: topikId }, lastActiveAt: new Date() }
    );

    return { message: "Topik berhasil ditandai selesai" };
};

export const getUserCompetencyProfile = async (userId) => {
    const user = await userRepository.findUserById(userId, 'competencyProfile');
    const allModules = await userRepository.findModuls({}, 'featureWeights');
    const userFeatureScores = {};

    if (user && user.competencyProfile) {
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
      Object.keys(featureMap).forEach(fid => {
        const data = featureMap[fid];
        userFeatureScores[fid] = data.totalWeight > 0 ? data.weightedSum / data.totalWeight : 0;
      });
    }

    const featureStats = await userRepository.aggregateUsers([
      { $unwind: "$competencyProfile" },
      { $group: { _id: { userId: "$_id", featureId: "$competencyProfile.featureId" }, avgScore: { $avg: "$competencyProfile.score" } } },
      { $group: { _id: "$_id.featureId", averageScore: { $avg: "$avgScore" } } }
    ]);

    const averageScoreMap = new Map(featureStats.map(stat => [stat._id?.toString(), stat.averageScore]));
    const allFeatures = await userRepository.findFeatures({});
    const groupedFeatures = { Dasar: [], Menengah: [], Lanjutan: [] };

    allFeatures.forEach(feature => {
      const featureIdStr = feature._id.toString();
      const featureData = {
        name: feature.name,
        score: userFeatureScores[featureIdStr] || 0,
        average: Math.round(averageScoreMap.get(featureIdStr) || 0),
      };
      if (groupedFeatures[feature.group]) {
        groupedFeatures[feature.group].push(featureData);
      }
    });

    return { competencyProfile: groupedFeatures };
};

export const getAllUsers = async () => {
    return await userRepository.findUsers({}, "-password", { sort: { name: 1 } });
};

export const createNewUser = async ({ name, email, password, role, kelas }) => {
    if (!name || !email) {
      throw new Error("Nama dan email wajib diisi.");
    }
    const existingUser = await userRepository.findOneUser({ email });
    if (existingUser) {
      throw new Error("Email sudah digunakan.");
    }
    const passwordToHash = password || 'password123';
    const hashedPassword = await bcrypt.hash(passwordToHash, 10);
    const newUser = await userRepository.createUser({ name, email, password: hashedPassword, role: role || "user", kelas });
    const userObject = newUser.toObject();
    delete userObject.password;
    return { message: "Pengguna berhasil dibuat.", user: userObject };
};

export const updateUserById = async (userId, data) => {
    const { name, email, role, kelas } = data;
    const user = await userRepository.findUserById(userId);
    if (!user) {
      throw new Error("Pengguna tidak ditemukan.");
    }
    if (email && email !== user.email) {
      const existingUser = await userRepository.findOneUser({ email });
      if (existingUser) {
        throw new Error("Email sudah digunakan.");
      }
    }
    user.name = name || user.name;
    user.email = email || user.email;
    user.role = role || user.role;
    if (kelas !== undefined) user.kelas = kelas;
    const updatedUser = await userRepository.saveUser(user);
    const userObject = updatedUser.toObject();
    delete userObject.password;
    return userObject;
};

export const deleteUserById = async (userId, currentUserId) => {
    if (userId === currentUserId) {
      throw new Error("Tidak dapat menghapus akun sendiri.");
    }
    const user = await userRepository.deleteUserById(userId);
    if (!user) {
      throw new Error("Pengguna tidak ditemukan.");
    }
    return { message: "Pengguna berhasil dihapus." };
};

export const getUserStatus = async (userId) => {
    const user = await userRepository.findUserById(userId, 'hasSeenModulTour hasSeenProfileTour hasSeenModuleDetailTour hasSeenAnalyticsTour lastStreakShownDate');
    if (!user) throw new Error("User not found");
    return user;
};

export const updateUserStatus = async (userId, key, value) => {
    const allowedKeys = ['hasSeenModulTour', 'hasSeenProfileTour', 'hasSeenModuleDetailTour', 'hasSeenAnalyticsTour', 'lastStreakShownDate'];
    if (!allowedKeys.includes(key)) {
      throw new Error("Invalid status key");
    }
    await userRepository.findUserByIdAndUpdate(userId, { [key]: value });
    return { message: "Status updated" };
};

export const sendStudyReminders = async () => {
    const threeDaysAgo = new Date();
    threeDaysAgo.setDate(threeDaysAgo.getDate() - 3);

    const usersToRemind = await userRepository.findUsers({
      reminderEnabled: true,
      role: 'user',
      lastActiveAt: { $lt: threeDaysAgo }, 
      $or: [
        { lastReminderSentAt: { $lt: threeDaysAgo } },
        { lastReminderSentAt: null },
        { lastReminderSentAt: { $exists: false } }
      ]
    });

    if (usersToRemind.length === 0) {
      return { message: "Tidak ada pengguna yang perlu diingatkan saat ini." };
    }

    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
    let sentCount = 0;

    for (const user of usersToRemind) {
      const message = `Halo ${user.name}, yuk lanjutkan belajarmu di E-Learning Personalisasi!`;
      const htmlMessage = `...`; // Copy from original controller
      try {
        await sendEmail({ email: user.email, subject: 'Yuk, Lanjutkan Belajarmu! 🚀', message, html: htmlMessage });
        sentCount++;
        await userRepository.findUserByIdAndUpdate(user._id, { lastReminderSentAt: new Date() });
      } catch (err) {
        console.error(`Gagal mengirim pengingat ke ${user.email}:`, err);
      }
    }

    return { message: `Berhasil mengirim ${sentCount} email pengingat.` };
};