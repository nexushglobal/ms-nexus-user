import { Controller } from '@nestjs/common';
import { MessagePattern, Payload } from '@nestjs/microservices';
import { PasswordResetService } from '../services/password-reset.service';

@Controller()
export class PasswordController {
  constructor(private readonly passwordResetService: PasswordResetService) {}

  @MessagePattern({ cmd: 'user.password.requestPasswordReset' })
  requestPasswordReset(@Payload() data: { email: string }) {
    return this.passwordResetService.requestPasswordReset(data.email);
  }

  @MessagePattern({ cmd: 'user.password.verifyResetToken' })
  verifyResetToken(@Payload() data: { token: string }) {
    return this.passwordResetService.verifyResetToken(data.token);
  }

  @MessagePattern({ cmd: 'user.password.resetPassword' })
  resetPassword(@Payload() data: { token: string; newPassword: string }) {
    return this.passwordResetService.resetPassword(
      data.token,
      data.newPassword,
    );
  }
}
