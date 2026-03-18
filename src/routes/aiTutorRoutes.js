import express from "express";
import { askAITutor } from "../controllers/aiTutorController.js";
import { protect } from "../middlewares/authMiddleware.js"; 

const router = express.Router();

// Kita gunakan middleware protect agar hanya user yang login yang bisa bertanya
// (Sesuaikan import middleware auth Anda jika namanya berbeda)
router.post("/ask", protect, askAITutor);

export default router;