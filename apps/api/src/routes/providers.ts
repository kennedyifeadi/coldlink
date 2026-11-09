import { randomUUID } from 'node:crypto';
import {
  createProviderBodySchema,
  MAX_PROVIDER_PHOTO_BYTES,
  MAX_PROVIDER_PHOTOS,
  providerPhotoIdSchema,
  providerPhotoTypes,
  updateProviderBodySchema,
  type CreateProviderInput,
  type UpdateProviderInput,
  type ValidationIssue,
} from '@coldlink/shared';
import express, { Router, type Request, type RequestHandler } from 'express';
import type { Logger } from 'pino';
import * as z from 'zod';
import type { AppConfigReader } from '../appConfig.js';
import type { User } from '../auth/users.js';
import type { Database } from '../db/client.js';
import { inTransaction } from '../db/transaction.js';
import { AppError } from '../errors.js';
import {
  requireAuth,
  requireRole,
  signedInUser,
  type AuthDependencies,
} from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { detectPhotoType } from '../providers/photoType.js';
import {
  appendPhoto,
  findProvider,
  grantProviderRole,
  insertProvider,
  listOwnedProviders,
  removePhoto,
  requireProvider,
  unknownCategoryIds,
  updateProvider,
  type ProviderRecord,
} from '../providers/store.js';
import { photoPath, toOwnProvider, toPublicProvider } from '../providers/views.js';
import type { PhotoStorage } from '../storage/photoStorage.js';

export interface ProviderRouteDependencies extends AuthDependencies {
  appConfig: AppConfigReader;
  storage: PhotoStorage;
}

const providerParamsSchema = z.object({ id: z.uuid() });
const photoParamsSchema = z.object({ id: z.uuid(), photoId: providerPhotoIdSchema });

type ProviderParams = z.infer<typeof providerParamsSchema>;
type PhotoParams = z.infer<typeof photoParamsSchema>;

const photoBody = express.raw({
  type: Object.keys(providerPhotoTypes),
  limit: MAX_PROVIDER_PHOTO_BYTES,
});

function providerNotFound(): AppError {
  return new AppError('not_found', 'Facility not found');
}

function tooManyPhotos(): AppError {
  return new AppError(
    'conflict',
    `A facility can have at most ${MAX_PROVIDER_PHOTOS} photos. Remove one to add another.`,
  );
}

function invalidBody(path: string, message: string): AppError {
  const issue: ValidationIssue = { location: 'body', path, message };
  return new AppError('validation_failed', 'Some fields are missing or invalid', [issue]);
}

async function requireCategories(db: Database, ids: string[]): Promise<void> {
  const unknown = await unknownCategoryIds(db, ids);
  if (unknown.length > 0) {
    throw invalidBody('category_ids', `Unknown crop category: ${unknown.join(', ')}`);
  }
}

function canManage(user: User, provider: ProviderRecord): boolean {
  return provider.owner_user_id === user.id || user.roles.includes('admin');
}

/** The provider in the URL, if the signed-in user owns it or is an admin. */
async function managedProvider(db: Database, req: Request): Promise<ProviderRecord> {
  const { id } = req.params as ProviderParams;
  const provider = await findProvider(db, id);
  if (provider === undefined) throw providerNotFound();
  if (!canManage(signedInUser(req), provider)) {
    throw new AppError('forbidden', "Only the facility's owner or an admin can change it.");
  }
  return provider;
}

// A change to one temperature is checked against the other's stored value, so the database's
// order check never turns it into a 500.
function checkTemperatures(provider: ProviderRecord, changes: UpdateProviderInput): void {
  const min = changes.temp_min_c === undefined ? provider.temp_min_c : changes.temp_min_c;
  const max = changes.temp_max_c === undefined ? provider.temp_max_c : changes.temp_max_c;
  if (min !== null && max !== null && min > max) {
    throw invalidBody('temp_max_c', 'The highest temperature must not be below the lowest');
  }
}

async function discardUpload(storage: PhotoStorage, path: string, log: Logger): Promise<void> {
  try {
    await storage.remove(path);
  } catch (err) {
    log.error({ err, path }, 'Removing an unused provider photo from storage failed');
  }
}

function photoFromBody(req: Request) {
  const body: unknown = req.body;
  if (!Buffer.isBuffer(body) || body.length === 0) {
    throw new AppError('bad_request', 'Send one JPEG, PNG or WebP photo as the request body.');
  }
  const type = detectPhotoType(body);
  if (type === undefined || req.is(type) === false) {
    throw new AppError('bad_request', 'The file is not a JPEG, PNG or WebP photo.');
  }
  return { body, type };
}

