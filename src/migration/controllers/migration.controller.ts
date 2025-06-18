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
    this.logger.log('📨 Solicitud de migración recibida');

    if (!payload.roles || !payload.views || !payload.relations) {
      throw new Error(
        'Faltan datos requeridos: roles, views, y relations son obligatorios',
      );
    }

    const validation = this.migrationService.validateJsonData(
      payload.roles,
      payload.views,
      payload.relations,
    );

    if (!validation.valid) {
      throw new Error(`Datos JSON inválidos: ${validation.errors.join(', ')}`);
    }

    const result = await this.migrationService.migrateFromJsonFiles(
      payload.roles,
      payload.views,
      payload.relations,
    );

    return result;
  }
}
