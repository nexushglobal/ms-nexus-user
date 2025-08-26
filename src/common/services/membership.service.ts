import { Injectable, Inject, Logger } from '@nestjs/common';
import { ClientProxy } from '@nestjs/microservices';
import { throwError, firstValueFrom } from 'rxjs';
import { catchError, timeout } from 'rxjs/operators';
import { MEMBERSHIP_SERVICE } from 'src/config/services';

export interface MembershipInfo {
  hasActiveMembership: boolean;
  membership?: {
    plan: string;
    startDate: Date;
    endDate: Date;
    status: string;
  } | null;
}

@Injectable()
export class MembershipService {
  private readonly logger = new Logger(MembershipService.name);

  constructor(
    @Inject(MEMBERSHIP_SERVICE) private readonly membershipClient: ClientProxy,
  ) {}

  async getUserMembership(userId: string): Promise<MembershipInfo> {
    return firstValueFrom(
      this.membershipClient
        .send<MembershipInfo>(
          { cmd: 'membership.getUserMembershipByUserId' },
          { userId },
        )
        .pipe(
          timeout(10000),
          catchError((error) => {
            this.logger.error(
              `Error obteniendo membresía del usuario ${userId}:`,
              error,
            );
            return throwError(() => ({
              status: 500,
              message: `Error al obtener membresía del usuario: ${error.message}`,
              service: 'membership',
              timestamp: new Date().toISOString(),
            }));
          }),
        ),
    );
  }
}