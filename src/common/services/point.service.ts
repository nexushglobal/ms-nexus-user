import { Injectable, Inject, Logger } from '@nestjs/common';
import { ClientProxy } from '@nestjs/microservices';
import { throwError, firstValueFrom, of } from 'rxjs';
import { catchError, timeout } from 'rxjs/operators';
import { POINT_SERVICE } from 'src/config/services';

export interface MonthlyVolumeInfo {
  id: number;
  leftVolume: number;
  rightVolume: number;
  totalVolume: number;
  leftDirects: number;
  rightDirects: number;
  monthStartDate: Date;
  monthEndDate: Date;
  status: string;
}

@Injectable()
export class PointService {
  private readonly logger = new Logger(PointService.name);

  constructor(
    @Inject(POINT_SERVICE) private readonly pointsClient: ClientProxy,
  ) {}

  async getUserCurrentMonthlyVolume(userId: string): Promise<MonthlyVolumeInfo | null> {
    return firstValueFrom(
      this.pointsClient
        .send<MonthlyVolumeInfo | null>(
          { cmd: 'monthlyVolume.getCurrentMonthlyVolume' },
          { userId },
        )
        .pipe(
          timeout(10000),
          catchError((error) => {
            this.logger.error(
              `Error obteniendo volumen mensual del usuario ${userId}:`,
              error,
            );
            // Retornar null si no hay volumen en lugar de error
            return of(null);
          }),
        ),
    );
  }
}