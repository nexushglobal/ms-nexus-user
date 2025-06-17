import { Module } from '@nestjs/common';

import { MongooseModule } from '@nestjs/mongoose';
import { Role, RoleSchema } from '../roles/schemas/roles.schema';
import { View, ViewSchema } from '../views/schemas/views.schema';
import { PasswordController } from './controllers/password.controller';
import { ProfileController } from './controllers/profile.controller';
import { UsersController } from './controllers/users.controller';
import {
  PasswordResetToken,
  PasswordResetTokenSchema,
} from './schemas/password-reset-token.schema';
import { User, UserSchema } from './schemas/user.schema';
import { PasswordResetService } from './services/password-reset.service';
import { ProfileService } from './services/profile.service';
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
  ],
  controllers: [UsersController, PasswordController, ProfileController],
  providers: [UsersService, PasswordResetService, ProfileService],
  exports: [MongooseModule, UsersService, PasswordResetService, ProfileService],
})
export class UsersModule {}
