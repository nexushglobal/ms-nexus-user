import { Controller } from '@nestjs/common';
import { MessagePattern } from '@nestjs/microservices';

@Controller()
export class UsersController {
  @MessagePattern({ cmd: 'user.hello' })
  getUserHello(data: { name?: string }) {
    const name = data?.name || 'World';
    return {
      message: `Hello ${name} from User Microservice reloaded`,
      service: 'user-service',
      timestamp: new Date().toISOString(),
    };
  }

  @MessagePattern({ cmd: 'user.health' })
  getHealth() {
    return {
      status: 'OK',
      service: 'user-service',
      timestamp: new Date().toISOString(),
    };
  }
}
