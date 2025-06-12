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
}
