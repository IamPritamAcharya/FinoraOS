import { Injectable } from '@nestjs/common';
import { RequestPrincipalSchema, type RequestPrincipal } from '@finora/platform';

/**
 * Trusted request identity boundary. V1 uses an explicitly configured demo principal;
 * JWT/session verification can replace this implementation without changing business services.
 */
@Injectable()
export class AuthService {
  currentPrincipal(): RequestPrincipal {
    return RequestPrincipalSchema.parse({
      organizationId: process.env.DEMO_ORGANIZATION_ID ?? 'demo-org',
      userId: process.env.DEMO_USER_ID ?? 'demo-user',
    });
  }
}
