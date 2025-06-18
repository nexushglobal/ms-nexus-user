import { Controller } from '@nestjs/common';
import { MessagePattern, Payload } from '@nestjs/microservices';
import { PasswordResetService } from '../services/password-reset.service';

@Controller()
export class PasswordResetController {
  constructor(private readonly passwordResetService: PasswordResetService) {}

  @MessagePattern({ cmd: 'user.passwordReset.request' })
  requestPasswordReset(@Payload() data: { email: string }) {
    return this.passwordResetService.requestPasswordReset(data.email);
  }

  @MessagePattern({ cmd: 'user.passwordReset.validateToken' })
  validateResetToken(@Payload() data: { email: string; token: string }) {
    return this.passwordResetService.validateResetToken(data.email, data.token);
  }

  @MessagePattern({ cmd: 'user.passwordReset.reset' })
  resetPassword(
    @Payload()
    data: {
      email: string;
      token: string;
      newPassword: string;
    },
  ) {
    return this.passwordResetService.resetPassword(
      data.email,
      data.token,
      data.newPassword,
    );
  }
}
