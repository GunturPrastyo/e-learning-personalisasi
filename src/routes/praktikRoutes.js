import express from "express";
import { getPraktikByTopicId } from "../controllers/praktikController.js";
import { protect } from "../middlewares/authMiddleware.js";

const router = express.Router();

router.get("/topik/:topicId", protect, getPraktikByTopicId);

export default router;