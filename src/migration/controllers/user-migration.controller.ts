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
    this.logger.log('📨 Solicitud de migración de usuarios recibida');

    if (!payload.users || !Array.isArray(payload.users)) {
      throw new Error(
        'Faltan datos requeridos: users es obligatorio y debe ser un array',
      );
    }

    this.logger.log(`📊 Total de usuarios a migrar: ${payload.users.length}`);

    const validation = this.userMigrationService.validateUserData(
      payload.users,
    );

    if (!validation.valid) {
      throw new Error(
        `Datos de usuarios inválidos: ${validation.errors.join(', ')}`,
      );
    }

    const result = await this.userMigrationService.migrateUsers(payload.users);

    return result;
  }
}
