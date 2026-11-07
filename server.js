import 'dotenv/config';
import express from 'express';
import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import helmet from 'helmet';
import cors from 'cors';
import rateLimit from 'express-rate-limit';
import multer from 'multer';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const port = Number(process.env.PORT || 4173);
const jwtSecret = process.env.JWT_SECRET;
if (!jwtSecret || jwtSecret.length < 32) throw new Error('Set JWT_SECRET to at least 32 characters in .env');

mongoose.set('bufferCommands', false);
let databaseConnected = false;
try {
  await mongoose.connect(process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/innovatex', { serverSelectionTimeoutMS: 5000 });
  databaseConnected = true;
} catch (error) {
  const code = error?.cause?.code || error?.code;
  console.error('MongoDB connection unavailable. Check the local URI, Atlas IP allowlist, credentials, and outbound database access.');
  if (typeof code === 'string' && /^[A-Z0-9_]+$/.test(code)) console.error(`MongoDB error code: ${code}`);
}
const { Schema, model } = mongoose;
const criteriaSchema = new Schema({ name: { type: String, required: true }, weight: { type: Number, required: true, min: 0, max: 100 } }, { _id: false });
const userSchema = new Schema({ name: { type: String, required: true, trim: true }, email: { type: String, required: true, unique: true, lowercase: true, trim: true }, passwordHash: { type: String, required: true, select: false }, role: { type: String, enum: ['Administrator', 'Participant', 'Reviewer'], default: 'Participant' } }, { timestamps: true });
const challengeSchema = new Schema({ title: { type: String, required: true, trim: true }, category: { type: String, required: true }, status: { type: String, enum: ['Open', 'Coming soon', 'Closed'], default: 'Coming soon' }, description: { type: String, required: true }, deadline: { type: Date, required: true }, prize: { type: String, default: 'Prize TBA' }, participants: [{ type: Schema.Types.ObjectId, ref: 'User' }], reviewers: [{ type: Schema.Types.ObjectId, ref: 'User' }], criteria: { type: [criteriaSchema], default: () => [{ name: 'Innovation', weight: 30 }, { name: 'Feasibility', weight: 20 }, { name: 'Technical Implementation', weight: 20 }, { name: 'Problem Solving', weight: 15 }, { name: 'Potential Impact', weight: 15 }] } }, { timestamps: true });
const proposalSchema = new Schema({ title: { type: String, required: true, trim: true }, challenge: { type: Schema.Types.ObjectId, ref: 'Challenge', required: true }, participant: { type: Schema.Types.ObjectId, ref: 'User', required: true }, problem: { type: String, required: true }, solution: { type: String, required: true }, innovation: String, technologies: String, impact: String, attachment: String, status: { type: String, enum: ['Submitted', 'Under review', 'Reviewed', 'Finalist', 'Winner'], default: 'Submitted' }, score: { type: Number, default: 0 }, feedbackReleased: { type: Boolean, default: false } }, { timestamps: true });
proposalSchema.index({ challenge: 1, participant: 1 }, { unique: true });
const reviewSchema = new Schema({ proposal: { type: Schema.Types.ObjectId, ref: 'Proposal', required: true }, reviewer: { type: Schema.Types.ObjectId, ref: 'User', required: true }, scores: { type: Map, of: Number, required: true }, weightedScore: { type: Number, required: true }, feedback: { type: String, default: '' } }, { timestamps: true });
reviewSchema.index({ proposal: 1, reviewer: 1 }, { unique: true });
const registrationSchema = new Schema({ user: { type: Schema.Types.ObjectId, ref: 'User', required: true }, challenge: { type: Schema.Types.ObjectId, ref: 'Challenge', required: true } }, { timestamps: true });
registrationSchema.index({ user: 1, challenge: 1 }, { unique: true });
const notificationSchema = new Schema({ user: { type: Schema.Types.ObjectId, ref: 'User', required: true }, message: { type: String, required: true }, read: { type: Boolean, default: false } }, { timestamps: true });
const User = model('User', userSchema), Challenge = model('Challenge', challengeSchema), Proposal = model('Proposal', proposalSchema), Review = model('Review', reviewSchema), Registration = model('Registration', registrationSchema), Notification = model('Notification', notificationSchema);

app.use(helmet({ contentSecurityPolicy: false }));
app.use(cors({ origin: process.env.CLIENT_ORIGIN || `http://localhost:${port}` }));
app.use(express.json({ limit: '1mb' }));
app.use('/api/auth', rateLimit({ windowMs: 15 * 60 * 1000, limit: 30, standardHeaders: true, legacyHeaders: false }));
const uploadDir = path.resolve(here, process.env.UPLOAD_DIR || 'uploads');
fs.mkdirSync(uploadDir, { recursive: true });
const storage = multer.diskStorage({ destination: uploadDir, filename: (_req, file, cb) => cb(null, `${Date.now()}-${crypto.randomUUID()}${path.extname(file.originalname).toLowerCase()}`) });
const upload = multer({ storage, limits: { fileSize: Number(process.env.MAX_FILE_MB || 10) * 1024 * 1024 }, fileFilter: (_req, file, cb) => { const valid = /\.(pdf|ppt|pptx|doc|docx)$/i.test(file.originalname) && ['application/pdf', 'application/vnd.ms-powerpoint', 'application/vnd.openxmlformats-officedocument.presentationml.presentation', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'].includes(file.mimetype); cb(valid ? null : Object.assign(new Error('Only PDF, PPT, and Word files are accepted'), { status: 400 }), valid); } });

const fail = (res, code, message) => res.status(code).json({ error: message });
const asyncRoute = fn => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
function auth(req, res, next) { const token = req.headers.authorization?.replace(/^Bearer\s+/i, ''); if (!token) return fail(res, 401, 'Sign in required'); try { const payload = jwt.verify(token, jwtSecret); User.findById(payload.sub).select('role name').then(user => { if (!user) return fail(res, 401, 'Account no longer exists'); req.auth = { ...payload, role: user.role, name: user.name }; next(); }).catch(next); } catch { return fail(res, 401, 'Session expired; sign in again'); } }
const roles = (...allowed) => (req, res, next) => allowed.includes(req.auth.role) ? next() : fail(res, 403, 'This role cannot perform that action');
const tokenFor = user => jwt.sign({ sub: String(user._id), role: user.role, name: user.name }, jwtSecret, { expiresIn: '12h' });
const safeUser = u => ({ id: String(u._id), name: u.name, email: u.email, role: u.role });
const defaultCriteria = [{ name: 'Innovation', weight: 30 }, { name: 'Feasibility', weight: 20 }, { name: 'Technical Implementation', weight: 20 }, { name: 'Problem Solving', weight: 15 }, { name: 'Potential Impact', weight: 15 }];
function validateCriteria(c) { return Array.isArray(c) && c.length > 0 && c.every(x => typeof x.name === 'string' && x.name.trim() && Number.isFinite(+x.weight) && +x.weight >= 0) && Math.abs(c.reduce((n, x) => n + +x.weight, 0) - 100) < 0.001; }
async function recompute(proposalId) { const reviews = await Review.find({ proposal: proposalId }); const score = reviews.length ? reviews.reduce((n, r) => n + r.weightedScore, 0) / reviews.length : 0; await Proposal.findByIdAndUpdate(proposalId, { score: Math.round(score * 100) / 100, status: reviews.length ? 'Reviewed' : 'Under review' }); }
async function notify(user, message) { await Notification.create({ user, message }); }

app.get('/api/health', (_req, res) => res.status(databaseConnected ? 200 : 503).json({ status: databaseConnected ? 'ok' : 'waiting-for-database', database: databaseConnected ? 'connected' : 'disconnected' }));
app.use('/api', (req, res, next) => { if (req.path === '/health' || databaseConnected) return next(); res.status(503).json({ error: 'MongoDB is not connected. Set MONGODB_URI in .env and restart the server.' }); });
app.post('/api/auth/register', asyncRoute(async (req, res) => { const { name, email, password, role } = req.body || {}; if (!name?.trim() || !/^\S+@\S+\.\S+$/.test(email || '') || !password || password.length < 8) return fail(res, 400, 'Enter a name, valid email, and password of at least 8 characters'); if (!['Participant', 'Reviewer'].includes(role || 'Participant')) return fail(res, 400, 'Choose Participant or Reviewer'); if (await User.exists({ email: email.toLowerCase() })) return fail(res, 409, 'An account with this email already exists'); const user = await User.create({ name, email, role: role || 'Participant', passwordHash: await bcrypt.hash(password, 12) }); res.status(201).json({ token: tokenFor(user), user: safeUser(user) }); }));
app.post('/api/auth/login', asyncRoute(async (req, res) => { const user = await User.findOne({ email: (req.body.email || '').toLowerCase() }).select('+passwordHash'); if (!user || !await bcrypt.compare(req.body.password || '', user.passwordHash)) return fail(res, 401, 'Email or password is incorrect'); res.json({ token: tokenFor(user), user: safeUser(user) }); }));
app.get('/api/auth/me', auth, asyncRoute(async (req, res) => { const u = await User.findById(req.auth.sub); if (!u) return fail(res, 401, 'Account no longer exists'); res.json({ user: safeUser(u) }); }));
app.patch('/api/auth/profile', auth, asyncRoute(async (req, res) => { const name = String(req.body.name || '').trim(); if (name.length < 2 || name.length > 100) return fail(res, 400, 'Name must be between 2 and 100 characters'); const u = await User.findByIdAndUpdate(req.auth.sub, { name }, { new: true, runValidators: true }); res.json({ user: safeUser(u) }); }));
app.post('/api/auth/change-role', auth, roles('Administrator'), asyncRoute(async (req, res) => { const { userId, role } = req.body; if (!['Administrator', 'Participant', 'Reviewer'].includes(role)) return fail(res, 400, 'Invalid role'); const u = await User.findByIdAndUpdate(userId, { role }, { new: true }); if (!u) return fail(res, 404, 'User not found'); res.json({ user: safeUser(u) }); }));

app.get('/api/challenges', asyncRoute(async (req, res) => { const q = {}; if (req.query.status) q.status = req.query.status; if (req.query.category) q.category = req.query.category; if (req.query.search) q.title = { $regex: String(req.query.search).slice(0, 80), $options: 'i' }; res.json(await Challenge.find(q).sort({ createdAt: -1 }).populate('reviewers', 'name email').lean()); }));
app.get('/api/challenges/:id', asyncRoute(async (req, res) => { const c = await Challenge.findById(req.params.id).populate('reviewers', 'name email'); if (!c) return fail(res, 404, 'Challenge not found'); res.json(c); }));
app.post('/api/challenges', auth, roles('Administrator'), asyncRoute(async (req, res) => { const b = req.body; if (!b.title || !b.category || !b.description || !b.deadline) return fail(res, 400, 'Title, category, description, and deadline are required'); const criteria = b.criteria || defaultCriteria; if (!validateCriteria(criteria)) return fail(res, 400, 'Evaluation criteria weights must total 100'); res.status(201).json(await Challenge.create({ ...b, criteria })); }));
app.patch('/api/challenges/:id', auth, roles('Administrator'), asyncRoute(async (req, res) => { if (req.body.criteria && !validateCriteria(req.body.criteria)) return fail(res, 400, 'Evaluation criteria weights must total 100'); const c = await Challenge.findByIdAndUpdate(req.params.id, req.body, { new: true, runValidators: true }); if (!c) return fail(res, 404, 'Challenge not found'); res.json(c); }));
app.delete('/api/challenges/:id', auth, roles('Administrator'), asyncRoute(async (req, res) => { const c = await Challenge.findByIdAndDelete(req.params.id); if (!c) return fail(res, 404, 'Challenge not found'); const ids = await Proposal.find({ challenge: c._id }).distinct('_id'); await Promise.all([Registration.deleteMany({ challenge: c._id }), Review.deleteMany({ proposal: { $in: ids } }), Proposal.deleteMany({ challenge: c._id })]); res.json({ deleted: true }); }));
app.post('/api/challenges/:id/register', auth, roles('Participant'), asyncRoute(async (req, res) => { const c = await Challenge.findById(req.params.id); if (!c) return fail(res, 404, 'Challenge not found'); if (c.status !== 'Open' || c.deadline < new Date()) return fail(res, 400, 'This challenge is not accepting registrations'); try { await Registration.create({ user: req.auth.sub, challenge: c._id }); await Challenge.updateOne({ _id: c._id }, { $addToSet: { participants: req.auth.sub } }); res.status(201).json({ registered: true }); } catch (e) { if (e.code === 11000) return fail(res, 409, 'Already registered for this challenge'); throw e; } }));
app.get('/api/challenges/:id/registrations', auth, roles('Administrator'), asyncRoute(async (req, res) => res.json(await Registration.find({ challenge: req.params.id }).populate('user', 'name email').lean())));
app.put('/api/challenges/:id/reviewers', auth, roles('Administrator'), asyncRoute(async (req, res) => { const ids = req.body.reviewerIds; if (!Array.isArray(ids)) return fail(res, 400, 'reviewerIds must be an array'); const n = await User.countDocuments({ _id: { $in: ids }, role: 'Reviewer' }); if (n !== new Set(ids).size) return fail(res, 400, 'Every assigned account must have the Reviewer role'); const c = await Challenge.findByIdAndUpdate(req.params.id, { reviewers: ids }, { new: true }).populate('reviewers', 'name email'); if (!c) return fail(res, 404, 'Challenge not found'); res.json(c); }));

app.get('/api/proposals', auth, asyncRoute(async (req, res) => { const q = req.auth.role === 'Participant' ? { participant: req.auth.sub } : {}; if (req.query.challenge) q.challenge = req.query.challenge; const rows = await Proposal.find(q).populate('challenge', 'title criteria').populate('participant', 'name').lean(); if (req.auth.role === 'Reviewer') { const assigned = await Challenge.find({ reviewers: req.auth.sub }).distinct('_id'); const allowed = rows.filter(p => assigned.some(id => String(id) === String(p.challenge._id))); return res.json(allowed); } res.json(rows); }));
app.post('/api/proposals', auth, roles('Participant'), upload.single('attachment'), asyncRoute(async (req, res) => { const { title, challenge, problem, solution } = req.body; if (!title || !challenge || !problem || !solution) return fail(res, 400, 'Title, challenge, problem, and solution are required'); const c = await Challenge.findById(challenge); if (!c || c.status !== 'Open' || c.deadline < new Date()) return fail(res, 400, 'Challenge is unavailable or past deadline'); if (!await Registration.exists({ user: req.auth.sub, challenge })) return fail(res, 403, 'Register for the challenge before submitting'); const p = await Proposal.create({ ...req.body, challenge, participant: req.auth.sub, attachment: req.file ? `/uploads/${req.file.filename}` : undefined }); const admins = await User.find({ role: 'Administrator' }).select('_id'); await Promise.all(admins.map(a => notify(a._id, `New proposal submitted: ${p.title}`))); res.status(201).json(p); }));
app.patch('/api/proposals/:id', auth, roles('Participant'), upload.single('attachment'), asyncRoute(async (req, res) => { const p = await Proposal.findOne({ _id: req.params.id, participant: req.auth.sub }); if (!p) return fail(res, 404, 'Proposal not found'); const c = await Challenge.findById(p.challenge); if (c.deadline < new Date() || ['Winner', 'Finalist'].includes(p.status)) return fail(res, 403, 'This proposal can no longer be edited'); for (const k of ['title', 'problem', 'solution', 'innovation', 'technologies', 'impact']) if (req.body[k] !== undefined) p[k] = req.body[k]; if (req.file) p.attachment = `/uploads/${req.file.filename}`; await p.save(); res.json(p); }));
app.delete('/api/proposals/:id', auth, asyncRoute(async (req, res) => { const p = await Proposal.findById(req.params.id); if (!p) return fail(res, 404, 'Proposal not found'); if (req.auth.role !== 'Administrator' && (req.auth.role !== 'Participant' || String(p.participant) !== req.auth.sub)) return fail(res, 403, 'Not allowed'); if (p.status !== 'Submitted' && req.auth.role !== 'Administrator') return fail(res, 403, 'Only a submitted proposal can be withdrawn'); await Review.deleteMany({ proposal: p._id }); await p.deleteOne(); res.json({ deleted: true }); }));
app.get('/api/proposals/:id', auth, asyncRoute(async (req, res) => { const p = await Proposal.findById(req.params.id).populate('challenge').populate('participant', 'name email'); if (!p) return fail(res, 404, 'Proposal not found'); if (req.auth.role === 'Participant' && String(p.participant._id) !== req.auth.sub) return fail(res, 403, 'Not allowed'); if (req.auth.role === 'Reviewer' && !await Challenge.exists({ _id: p.challenge._id, reviewers: req.auth.sub })) return fail(res, 403, 'Challenge is not assigned to you'); const reviews = await Review.find({ proposal: p._id }).populate('reviewer', 'name'); res.json({ ...p.toObject(), reviews: req.auth.role === 'Administrator' || p.feedbackReleased ? reviews : [] }); }));
app.get('/api/proposals/:id/attachment', auth, asyncRoute(async (req, res) => { const p = await Proposal.findById(req.params.id).populate('challenge'); if (!p || !p.attachment) return fail(res, 404, 'Attachment not found'); if (req.auth.role === 'Participant' && String(p.participant) !== req.auth.sub) return fail(res, 403, 'Not allowed'); if (req.auth.role === 'Reviewer' && !await Challenge.exists({ _id: p.challenge._id, reviewers: req.auth.sub })) return fail(res, 403, 'Challenge is not assigned to you'); const fullPath = path.join(uploadDir, path.basename(p.attachment)); if (!fs.existsSync(fullPath)) return fail(res, 404, 'Attachment file is missing'); res.download(fullPath); }));

app.get('/api/reviews', auth, roles('Reviewer', 'Administrator'), asyncRoute(async (req, res) => { const filter = req.auth.role === 'Reviewer' ? { reviewer: req.auth.sub } : {}; const reviews = await Review.find(filter).populate('proposal', 'title challenge').lean(); if (req.auth.role === 'Administrator') return res.json(reviews); const assigned = await Challenge.find({ reviewers: req.auth.sub }).distinct('_id'); const pending = await Proposal.find({ challenge: { $in: assigned } }).populate('challenge', 'title criteria').populate('participant', 'name').lean(); const done = new Set(reviews.map(r => String(r.proposal._id))); res.json({ completed: reviews, pending: pending.filter(p => !done.has(String(p._id))) }); }));
app.post('/api/proposals/:id/reviews', auth, roles('Reviewer'), asyncRoute(async (req, res) => { const p = await Proposal.findById(req.params.id).populate('challenge'); if (!p) return fail(res, 404, 'Proposal not found'); if (!p.challenge.reviewers.some(id => String(id) === req.auth.sub)) return fail(res, 403, 'This challenge is not assigned to you'); const criteria = p.challenge.criteria; const given = req.body.scores || {}; if (criteria.some(c => !Number.isFinite(+given[c.name]) || +given[c.name] < 1 || +given[c.name] > 10)) return fail(res, 400, 'Provide a score from 1 to 10 for every criterion'); const weightedScore = criteria.reduce((n, c) => n + (+given[c.name] * c.weight / 100), 0); try { const review = await Review.create({ proposal: p._id, reviewer: req.auth.sub, scores: given, weightedScore, feedback: String(req.body.feedback || '').slice(0, 4000) }); await recompute(p._id); await notify(p.participant, `Your proposal "${p.title}" received a review`); res.status(201).json(review); } catch (e) { if (e.code === 11000) return fail(res, 409, 'You have already reviewed this proposal'); throw e; } }));
app.patch('/api/reviews/:id', auth, roles('Administrator'), asyncRoute(async (req, res) => { const review = await Review.findById(req.params.id); if (!review) return fail(res, 404, 'Review not found'); if (req.body.feedback !== undefined) review.feedback = String(req.body.feedback).slice(0, 4000); if (req.body.scores) { const p = await Proposal.findById(review.proposal).populate('challenge'); const criteria = p.challenge.criteria; if (criteria.some(c => !Number.isFinite(+req.body.scores[c.name]) || +req.body.scores[c.name] < 1 || +req.body.scores[c.name] > 10)) return fail(res, 400, 'Provide a score from 1 to 10 for every criterion'); review.scores = req.body.scores; review.weightedScore = criteria.reduce((n, c) => n + (+req.body.scores[c.name] * c.weight / 100), 0); } await review.save(); await recompute(review.proposal); res.json(review); }));
app.put('/api/proposals/:id/feedback', auth, roles('Administrator'), asyncRoute(async (req, res) => { const p = await Proposal.findByIdAndUpdate(req.params.id, { feedbackReleased: Boolean(req.body.released) }, { new: true }); if (!p) return fail(res, 404, 'Proposal not found'); res.json({ released: p.feedbackReleased }); }));

app.get('/api/leaderboard', asyncRoute(async (req, res) => { const q = {}; if (req.query.challenge) q.challenge = req.query.challenge; res.json(await Proposal.find(q).sort({ score: -1 }).populate('participant', 'name').populate('challenge', 'title').lean()); }));
app.post('/api/results/:id/shortlist', auth, roles('Administrator'), asyncRoute(async (req, res) => { const p = await Proposal.findByIdAndUpdate(req.params.id, { status: 'Finalist' }, { new: true }); if (!p) return fail(res, 404, 'Proposal not found'); res.json(p); }));
app.post('/api/results/:id/winner', auth, roles('Administrator'), asyncRoute(async (req, res) => { const p = await Proposal.findById(req.params.id); if (!p) return fail(res, 404, 'Proposal not found'); await Proposal.updateMany({ challenge: p.challenge, status: 'Winner' }, { status: 'Finalist' }); p.status = 'Winner'; await p.save(); res.json(p); }));
app.get('/api/results', asyncRoute(async (_req, res) => res.json(await Proposal.find({ status: { $in: ['Finalist', 'Winner'] } }).sort({ score: -1 }).populate('participant', 'name').populate('challenge', 'title').lean())));
app.get('/api/users', auth, roles('Administrator'), asyncRoute(async (_req, res) => res.json((await User.find().select('name email role createdAt').sort({ createdAt: -1 }).lean()))));
app.get('/api/notifications', auth, asyncRoute(async (req, res) => res.json(await Notification.find({ user: req.auth.sub }).sort({ createdAt: -1 }).limit(50).lean())));
app.patch('/api/notifications/:id/read', auth, asyncRoute(async (req, res) => { const n = await Notification.findOneAndUpdate({ _id: req.params.id, user: req.auth.sub }, { read: true }, { new: true }); if (!n) return fail(res, 404, 'Notification not found'); res.json(n); }));
app.get('/api/analytics', auth, roles('Administrator'), asyncRoute(async (_req, res) => { const [challenges, participants, submissions, pending, categories, challengePerformance] = await Promise.all([Challenge.countDocuments(), User.countDocuments({ role: 'Participant' }), Proposal.countDocuments(), Proposal.countDocuments({ status: { $in: ['Submitted', 'Under review'] } }), Challenge.aggregate([{ $group: { _id: '$category', count: { $sum: 1 } } }, { $sort: { count: -1 } }]), Challenge.aggregate([{ $lookup: { from: 'proposals', localField: '_id', foreignField: 'challenge', as: 'entries' } }, { $project: { title: 1, submissions: { $size: '$entries' } } }, { $sort: { submissions: -1 } }, { $limit: 5 }])]); res.json({ challenges, participants, submissions, pendingEvaluations: pending, categories, challengePerformance }); }));

async function seedDemo() {
  if (process.env.SEED_DEMO !== 'true') return;
  if (await User.estimatedDocumentCount()) return;
  const people = await User.insertMany([
    { name: 'Alex Morgan', email: 'admin@demo.com', role: 'Administrator', passwordHash: await bcrypt.hash('DemoAdmin123!', 12) },
    { name: 'Aarav Mehta', email: 'aarav@demo.com', role: 'Participant', passwordHash: await bcrypt.hash('DemoUser123!', 12) },
    { name: 'Maya Iyer', email: 'maya@demo.com', role: 'Participant', passwordHash: await bcrypt.hash('DemoUser123!', 12) },
    { name: 'Kabir Shah', email: 'kabir@demo.com', role: 'Participant', passwordHash: await bcrypt.hash('DemoUser123!', 12) },
    { name: 'Riya Nair', email: 'riya@demo.com', role: 'Participant', passwordHash: await bcrypt.hash('DemoUser123!', 12) },
    { name: 'Dev Patel', email: 'dev@demo.com', role: 'Participant', passwordHash: await bcrypt.hash('DemoUser123!', 12) },
    { name: 'Dr. Anika Bose', email: 'anika@demo.com', role: 'Reviewer', passwordHash: await bcrypt.hash('DemoReview123!', 12) },
    { name: 'Rohan Kulkarni', email: 'rohan@demo.com', role: 'Reviewer', passwordHash: await bcrypt.hash('DemoReview123!', 12) }
  ]);
  const byEmail = Object.fromEntries(people.map(p => [p.email, p]));
  const challenges = await Challenge.insertMany([
    { title: 'The Circular City Challenge', category: 'Sustainability', status: 'Open', description: 'Reimagine the way our cities use, reuse and regenerate resources. Build a future that leaves nothing behind.', deadline: new Date('2026-12-18'), prize: '₹1,50,000', participants: people.slice(1, 6).map(p => p._id), reviewers: [byEmail['anika@demo.com']._id, byEmail['rohan@demo.com']._id] },
    { title: 'AI for Everyday Health', category: 'Healthcare', status: 'Open', description: 'Make preventive care more personal, accessible and human through thoughtful applications of artificial intelligence.', deadline: new Date('2026-12-04'), prize: '₹1,00,000', participants: [byEmail['maya@demo.com']._id, byEmail['dev@demo.com']._id], reviewers: [byEmail['anika@demo.com']._id] },
    { title: 'Fintech for All', category: 'Finance', status: 'Open', description: 'Design inclusive financial tools that give every community a fair shot at building a secure future.', deadline: new Date('2027-01-10'), prize: '₹75,000', participants: [byEmail['riya@demo.com']._id], reviewers: [byEmail['rohan@demo.com']._id] },
    { title: 'Learning Without Limits', category: 'Education', status: 'Coming soon', description: 'Open up new paths to learning with tools that meet every student where they are.', deadline: new Date('2027-01-30'), prize: '₹50,000', reviewers: [byEmail['anika@demo.com']._id] }
  ]);
  await Registration.insertMany(people.slice(1, 6).map((p, i) => ({ user: p._id, challenge: challenges[i < 3 ? 0 : 1]._id })));
  const sample = [
    ['ReThread', 1, 9.2, 'A neighborhood textile exchange using smart lockers and material passports.', 'We turn discarded clothing into a local circular economy.', 'Finalist'],
    ['PulsePath', 2, 8.8, 'An offline-first health companion that spots patterns before symptoms become serious.', 'A low-cost triage and prevention tool for rural clinics.', 'Reviewed'],
    ['Loop Local', 1, 8.5, 'A citywide marketplace for surplus construction materials.', 'Connects demolition sites with builders who need reclaimed supplies.', 'Under review'],
    ['Pocket Seed', 3, 8.1, 'A savings app that rounds up purchases for community goals.', 'Makes group saving simple and transparent.', 'Submitted'],
    ['OpenBench', 1, 7.9, 'A repair map that connects people to local fixers and shared tools.', 'A searchable map for repair skills and equipment.', 'Under review'],
    ['QuietMind', 2, 7.6, 'A voice-first wellbeing check-in for people who live alone.', 'Gentle daily check-ins with opt-in human support.', 'Submitted']
  ];
  const proposers = ['aarav@demo.com', 'maya@demo.com', 'kabir@demo.com', 'riya@demo.com', 'dev@demo.com', 'maya@demo.com'];
  const proposals = await Proposal.insertMany(sample.map(([title, c, score, problem, solution, status], i) => ({ title, challenge: challenges[c - 1]._id, participant: byEmail[proposers[i]]._id, problem, solution, innovation: problem, status, score })));
  const scoreSets = [[9, 9, 9, 9, 10], [9, 8, 9, 9, 9], [8, 9, 8, 9, 9], [8, 8, 8, 8, 9], [8, 8, 8, 8, 8], [8, 7, 8, 8, 8]];
  for (let i = 0; i < proposals.length; i++) {
    const challenge = challenges[sample[i][1] - 1];
    const criteria = challenge.criteria;
    const scores = Object.fromEntries(criteria.map((c, j) => [c.name, scoreSets[i][j]]));
    const weightedScore = criteria.reduce((n, c) => n + scores[c.name] * c.weight / 100, 0);
    const reviewer = challenge.reviewers[i % challenge.reviewers.length];
    if (['Finalist', 'Reviewed'].includes(sample[i][5])) await Review.create({ proposal: proposals[i]._id, reviewer, scores, weightedScore, feedback: 'A promising proposal. Consider adding a small pilot with measurable outcomes.' });
  }
}
async function seedStarterChallenges() {
  if (await Challenge.estimatedDocumentCount()) return;
  await Challenge.insertMany([
    { title: 'The Circular City Challenge', category: 'Sustainability', status: 'Open', description: 'Reimagine the way our cities use, reuse and regenerate resources. Build a future that leaves nothing behind.', deadline: new Date('2026-12-18'), prize: '₹1,50,000' },
    { title: 'AI for Everyday Health', category: 'Healthcare', status: 'Open', description: 'Make preventive care more personal, accessible and human through thoughtful applications of artificial intelligence.', deadline: new Date('2026-12-04'), prize: '₹1,00,000' },
    { title: 'Fintech for All', category: 'Finance', status: 'Open', description: 'Design inclusive financial tools that give every community a fair shot at building a secure future.', deadline: new Date('2027-01-10'), prize: '₹75,000' },
    { title: 'Learning Without Limits', category: 'Education', status: 'Coming soon', description: 'Open up new paths to learning with tools that meet every student where they are.', deadline: new Date('2027-01-30'), prize: '₹50,000' }
  ]);
}
async function bootstrapAdministrator() {
  const email = process.env.ADMIN_EMAIL?.trim().toLowerCase();
  const password = process.env.ADMIN_PASSWORD;
  if (!email && !password) return;
  if (!email || !/^\S+@\S+\.\S+$/.test(email) || !password || password.length < 12) throw new Error('ADMIN_EMAIL and an ADMIN_PASSWORD of at least 12 characters are required together.');
  if (await User.exists({ role: 'Administrator' })) return;
  await User.create({ name: process.env.ADMIN_NAME?.trim() || 'InnovateX Administrator', email, role: 'Administrator', passwordHash: await bcrypt.hash(password, 12) });
  console.log('Initial InnovateX administrator account created.');
}
if (databaseConnected) {
  await seedDemo();
  if (process.env.SEED_DEMO !== 'true') await seedStarterChallenges();
  await bootstrapAdministrator();
}

app.use('/api', (_req, res) => fail(res, 404, 'API route not found'));
app.use(express.static(here));
app.use((err, _req, res, _next) => { console.error(err); if (err instanceof multer.MulterError) return fail(res, 400, err.code === 'LIMIT_FILE_SIZE' ? 'File exceeds the upload size limit' : 'Invalid file upload'); if (err.status === 400) return fail(res, 400, err.message); if (err.name === 'ValidationError') return fail(res, 400, err.message); if (err.name === 'CastError') return fail(res, 400, 'Invalid record identifier'); res.status(500).json({ error: 'Server error' }); });
app.listen(port, () => console.log(`InnovateX listening on http://localhost:${port}`));
