import { Injectable, Inject, Logger } from '@nestjs/common';
import { ClientProxy } from '@nestjs/microservices';
import { throwError, firstValueFrom, of } from 'rxjs';
import { catchError, timeout } from 'rxjs/operators';
import { UNILEVEL_SERVICE } from 'src/config/services';

export interface UserLotCounts {
  purchased: number;
  sold: number;
}

@Injectable()
export class UnilevelService {
  private readonly logger = new Logger(UnilevelService.name);

  constructor(
    @Inject(UNILEVEL_SERVICE) private readonly unilevelClient: ClientProxy,
  ) {}

  async getUserLotCounts(userId: string): Promise<UserLotCounts> {
    return firstValueFrom(
      this.unilevelClient
        .send<UserLotCounts>(
          { cmd: 'unilevel.getUserLotCounts' },
          { userId },
        )
        .pipe(
          timeout(10000),
          catchError((error) => {
            this.logger.error(
              `Error obteniendo conteo de lotes del usuario ${userId}:`,
              error,
            );
            // Retornar 0 en caso de error
            return of({ purchased: 0, sold: 0 });
          }),
        ),
    );
  }

  async getUsersLotCountsBatch(userIds: string[]): Promise<{ [userId: string]: UserLotCounts }> {
    return firstValueFrom(
      this.unilevelClient
        .send<{ [userId: string]: UserLotCounts }>(
          { cmd: 'unilevel.getUsersLotCountsBatch' },
          { userIds },
        )
        .pipe(
          timeout(15000),
          catchError((error) => {
            this.logger.error(
              `Error obteniendo conteos de lotes en lote:`,
              error,
            );
            // Retornar objeto vacío si hay error
            return of({});
          }),
        ),
    );
  }
}