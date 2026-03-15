import mongoose from "mongoose";

const subMateriSchema = new mongoose.Schema({
  title: {
    type: String,
    required: [true, "Judul sub-materi tidak boleh kosong."],
    trim: true,
  },
  content: {
    type: String,
    required: [true, "Konten sub-materi tidak boleh kosong."],
  },
});

const practiceSchema = new mongoose.Schema({
  topikId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Topik",
  },
  type: {
    type: String,
    enum: ['html', 'javascript'],
    required: true,
  },
  title: {
    type: String,
    required: true,
  },
  description: {
    type: String,
    required: true,
  },
  initialCode: { type: String, default: '' },
  hint: { type: String, default: '' },
  expectedOutputRegex: [{ type: String }],
});

const materiSchema = new mongoose.Schema(
  {
    modulId: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
      ref: "Modul",
    },
    topikId: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
      ref: "Topik",
      unique: true,
    },
    subMateris: [subMateriSchema], 
    youtube: {
      type: String,
      trim: true,
    },
    practices: [practiceSchema], 
  },
  {
    timestamps: true, 
  }
);

const Materi = mongoose.model("Materi", materiSchema);
export default Materi;