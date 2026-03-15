import express from 'express';
import { getMateriByTopik, saveMateri } from '../controllers/materiController.js';

const router = express.Router();

// Gunakan middleware autentikasi (seperti protect, admin) jika dibutuhkan
router.post('/save', saveMateri);
router.get('/modul/:slug/topik/:topikSlug', getMateriByTopik);

export default router;