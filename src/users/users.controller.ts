import { Controller } from '@nestjs/common';
import { MessagePattern, Payload } from '@nestjs/microservices';
import { RegisterDto } from './dto/create-user.dto';
import { UsersService } from './users.service';
interface RegisterResponse {
  user: {
    id: string;
    email: string;
    referralCode: string;
    firstName: string;
    lastName: string;
  };
}
@Controller()
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @MessagePattern({ cmd: 'user.register' })
  async register(
    @Payload() registerDto: RegisterDto,
  ): Promise<RegisterResponse> {
    return await this.usersService.register(registerDto);
  }

  @MessagePattern({ cmd: 'user.findByEmail' })
  async findByEmail(@Payload() data: { email: string }) {
    const user = await this.usersService.findByEmail(data.email);
    if (!user) {
      return {
        success: false,
        message: 'Usuario no encontrado',
      };
    }
    return {
      success: true,
      user: user.toJSON(),
    };
  }
}
