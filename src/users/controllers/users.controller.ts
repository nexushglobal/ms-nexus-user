import { Controller } from '@nestjs/common';
import { MessagePattern, Payload } from '@nestjs/microservices';
import { RegisterDto } from '../dto/create-user.dto';
import { UsersService } from '../services/users.service';

@Controller()
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @MessagePattern({ cmd: 'user.register' })
  register(@Payload() registerDto: RegisterDto) {
    return this.usersService.register(registerDto);
  }

  @MessagePattern({ cmd: 'user.findByEmail' })
  findByEmail(@Payload() data: { email: string }) {
    return this.usersService.findByEmail(data.email);
  }

  @MessagePattern({ cmd: 'user.findByEmailWithPassword' })
  findByEmailWithPassword(@Payload() data: { email: string }) {
    return this.usersService.findByEmailWithPassword(data.email);
  }

  @MessagePattern({ cmd: 'user.findById' })
  findById(@Payload() data: { id: string }) {
    return this.usersService.findById(data.id);
  }

  @MessagePattern({ cmd: 'user.findUserWithRoleById' })
  findUserWithRoleById(@Payload() data: { id: string }) {
    return this.usersService.findUserWithRoleById(data.id);
  }

  @MessagePattern({ cmd: 'user.findPrincipalUser' })
  findPrincipalUser() {
    return this.usersService.findPrincipalUser();
  }

  @MessagePattern({ cmd: 'user.updateLastLoginAt' })
  updateLastLoginAt(@Payload() data: { userId: string }) {
    return this.usersService.updateLastLoginAt(data.userId);
  }

  @MessagePattern({ cmd: 'user.validateUserExists' })
  validateUserExists(@Payload() data: { userId: string }) {
    return this.usersService.validateUserExists(data.userId);
  }

  @MessagePattern({ cmd: 'user.getUserBasicInfo' })
  getUserBasicInfo(@Payload() data: { userId: string }) {
    return this.usersService.getUserBasicInfo(data.userId);
  }

  @MessagePattern({ cmd: 'user.updatePassword' })
  updatePassword(@Payload() data: { userId: string; password: string }) {
    return this.usersService.updatePassword(data.userId, data.password);
  }

  @MessagePattern({ cmd: 'user.changePassword' })
  changePassword(
    @Payload()
    data: {
      userId: string;
      currentPassword: string;
      newPassword: string;
    },
  ) {
    return this.usersService.changePassword(
      data.userId,
      data.currentPassword,
      data.newPassword,
    );
  }
}
