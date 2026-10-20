import { randomUUID } from 'node:crypto';
import { mkdir, readFile, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import express, { Router } from 'express';
import { rateLimit } from 'express-rate-limit';
import mongoose from 'mongoose';
import sharp from 'sharp';
import { audit, publicUser, User } from './models.js';
import { httpError } from './auth.js';

const maxUploadBytes = 5 * 1024 * 1024;
const maxStoredBytes = 300 * 1024;
const supportedTypes = ['image/jpeg', 'image/png', 'image/webp'];

async function removeStoredAvatar(directory, avatarId) {
  if (!avatarId) return;
  try {
    await unlink(path.join(directory, `${avatarId}.webp`));
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
}

async function removeAfterFailure(directory, avatarId) {
  try {
    await removeStoredAvatar(directory, avatarId);
  } catch (error) {
    console.error('Avatar cleanup failed:', error.code || error.name);
  }
}

export function profileAvatarRouter(config, { rateLimitEnabled = true } = {}) {
  const router = Router();
  const directory = path.resolve(config.avatarStorageDir || '.local/avatars');
  const uploadLimiter = rateLimit({
    windowMs: 60 * 60 * 1000,
    limit: 10,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    message: { message: 'Too many profile photo uploads. Please try again later.' },
  });

  router.put(
    '/profile/avatar',
    ...(rateLimitEnabled ? [uploadLimiter] : []),
    (req, res, next) => {
      if (!supportedTypes.includes(req.get('content-type')?.split(';')[0])) {
        return next(httpError(415, 'Choose a JPEG, PNG, or WebP image.'));
      }
      express.raw({ type: supportedTypes, limit: maxUploadBytes })(req, res, next);
    },
    async (req, res) => {
      if (!Buffer.isBuffer(req.body) || req.body.length === 0)
        throw httpError(400, 'Choose an image to upload.');

      let image;
      try {
        const metadata = await sharp(req.body, {
          failOn: 'warning',
          limitInputPixels: 40_000_000,
        }).metadata();
        if (!metadata.width || !metadata.height || metadata.width * metadata.height > 40_000_000)
          throw new Error('Unsupported image dimensions.');
        for (const [size, quality] of [
          [512, 82],
          [384, 76],
          [256, 68],
        ]) {
          image = await sharp(req.body, {
            failOn: 'warning',
            limitInputPixels: 40_000_000,
          })
            .rotate()
            .resize(size, size, {
              fit: 'cover',
              position: 'attention',
              withoutEnlargement: true,
            })
            .webp({ quality, effort: 4 })
            .toBuffer();
          if (image.length <= maxStoredBytes) break;
        }
        if (image.length > maxStoredBytes) throw new Error('Compressed image is too large.');
      } catch (error) {
        if (
          error instanceof Error &&
          /unsupported|corrupt|invalid|premature|input buffer|pixel limit|vips/i.test(error.message)
        ) {
          throw httpError(400, 'The selected file is not a supported image.');
        }
        throw error;
      }

      const avatarId = randomUUID();
      const filePath = path.join(directory, `${avatarId}.webp`);
      await mkdir(directory, { recursive: true });
      await writeFile(filePath, image, { flag: 'wx', mode: 0o600 });
      const previousAvatarId = req.user.avatarId;
      let user;
      try {
        await mongoose.connection.transaction(async (session) => {
          user = await User.findByIdAndUpdate(
            req.user._id,
            { $set: { avatarId } },
            { returnDocument: 'after', runValidators: true, session },
          );
          if (!user) throw httpError(404, 'Account not found.');
          await audit(req.user._id, 'profile_photo_updated', 'profile', req.user._id, session);
        });
      } catch (error) {
        await removeAfterFailure(directory, avatarId);
        throw error;
      }
      await removeStoredAvatar(directory, previousAvatarId);
      res.json({ user: publicUser(user) });
    },
  );

  router.delete('/profile/avatar', async (req, res) => {
    const previousAvatarId = req.user.avatarId;
    await mongoose.connection.transaction(async (session) => {
      await User.updateOne({ _id: req.user._id }, { $set: { avatarId: '' } }, { session });
      await audit(req.user._id, 'profile_photo_removed', 'profile', req.user._id, session);
    });
    await removeStoredAvatar(directory, previousAvatarId);
    res.json({ user: publicUser(await User.findById(req.user._id)) });
  });

  router.get('/users/:id/avatar', async (req, res) => {
    if (!mongoose.isValidObjectId(req.params.id)) throw httpError(404, 'Profile photo not found.');
    const user = await User.findById(req.params.id).select('avatarId');
    if (!user?.avatarId) throw httpError(404, 'Profile photo not found.');
    let image;
    try {
      image = await readFile(path.join(directory, `${user.avatarId}.webp`));
    } catch (error) {
      if (error.code === 'ENOENT') throw httpError(404, 'Profile photo not found.');
      throw error;
    }
    res
      .set('Content-Type', 'image/webp')
      .set('Cache-Control', 'private, no-store')
      .set('X-Content-Type-Options', 'nosniff')
      .send(image);
  });

  return router;
}
