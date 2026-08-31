import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import User from '../models/User.js';
import Firm from '../models/Firm.js';
import { badRequest } from '../utils/http.js';

const publicUser = (user) => ({
  id: String(user._id),
  name: user.name,
  email: user.email,
  role: user.role,
  firms: user.firms.map((firm) => String(firm._id || firm)),
});

const signToken = (user) =>
  jwt.sign({ sub: String(user._id), role: user.role }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN || '7d',
  });

function validateAccount(body) {
  const name = String(body.name || '').trim();
  const email = String(body.email || '').trim().toLowerCase();
  const password = String(body.password || '');
  if (name.length < 2) throw badRequest('Name must contain at least 2 characters.');
  if (!/^\S+@\S+\.\S+$/.test(email)) throw badRequest('Enter a valid email address.');
  if (password.length < 6) throw badRequest('Password must contain at least 6 characters.');
  return { name, email, password };
}

export async function getSetupStatus(req, res) {
  const adminExists = Boolean(await User.exists({ role: 'admin' }));
  res.json({ setupRequired: !adminExists });
}

export async function getRegistrationFirms(req, res) {
  const firms = await Firm.find({ active: true }).select('name code').sort({ name: 1 }).lean();
  res.json({ firms });
}

export async function setupAdmin(req, res) {
  if (await User.exists({ role: 'admin' })) {
    return res.status(409).json({ message: 'Admin setup is already complete.' });
  }
  const account = validateAccount(req.body);
  const firms = await Promise.all([
    Firm.findOneAndUpdate({ code: 'RAGHAV' }, { $setOnInsert: { name: 'Raghav', code: 'RAGHAV' } }, { upsert: true, new: true }),
    Firm.findOneAndUpdate({ code: 'SANJANA' }, { $setOnInsert: { name: 'Sanjana', code: 'SANJANA' } }, { upsert: true, new: true }),
  ]);
  const user = await User.create({
    name: account.name,
    email: account.email,
    passwordHash: await bcrypt.hash(account.password, 12),
    role: 'admin',
    firms: firms.map((firm) => firm._id),
  });
  res.status(201).json({ token: signToken(user), user: publicUser(user) });
}

export async function register(req, res) {
  const account = validateAccount(req.body);
  const firmIds = [...new Set((req.body.firmIds || []).map(String))];
  if (!firmIds.length) throw badRequest('Select at least one firm.');
  const firms = await Firm.find({ _id: { $in: firmIds }, active: true });
  if (firms.length !== firmIds.length) throw badRequest('One or more selected firms are invalid.');
  const user = await User.create({
    name: account.name,
    email: account.email,
    passwordHash: await bcrypt.hash(account.password, 12),
    role: 'labour',
    firms: firmIds,
  });
  res.status(201).json({ token: signToken(user), user: publicUser(user) });
}

export async function login(req, res) {
  const email = String(req.body.email || '').trim().toLowerCase();
  const user = await User.findOne({ email, active: true });
  if (!user || !(await bcrypt.compare(String(req.body.password || ''), user.passwordHash))) {
    return res.status(401).json({ message: 'Email or password is incorrect.' });
  }
  res.json({ token: signToken(user), user: publicUser(user) });
}

export function getCurrentUser(req, res) {
  res.json({ user: publicUser(req.user) });
}
