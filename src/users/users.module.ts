import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Role, RoleSchema } from '../roles/schemas/roles.schema';
import { View, ViewSchema } from '../views/schemas/views.schema';
import { PasswordController } from './controllers/password.controller';
import { ProfileController } from './controllers/profile.controller';
import { TreeController } from './controllers/tree.controller';
import { UsersController } from './controllers/users.controller';
import {
  PasswordResetToken,
  PasswordResetTokenSchema,
} from './schemas/password-reset-token.schema';
import { User, UserSchema } from './schemas/user.schema';
import { PasswordResetService } from './services/password-reset.service';
import { ProfileService } from './services/profile.service';
import { TreeService } from './services/tree.service';
import { UsersService } from './services/users.service';
import { ClientsModule, Transport } from '@nestjs/microservices';
import { NATS_SERVICE } from 'src/config/services';
import { envs } from 'src/config/envs';

@Module({
  imports: [
    MongooseModule.forFeature([
      {
        name: User.name,
        schema: UserSchema,
      },
      {
        name: Role.name,
        schema: RoleSchema,
      },
      {
        name: View.name,
        schema: ViewSchema,
      },
      {
        name: PasswordResetToken.name,
        schema: PasswordResetTokenSchema,
      },
    ]),
    ClientsModule.register([
      {
        name: NATS_SERVICE,
        transport: Transport.NATS,
        options: {
          servers: envs.NATS_SERVERS,
        },
      },
    ]),
  ],
  controllers: [
    UsersController,
    PasswordController,
    ProfileController,
    TreeController,
  ],
  providers: [UsersService, PasswordResetService, ProfileService, TreeService],
  exports: [
    MongooseModule,
    UsersService,
    PasswordResetService,
    ProfileService,
    TreeService,
  ],
})
export class UsersModule {}
