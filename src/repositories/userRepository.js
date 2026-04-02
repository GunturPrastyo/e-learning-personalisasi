import User from "../models/User.js";
import Modul from "../models/Modul.js";
import Feature from "../models/Feature.js";

export const findOneUser = async (query, selectOptions = "") => {
  return await User.findOne(query).select(selectOptions);
};

export const findUserById = async (id, selectOptions = "") => {
  return await User.findById(id).select(selectOptions);
};

export const createUser = async (data) => {
  return await User.create(data);
};

export const findUserByIdAndUpdate = async (id, update, options) => {
  return await User.findByIdAndUpdate(id, update, options);
};

export const deleteUserById = async (id) => {
  return await User.findByIdAndDelete(id);
};

export const findUsers = async (query = {}, selectOptions = "") => {
  return await User.find(query).select(selectOptions);
};

export const aggregateUsers = async (pipeline) => {
  return await User.aggregate(pipeline);
};

export const saveUser = async (user) => {
  return await user.save();
};

export const findModuls = async (query = {}, selectOptions = "") => {
  return await Modul.find(query).select(selectOptions).lean();
};

export const findFeatures = async (query = {}) => {
  return await Feature.find(query).sort({ name: 1 }).lean();
};

export const updateOneUser = async (query, update) => {
    return await User.updateOne(query, update);
};