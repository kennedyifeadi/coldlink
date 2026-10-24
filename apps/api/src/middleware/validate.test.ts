import { errorResponseSchema, validationIssueSchema } from '@coldlink/shared';
import { Router } from 'express';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import * as z from 'zod';
import { testApp } from '../test/helpers.js';
import { validate } from './validate.js';

function routes(): Router {
  const router = Router();
  router.post(
    '/items/:itemId',
    validate({
      params: z.object({ itemId: z.uuid() }),
      query: z.object({ limit: z.coerce.number().int().min(1).max(50).default(20) }),
      body: z.object({ name: z.string().min(1), quantity: z.number().positive() }),
    }),
    (req, res) => {
      res.json({ params: req.params, query: req.query, body: req.body as unknown });
    },
  );
  return router;
}

const itemId = '7f1d3c2e-8a4b-4c6d-9e0f-1a2b3c4d5e6f';

describe('validate', () => {
  it('passes parsed params, query and body to the handler', async () => {
    const { app } = testApp(routes());
    const response = await request(app)
      .post(`/api/v1/items/${itemId}`)
      .send({ name: 'Tomatoes', quantity: 2, extra: 'dropped' });
    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      params: { itemId },
      query: { limit: 20 },
      body: { name: 'Tomatoes', quantity: 2 },
    });
  });

  it('returns 400 validation_failed with an issue for every invalid field', async () => {
    const { app } = testApp(routes());
    const response = await request(app)
      .post('/api/v1/items/not-a-uuid?limit=500')
      .send({ name: '', quantity: -1 });
    expect(response.status).toBe(400);
    const { error } = errorResponseSchema.parse(response.body);
    expect(error.code).toBe('validation_failed');
    const issues = z.array(validationIssueSchema).parse(error.details);
    expect(issues.map(({ location, path }) => `${location}.${path}`)).toEqual([
      'params.itemId',
      'query.limit',
      'body.name',
      'body.quantity',
    ]);
    expect(issues.every((issue) => issue.message.length > 0)).toBe(true);
  });

  it('reports a missing body', async () => {
    const { app } = testApp(routes());
    const response = await request(app).post(`/api/v1/items/${itemId}`);
    expect(response.status).toBe(400);
    const { error } = errorResponseSchema.parse(response.body);
    expect(z.array(validationIssueSchema).parse(error.details)).toEqual([
      expect.objectContaining({ location: 'body', path: '' }),
    ]);
  });
});
