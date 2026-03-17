import express from "express";
import { getPraktikByTopicId, runPractice } from "../controllers/praktikController.js";
import { protect } from "../middlewares/authMiddleware.js";

const router = express.Router();

router.get("/topik/:topicId", protect, getPraktikByTopicId);
router.post("/run", protect, runPractice);

export default router;