import { Module } from '@nestjs/common';
import { ClientsModule, Transport } from '@nestjs/microservices';
import { MongooseModule } from '@nestjs/mongoose';
import { envs } from 'src/config/envs';
import {
  MEMBERSHIP_SERVICE,
  NATS_SERVICE,
  PAYMENT_SERVICE,
  POINT_SERVICE,
  UNILEVEL_SERVICE,
} from 'src/config/services';
import { Role, RoleSchema } from '../roles/schemas/roles.schema';
import { View, ViewSchema } from '../views/schemas/views.schema';
import { PasswordResetController } from './controllers/password-reset.controller';
import { ProfileController } from './controllers/profile.controller';
import { TreeController } from './controllers/tree.controller';
import { UserInfoController } from './controllers/user-info.controller';
import { UsersController } from './controllers/users.controller';
import {
  PasswordResetToken,
  PasswordResetTokenSchema,
} from './schemas/password-reset-token.schema';
import { User, UserSchema } from './schemas/user.schema';
import { PasswordResetService } from './services/password-reset.service';
import { ProfileService } from './services/profile.service';
import { TreeService } from './services/tree.service';
import { UserInfoService } from './services/user-info.service';
import { UsersService } from './services/users.service';
import { MembershipService } from 'src/common/services/membership.service';
import { PointService } from 'src/common/services/point.service';
import { UnilevelService } from 'src/common/services/unilevel.service';

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
      {
        name: MEMBERSHIP_SERVICE,
        transport: Transport.NATS,
        options: {
          servers: envs.NATS_SERVERS,
        },
      },
      {
        name: POINT_SERVICE,
        transport: Transport.NATS,
        options: {
          servers: envs.NATS_SERVERS,
        },
      },
      {
        name: UNILEVEL_SERVICE,
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
    UserInfoController,
  ],
  providers: [
    UsersService,
    ProfileService,
    TreeService,
    PasswordResetService,
    UserInfoService,
    MembershipService,
    PointService,
    UnilevelService,
  ],
  exports: [
    MongooseModule,
    UsersService,
    ProfileService,
    TreeService,
    PasswordResetService,
    UserInfoService,
  ],
})
export class UsersModule {}
