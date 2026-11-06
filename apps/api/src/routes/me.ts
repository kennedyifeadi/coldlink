import { updateProfileBodySchema, type UpdateProfileChanges } from '@coldlink/shared';
import { Router } from 'express';
import { toProfile, updateProfile } from '../auth/users.js';
import { requireAuth, signedInUser, type AuthDependencies } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';

export function meRoutes(deps: AuthDependencies): Router {
  const router = Router();
  const signedIn = requireAuth(deps);

  router.get('/me', signedIn, (req, res) => {
    res.set('Cache-Control', 'no-store').json(toProfile(signedInUser(req)));
  });

  router.patch('/me', signedIn, validate({ body: updateProfileBodySchema }), async (req, res) => {
    const user = await updateProfile(
      deps.db,
      signedInUser(req).id,
      req.body as UpdateProfileChanges,
    );
    res.set('Cache-Control', 'no-store').json(toProfile(user));
  });

  return router;
}
