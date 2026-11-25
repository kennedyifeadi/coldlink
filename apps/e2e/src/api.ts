import {
  cropCategoriesResponseSchema,
  ownProviderSchema,
  publicProviderSchema,
  sessionResponseSchema,
  type CreateProviderBody,
  type OwnProvider,
  type PublicProvider,
} from '@coldlink/shared';
import type { APIRequestContext } from '@playwright/test';

interface Schema<T> {
  parse(input: unknown): T;
}

/** The few API calls the suite makes outside the screens: setting up and tearing down its data. */
export class E2eApi {
  constructor(
    private readonly request: APIRequestContext,
    private readonly apiUrl: string,
  ) {}

  private async send<T>(
    schema: Schema<T>,
    method: 'GET' | 'POST' | 'PATCH',
    path: string,
    options: { token?: string; body?: unknown } = {},
  ): Promise<T> {
    const response = await this.request.fetch(`${this.apiUrl}${path}`, {
      method,
      headers: options.token ? { Authorization: `Bearer ${options.token}` } : {},
      data: options.body,
      failOnStatusCode: false,
    });
    if (!response.ok()) {
      throw new Error(`${method} ${path} answered ${response.status()}: ${await response.text()}`);
    }
    return schema.parse(await response.json());
  }

  async categoryId(slug: string): Promise<string> {
    const { data } = await this.send(cropCategoriesResponseSchema, 'GET', '/crop-categories');
    const category = data.find((candidate) => candidate.slug === slug);
    if (!category) throw new Error(`No crop category ${slug}`);
    return category.id;
  }

  createProvider(token: string, body: CreateProviderBody): Promise<OwnProvider> {
    return this.send(ownProviderSchema, 'POST', '/providers', { token, body });
  }

  pauseProvider(token: string, providerId: string): Promise<OwnProvider> {
    return this.send(ownProviderSchema, 'PATCH', `/providers/${providerId}`, {
      token,
      body: { is_accepting_bookings: false },
    });
  }

  publicProvider(providerId: string): Promise<PublicProvider> {
    return this.send(publicProviderSchema, 'GET', `/providers/${providerId}`);
  }

  /**
   * A new access token from the refresh cookie the browser context holds. Sent without an
   * Origin header, as a non-browser client, which the refresh route allows (decision 60).
   */
  refreshSession(context: APIRequestContext): Promise<string> {
    return new E2eApi(context, this.apiUrl)
      .send(sessionResponseSchema, 'POST', '/auth/refresh')
      .then((session) => session.access_token);
  }
}
