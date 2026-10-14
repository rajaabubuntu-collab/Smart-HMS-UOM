import { setTimeout as delay } from 'node:timers/promises';
import { Router } from 'express';
import { randomBytes, createHash, createCipheriv, createDecipheriv } from 'node:crypto';
import { isIP } from 'node:net';
import { mkdir, writeFile, readdir, readFile, unlink, chmod } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { User, PasswordReset, Session, AuditLog, HospitalSettings, audit } from '../models.js';
import { parse, email, password } from '../validation.js';
import { httpError } from '../auth.js';
import { deliveryConfig } from '../notifications/delivery-config.js';
import { createTransports } from '../notifications/transports.js';
import { securityEmail } from '../notifications/email-content.js';
import { startReminderWorker } from '../notifications/reminders.js';

const duration = 15 * 60000;
export const recoveryPreviewDirectory = fileURLToPath(
  new URL('../../../.local/reset-mail/', import.meta.url),
);
const digest = (token) => createHash('sha256').update(token).digest('hex');
function seal(token, secret) {
  const nonce = randomBytes(12);
  const cipher = createCipheriv(
    'aes-256-gcm',
    createHash('sha256').update(`hms:recovery:v1:${secret}`).digest(),
    nonce,
  );
  const encrypted = Buffer.concat([cipher.update(token, 'utf8'), cipher.final()]);
  return Buffer.concat([nonce, cipher.getAuthTag(), encrypted]).toString('base64');
}
function unseal(value, secret) {
  const bytes = Buffer.from(value, 'base64');
  const cipher = createDecipheriv(
    'aes-256-gcm',
    createHash('sha256').update(`hms:recovery:v1:${secret}`).digest(),
    bytes.subarray(0, 12),
  );
  cipher.setAuthTag(bytes.subarray(12, 28));
  return Buffer.concat([cipher.update(bytes.subarray(28)), cipher.final()]).toString('utf8');
}
export function loginMetadata(req) {
  const address = req.ip?.replace(/^::ffff:/, '');
  return { ipAddress: isIP(address || '') ? address : undefined };
}
export async function expireAuditAddresses(now = new Date()) {
  return AuditLog.updateMany(
    { createdAt: { $lt: new Date(now - 30 * 86400000) }, ipAddress: { $exists: true } },
    { $unset: { ipAddress: 1 } },
  );
}
export function recoveryRouter(config) {
  const router = Router();
  router.post('/auth/forgot-password', async (req, res) => {
    const data = parse(z.object({ email }).strict(), req.body);
    const started = Date.now();
    const token = randomBytes(32).toString('hex');
    const now = new Date();
    // Provider I/O happens in the worker, outside the request, for every account type.
    await mongoose.connection.transaction(async (session) => {
      const user = await User.findOneAndUpdate(
        {
          email: data.email,
          isActive: true,
          $or: [
            { recoveryRequestedAt: { $exists: false } },
            { recoveryRequestedAt: { $lte: new Date(now - 60000) } },
          ],
        },
        { $set: { recoveryRequestedAt: now }, $inc: { securityRevision: 1 } },
        { session, returnDocument: 'after' },
      );
      if (!user) return;
      await PasswordReset.deleteMany({ user: user._id, kind: 'reset' }, { session });
      await PasswordReset.create(
        [
          {
            user: user._id,
            destination: user.email,
            tokenHash: digest(token),
            sealedToken: seal(token, config.jwtSecret),
            expiresAt: new Date(+now + duration),
          },
        ],
        { session },
      );
      await audit(user._id, 'password_reset_requested', 'authentication', user._id, session);
    });
    // Keep fast unknown/cooldown lookups from returning immediately. Database
    // load can exceed this floor, so this is not a constant-time guarantee.
    await delay(Math.max(0, 300 - (Date.now() - started)));
    res.status(202).json({
      message:
        'If an active account matches, a password reset email will be sent when email delivery is available. The link expires in 15 minutes.',
    });
  });
  router.post('/auth/reset-password', async (req, res) => {
    const data = parse(
      z.object({ token: z.string().regex(/^[a-f0-9]{64}$/), password }).strict(),
      req.body,
    );
    const passwordHash = await bcrypt.hash(data.password, 12);
    await mongoose.connection.transaction(async (session) => {
      const reset = await PasswordReset.findOneAndDelete(
        { tokenHash: digest(data.token), kind: 'reset', expiresAt: { $gt: new Date() } },
        { session },
      );
      if (!reset)
        throw httpError(400, 'This reset link is invalid or expired. Request a new link.');
      const user = await User.findOneAndUpdate(
        { _id: reset.user, isActive: true },
        { $set: { passwordHash }, $inc: { securityRevision: 1 } },
        { session, returnDocument: 'after' },
      );
      if (!user) throw httpError(400, 'This reset link is invalid or expired. Request a new link.');
      await Session.deleteMany({ user: user._id }, { session });
      await PasswordReset.deleteMany({ user: user._id, kind: 'reset' }, { session });
      await PasswordReset.create(
        [
          {
            user: user._id,
            destination: user.email,
            kind: 'changed',
            expiresAt: new Date(Date.now() + duration),
          },
        ],
        { session },
      );
      await audit(user._id, 'password_reset_completed', 'authentication', user._id, session);
    });
    res.json({ message: 'Password changed. Sign in again on each device.' });
  });
  return router;
}
export async function runRecoveryBatch(
  config,
  { previewDirectory = recoveryPreviewDirectory, transports, now = new Date() } = {},
) {
  const delivery = config.delivery ?? deliveryConfig({});
  const transport = transports ?? createTransports({ ...config, delivery });
  await expireAuditAddresses(now);
  if (delivery.email === 'local' && config.env !== 'production') {
    await mkdir(previewDirectory, { recursive: true, mode: 0o700 });
    await chmod(previewDirectory, 0o700);
    for (const name of await readdir(previewDirectory)) {
      if (!/^[a-f0-9]{24}\.json$/.test(name)) continue;
      const path = join(previewDirectory, name);
      try {
        if (new Date(JSON.parse(await readFile(path, 'utf8')).expiresAt) <= now) await unlink(path);
      } catch (error) {
        if (error.code !== 'ENOENT') throw error;
      }
    }
  }
  await PasswordReset.updateMany(
    { status: 'processing', updatedAt: { $lt: new Date(now - 120000) } },
    { $set: { status: 'unknown' }, $unset: { sealedToken: 1 } },
  );
  for (let i = 0; i < 20; i++) {
    const job = await PasswordReset.findOneAndUpdate(
      { status: 'queued', expiresAt: { $gt: now } },
      { $set: { status: 'processing' } },
      { returnDocument: 'after', sort: { createdAt: 1 } },
    ).select('+sealedToken +destination');
    if (!job) break;
    let status = 'failed';
    try {
      const user = await User.findById(job.user);
      if (!user?.isActive || user.email !== job.destination)
        throw new Error('Recipient unavailable');
      const brand = await HospitalSettings.findById('000000000000000000000001')
        .select('published')
        .lean();
      const content = securityEmail(
        job.kind,
        config.origin,
        job.kind === 'reset' ? unseal(job.sealedToken, config.jwtSecret) : undefined,
        brand?.published,
      );
      if (delivery.email === 'local' && config.env !== 'production') {
        await writeFile(
          join(previewDirectory, `${job._id}.json`),
          JSON.stringify({ to: job.destination, ...content, expiresAt: job.expiresAt }, null, 2),
          { mode: 0o600, flag: 'wx' },
        );
        status = 'simulated';
      } else if (
        delivery.email === 'smtp' &&
        delivery.allowed.includes(job.destination.toLowerCase())
      ) {
        const result = await transport.send(
          { _id: job._id, transport: 'smtp', channel: 'email', destination: job.destination },
          content,
        );
        status = result.status;
      }
    } catch {
      status = 'unknown';
    }
    await PasswordReset.updateOne(
      { _id: job._id, status: 'processing' },
      { $set: { status }, $unset: { sealedToken: 1 } },
    );
  }
}
export function startRecoveryWorker(config, options) {
  return startReminderWorker({
    intervalMs: 5000,
    run: () => runRecoveryBatch(config, options),
    onError: () => console.error('Account recovery queue check failed.'),
  });
}