export function providerRoutes(deps: ProviderRouteDependencies): Router {
  const { db, appConfig, storage } = deps;
  const router = Router();
  const signedIn = requireAuth(deps);
  const canEdit = requireRole('provider', 'admin');
  const ensureManaged: RequestHandler = async (req, _res, next) => {
    await managedProvider(db, req);
    next();
  };

  router.post(
    '/providers',
    signedIn,
    validate({ body: createProviderBodySchema }),
    async (req, res) => {
      const owner = signedInUser(req);
      const input = req.body as CreateProviderInput;
      await requireCategories(db, input.category_ids);
      const { require_provider_approval } = await appConfig.get();
      const provider = await inTransaction(db, async (trx) => {
        const id = await insertProvider(trx, {
          ownerUserId: owner.id,
          phone: input.phone ?? owner.phone,
          verificationStatus: require_provider_approval ? 'pending' : 'approved',
          input,
        });
        await grantProviderRole(trx, owner.id);
        return requireProvider(trx, id);
      });
      res.status(201).set('Cache-Control', 'no-store').json(toOwnProvider(provider, storage));
    },
  );

  // Before /providers/:id, which would otherwise take "mine" as an id.
  router.get('/providers/mine', signedIn, requireRole('provider'), async (req, res) => {
    const providers = await listOwnedProviders(db, signedInUser(req).id);
    res
      .set('Cache-Control', 'no-store')
      .json({ data: providers.map((provider) => toOwnProvider(provider, storage)) });
  });

  router.get('/providers/:id', validate({ params: providerParamsSchema }), async (req, res) => {
    const { id } = req.params as ProviderParams;
    const provider = await findProvider(db, id);
    // Pending, suspended and rejected facilities are not open to farmers; owners see them on /mine.
    if (provider?.verification_status !== 'approved') throw providerNotFound();
    res.json(toPublicProvider(provider, storage));
  });

  router.patch(
    '/providers/:id',
    signedIn,
    canEdit,
    validate({ params: providerParamsSchema, body: updateProviderBodySchema }),
    async (req, res) => {
      const provider = await managedProvider(db, req);
      const changes = req.body as UpdateProviderInput;
      checkTemperatures(provider, changes);
      if (changes.category_ids !== undefined) await requireCategories(db, changes.category_ids);
      const updated = await inTransaction(db, async (trx) => {
        await updateProvider(trx, provider.id, changes);
        return requireProvider(trx, provider.id);
      });
      res.set('Cache-Control', 'no-store').json(toOwnProvider(updated, storage));
    },
  );

  // Ownership is checked before the body is read, so a stranger cannot make the API take in 5 MB.
  router.post(
    '/providers/:id/photos',
    signedIn,
    canEdit,
    validate({ params: providerParamsSchema }),
    ensureManaged,
    photoBody,
    async (req, res) => {
      const provider = await managedProvider(db, req);
      if (provider.photos.length >= MAX_PROVIDER_PHOTOS) throw tooManyPhotos();
      const { body, type } = photoFromBody(req);
      const path = photoPath(provider.id, `${randomUUID()}.${providerPhotoTypes[type]}`);
      await storage.upload({ path, body, contentType: type });
      let added: boolean;
      try {
        added = await appendPhoto(db, provider.id, path);
      } catch (error) {
        await discardUpload(storage, path, req.log);
        throw error;
      }
      if (!added) {
        await discardUpload(storage, path, req.log);
        throw tooManyPhotos();
      }
      const updated = await requireProvider(db, provider.id);
      res.status(201).set('Cache-Control', 'no-store').json(toOwnProvider(updated, storage));
    },
  );

  router.delete(
    '/providers/:id/photos/:photoId',
    signedIn,
    canEdit,
    validate({ params: photoParamsSchema }),
    async (req, res) => {
      const provider = await managedProvider(db, req);
      const path = photoPath(provider.id, (req.params as PhotoParams).photoId);
      if (!(await removePhoto(db, provider.id, path))) {
        throw new AppError('not_found', 'Photo not found');
      }
      // The provider no longer lists the photo, so a leftover file is only unused storage.
      try {
        await storage.remove(path);
      } catch (err) {
        req.log.error({ err, path }, 'Removing a provider photo from storage failed');
      }
      const updated = await requireProvider(db, provider.id);
      res.set('Cache-Control', 'no-store').json(toOwnProvider(updated, storage));
    },
  );

  return router;
}
