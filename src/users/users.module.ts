import { Module } from '@nestjs/common';
import { ClientsModule, Transport } from '@nestjs/microservices';
import { MongooseModule } from '@nestjs/mongoose';
import { envs } from 'src/config/envs';
import { NATS_SERVICE, PAYMENT_SERVICE } from 'src/config/services';
import { Role, RoleSchema } from '../roles/schemas/roles.schema';
import { View, ViewSchema } from '../views/schemas/views.schema';
import { PasswordResetController } from './controllers/password-reset.controller';
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
      {
        name: PAYMENT_SERVICE,
        transport: Transport.NATS,
        options: {
          servers: envs.NATS_SERVERS,
        },
      },
    ]),
  ],
  controllers: [
    UsersController,
    ProfileController,
    TreeController,
    PasswordResetController,
  ],
  providers: [UsersService, ProfileService, TreeService, PasswordResetService],
  exports: [
    MongooseModule,
    UsersService,
    ProfileService,
    TreeService,
    PasswordResetService,
  ],
})
export class UsersModule {}
