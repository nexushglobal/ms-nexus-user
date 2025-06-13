import { Controller, Logger } from '@nestjs/common';
import { MessagePattern, Payload } from '@nestjs/microservices';
import { UserMigrationData } from '../interfaces/user-migration.interfaces';
import { UserMigrationService } from '../services/user-migration.service';

interface UserMigrationPayload {
  users: UserMigrationData[];
}

@Controller()
export class UserMigrationController {
  private readonly logger = new Logger(UserMigrationController.name);

  constructor(private readonly userMigrationService: UserMigrationService) {}

  @MessagePattern({ cmd: 'user.migrate.users' })
  async migrateUsers(@Payload() payload: UserMigrationPayload) {
    try {
      this.logger.log('📨 Solicitud de migración de usuarios recibida');

      if (!payload.users || !Array.isArray(payload.users)) {
        return {
          success: false,
          message:
            'Faltan datos requeridos: users es obligatorio y debe ser un array',
          timestamp: new Date().toISOString(),
        };
      }

      this.logger.log(`📊 Total de usuarios a migrar: ${payload.users.length}`);

      const validation = this.userMigrationService.validateUserData(
        payload.users,
      );

      if (!validation.valid) {
        return {
          success: false,
          message: 'Datos de usuarios inválidos',
          errors: validation.errors,
          timestamp: new Date().toISOString(),
        };
      }

      const result = await this.userMigrationService.migrateUsers(
        payload.users,
      );

      return {
        ...result,
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      this.logger.error('Error durante la migración de usuarios:', error);
      return {
        success: false,
        message: 'Error interno durante la migración de usuarios',
        error: error.message,
        timestamp: new Date().toISOString(),
      };
    }
  }
}
