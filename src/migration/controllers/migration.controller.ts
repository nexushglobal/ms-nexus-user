import { Controller, Logger } from '@nestjs/common';
import { MessagePattern, Payload } from '@nestjs/microservices';
import {
  RoleMigrationData,
  RoleViewRelation,
  ViewMigrationData,
} from '../interfaces/roles-view.interfaces';
import { MigrationService } from '../services/migration.service';

interface MigrationPayload {
  roles: RoleMigrationData[];
  views: ViewMigrationData[];
  relations: RoleViewRelation[];
}

@Controller()
export class MigrationController {
  private readonly logger = new Logger(MigrationController.name);

  constructor(private readonly migrationService: MigrationService) {}

  @MessagePattern({ cmd: 'user.migrate.rolesAndViews' })
  async migrate(@Payload() payload: MigrationPayload) {
    try {
      this.logger.log('📨 Solicitud de migración recibida');

      // Validar que se recibieron los datos necesarios
      if (!payload.roles || !payload.views || !payload.relations) {
        return {
          success: false,
          message:
            'Faltan datos requeridos: roles, views, y relations son obligatorios',
          timestamp: new Date().toISOString(),
        };
      }

      // Validar estructura de datos
      const validation = this.migrationService.validateJsonData(
        payload.roles,
        payload.views,
        payload.relations,
      );

      if (!validation.valid) {
        return {
          success: false,
          message: 'Datos JSON inválidos',
          errors: validation.errors,
          timestamp: new Date().toISOString(),
        };
      }

      // Ejecutar migración
      const result = await this.migrationService.migrateFromJsonFiles(
        payload.roles,
        payload.views,
        payload.relations,
      );

      return {
        ...result,
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      this.logger.error('Error durante la migración:', error);
      return {
        success: false,
        message: 'Error interno durante la migración',
        error: error.message,
        timestamp: new Date().toISOString(),
      };
    }
  }
}
