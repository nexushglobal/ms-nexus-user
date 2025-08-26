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

export interface RankInfo {
  id: number;
  name: string;
  code: string;
}

export interface GetCurrentRankResponse {
  currentRank: RankInfo;
  highestRank?: RankInfo;
  nextRankNow: RankInfo;
  nextRankReq: RankInfo & {
    requerimientos: string[];
  };
  currentData: any;
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

  async getUserCurrentRank(userId: string): Promise<GetCurrentRankResponse | null> {
    return firstValueFrom(
      this.pointsClient
        .send<GetCurrentRankResponse | null>(
          { cmd: 'rank.getCurrentRank' },
          { userId },
        )
        .pipe(
          timeout(10000),
          catchError((error) => {
            this.logger.error(
              `Error obteniendo rango actual del usuario ${userId}:`,
              error,
            );
            // Retornar null si no se puede obtener el rank
            return of(null);
          }),
        ),
    );
  }

  async getUsersCurrentMonthlyVolumeBatch(userIds: string[]): Promise<{ [userId: string]: MonthlyVolumeInfo | null }> {
    return firstValueFrom(
      this.pointsClient
        .send<{ [userId: string]: MonthlyVolumeInfo | null }>(
          { cmd: 'monthlyVolume.getUsersCurrentMonthlyVolumeBatch' },
          { userIds },
        )
        .pipe(
          timeout(15000),
          catchError((error) => {
            this.logger.error(
              `Error obteniendo volúmenes mensuales en lote:`,
              error,
            );
            // Retornar objeto vacío si hay error
            return of({});
          }),
        ),
    );
  }

  async getUsersCurrentRankBatch(userIds: string[]): Promise<{ [userId: string]: GetCurrentRankResponse | null }> {
    return firstValueFrom(
      this.pointsClient
        .send<{ [userId: string]: GetCurrentRankResponse | null }>(
          { cmd: 'rank.getUsersCurrentRankBatch' },
          { userIds },
        )
        .pipe(
          timeout(15000),
          catchError((error) => {
            this.logger.error(
              `Error obteniendo rangos en lote:`,
              error,
            );
            // Retornar objeto vacío si hay error
            return of({});
          }),
        ),
    );
  }
}