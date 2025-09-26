import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';

@Injectable()
export class IngestTokenGuard implements CanActivate {
  private readonly token: string;

  constructor() {
    if (!process.env.INGEST_TOKEN) {
      throw new Error('INGEST_TOKEN environment variable is not set');
    }
    this.token = process.env.INGEST_TOKEN;
  }

  canActivate(context: ExecutionContext): boolean {
    const request = context
      .switchToHttp()
      .getRequest<{ headers: Record<string, string> }>();

    const authHeader = request.headers['authorization'];
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      throw new UnauthorizedException(
        'Missing or invalid Authorization header',
      );
    }

    const token = authHeader.split(' ')[1];
    if (token !== this.token) {
      throw new UnauthorizedException('Invalid token');
    }

    return true;
  }
}
