import Result from "../models/Result.js";
import User from "../models/User.js";
import Question from "../models/Question.js";
import Materi from "../models/Materi.js";
import Modul from "../models/Modul.js";
import Topik from "../models/Topik.js";
import Feature from "../models/Feature.js";

export const findResults = async (query = {}, populateOptions = "") => {
  return await Result.find(query).populate(populateOptions);
};

export const findOneResult = async (query = {}, selectOptions = "") => {
  return await Result.findOne(query).select(selectOptions);
};

export const findResultById = async (id, selectOptions = "") => {
  return await Result.findById(id).select(selectOptions);
};

export const createResult = async (data) => {
  const newResult = new Result(data);
  return await newResult.save();
};

export const findOneAndUpdateResult = async (query, update, options) => {
  return await Result.findOneAndUpdate(query, update, options);
};

export const deleteManyResults = async (query) => {
  return await Result.deleteMany(query);
};

export const deleteOneResult = async (query) => {
  return await Result.deleteOne(query);
};

export const aggregateResults = async (pipeline) => {
  return await Result.aggregate(pipeline);
};

export const findUserById = async (userId, selectOptions = "") => {
  return await User.findById(userId).select(selectOptions);
};

export const findUserAndUpdate = async (userId, update) => {
  return await User.findByIdAndUpdate(userId, update);
};

export const saveUser = async (user) => {
  return await user.save();
};

export const findQuestions = async (query = {}, selectOptions = "") => {
  return await Question.find(query).select(selectOptions);
};

export const findMateri = async (query = {}) => {
  return await Materi.findOne(query);
};

export const findModul = async (query = {}, selectOptions = "") => {
  return await Modul.find(query).select(selectOptions);
};

export const findTopik = async (query = {}, selectOptions = "") => {
  return await Topik.find(query).select(selectOptions);
};

export const findFeatures = async (query = {}) => {
  return await Feature.find(query);
};

export const findUsers = async (query = {}, selectOptions = "") => {
  return await User.find(query).select(selectOptions);
};

export const aggregateUsers = async (pipeline) => {
  return await User.aggregate(pipeline);
};