import Result from "../models/Result.js";
import User from "../models/User.js";
import Topik from "../models/Topik.js";
import Modul from "../models/Modul.js";

export const countUsers = async (query) => {
  return await User.countDocuments(query);
};

export const aggregateResults = async (pipeline) => {
  return await Result.aggregate(pipeline);
};

export const countTopics = async (query) => {
  return await Topik.countDocuments(query);
};

export const aggregateUsers = async (pipeline) => {
  return await User.aggregate(pipeline);
};

export const aggregateModuls = async (pipeline) => {
  return await Modul.aggregate(pipeline);
};

export const findUserById = async (id) => {
  return await User.findById(id);
};

export const findTopicById = async (id, selectOptions = "") => {
  return await Topik.findById(id).select(selectOptions);
};