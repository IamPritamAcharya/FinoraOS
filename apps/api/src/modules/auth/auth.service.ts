import { ForbiddenException, Injectable, UnauthorizedException } from '@nestjs/common';
import {
  RequestPrincipalSchema,
  WorkspacePermission,
  WorkspaceRole,
  hasWorkspacePermission,
  type RequestPrincipal,
} from '@finora/platform';
import { createRemoteJWKSet, jwtVerify } from 'jose';
import { requestContext } from '../../common/request-context.js';
import { PrismaService } from '../../prisma/prisma.service.js';

/**
 * Trusted request identity boundary. V1 uses an explicitly configured demo principal;
 * JWT/session verification can replace this implementation without changing business services.
 */
@Injectable()
export class AuthService {
  private jwks?: ReturnType<typeof createRemoteJWKSet>;

  constructor(private readonly prisma: PrismaService) {}

  currentPrincipal(): RequestPrincipal {
    const principal = requestContext.get()?.principal;
    if (principal) return principal;
    return RequestPrincipalSchema.parse({
      organizationId: process.env.DEMO_ORGANIZATION_ID ?? 'demo-org',
      userId: process.env.DEMO_USER_ID ?? 'demo-user',
      role: process.env.DEMO_WORKSPACE_ROLE ?? WorkspaceRole.FINANCE_CONTROLLER,
    });
  }

  require(permission: WorkspacePermission) {
    const principal = this.currentPrincipal();
    if (!hasWorkspacePermission(principal, permission)) {
      throw new ForbiddenException(`Your workspace role does not include ${permission}.`);
    }
    return principal;
  }

  async resolvePrincipal(authorization?: string): Promise<RequestPrincipal> {
    if ((process.env.AUTH_MODE ?? 'demo') !== 'keycloak') {
      const demo = this.currentPrincipal();
      const user = await this.prisma.user.findFirst({
        where: { id: demo.userId, organizationId: demo.organizationId },
        select: { id: true, organizationId: true, role: true },
      });
      if (!user) throw new UnauthorizedException('The configured demo principal was not found.');
      return RequestPrincipalSchema.parse({
        userId: user.id,
        organizationId: user.organizationId,
        role: user.role,
      });
    }

    const token = authorization?.match(/^Bearer\s+(.+)$/i)?.[1];
    const issuer = process.env.KEYCLOAK_ISSUER;
    if (!token || !issuer) throw new UnauthorizedException('A Keycloak bearer token is required.');
    this.jwks ??= createRemoteJWKSet(new URL(`${issuer}/protocol/openid-connect/certs`));
    try {
      const { payload } = await jwtVerify(token, this.jwks, {
        issuer,
        ...(process.env.KEYCLOAK_AUDIENCE ? { audience: process.env.KEYCLOAK_AUDIENCE } : {}),
      });
      const organizationId =
        typeof payload.organization_id === 'string' ? payload.organization_id : undefined;
      if (!payload.sub || !organizationId) {
        throw new UnauthorizedException('The token is missing its organization identity.');
      }
      const user = await this.prisma.user.findFirst({
        where: { identityProviderId: payload.sub, organizationId },
        select: { id: true, organizationId: true, role: true },
      });
      if (!user) throw new UnauthorizedException('No FinoraOS membership matches this identity.');
      return RequestPrincipalSchema.parse({
        userId: user.id,
        organizationId: user.organizationId,
        role: user.role,
      });
    } catch (error) {
      if (error instanceof UnauthorizedException) throw error;
      throw new UnauthorizedException('The Keycloak access token is invalid or expired.');
    }
  }
}
