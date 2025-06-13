import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Role, RoleSchema } from '../roles/schemas/roles.schema';
import { View, ViewSchema } from '../views/schemas/views.schema';
import { MigrationController } from './controllers/migration.controller';
import { MigrationService } from './services/migration.service';
import { UserMigrationService } from './services/user-migration.service';
import { UserMigrationController } from './controllers/user-migration.controller';
import { User, UserSchema } from 'src/users/schemas/user.schema';

@Module({
  imports: [
    MongooseModule.forFeature([
      {
        name: Role.name,
        schema: RoleSchema,
      },
      {
        name: View.name,
        schema: ViewSchema,
      },
      {
        name: User.name,
        schema: UserSchema,
      },
    ]),
  ],
  controllers: [MigrationController, UserMigrationController],
  providers: [MigrationService, UserMigrationService],
  exports: [MigrationService, UserMigrationService],
})
export class MigrationModule {}
