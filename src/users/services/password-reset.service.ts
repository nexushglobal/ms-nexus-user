import { Inject, Injectable, Logger } from '@nestjs/common';
import { ClientProxy, RpcException } from '@nestjs/microservices';
import { InjectModel } from '@nestjs/mongoose';
import * as bcrypt from 'bcryptjs';
import { Model } from 'mongoose';
import { firstValueFrom } from 'rxjs';
import { NATS_SERVICE } from 'src/config/services';
import {
  PasswordResetToken,
  PasswordResetTokenDocument,
} from '../schemas/password-reset-token.schema';
import { User, UserDocument } from '../schemas/user.schema';

@Injectable()
export class PasswordResetService {
  private readonly logger = new Logger(PasswordResetService.name);

  constructor(
    @InjectModel(User.name) private userModel: Model<UserDocument>,
    @InjectModel(PasswordResetToken.name)
    private passwordResetTokenModel: Model<PasswordResetTokenDocument>,
    @Inject(NATS_SERVICE) private readonly client: ClientProxy,
  ) {}

  async requestPasswordReset(
    email: string,
  ): Promise<{ success: boolean; message: string }> {
    try {
      this.logger.log(
        `📧 Solicitud de restablecimiento de contraseña para: ${email}`,
      );

      // Verificar si el usuario existe
      const user = await this.userModel
        .findOne({ email: email.toLowerCase() })
        .exec();

      if (!user) {
        // Por seguridad, no revelamos si el email existe o no
        return {
          success: true,
          message:
            'Si el correo está registrado, recibirás un código de verificación.',
        };
      }

      if (!user.isActive) {
        throw new RpcException({
          status: 403,
          message: 'La cuenta está inactiva',
        });
      }

      // Invalidar tokens anteriores del usuario
      await this.passwordResetTokenModel
        .updateMany({ user: user._id, isUsed: false }, { isUsed: true })
        .exec();

      // Generar token de 5 dígitos
      const token = this.generateResetToken();

      // Calcular fecha de expiración (15 minutos)
      const expiresAt = new Date(Date.now() + 15 * 60 * 1000);

      // Guardar el token en la base de datos
      const resetToken = new this.passwordResetTokenModel({
        token,
        user: user._id,
        expiresAt,
        isUsed: false,
      });

      await resetToken.save();

      // Enviar email con el token
      await this.sendResetEmail(email, token, user.personalInfo?.firstName);

      this.logger.log(`✅ Token de restablecimiento enviado para: ${email}`);

      return {
        success: true,
        message:
          'Si el correo está registrado, recibirás un código de verificación.',
      };
    } catch (error) {
      this.logger.error(
        `❌ Error en solicitud de restablecimiento para ${email}:`,
        error,
      );

      if (error instanceof RpcException) {
        throw error;
      }

      throw new RpcException({
        status: 500,
        message: 'Error interno del servidor',
      });
    }
  }

  async validateResetToken(
    email: string,
    token: string,
  ): Promise<{ success: boolean; message: string }> {
    try {
      this.logger.log(`🔍 Validando token para: ${email}`);

      // Buscar usuario
      const user = await this.userModel
        .findOne({ email: email.toLowerCase() })
        .exec();

      if (!user) {
        throw new RpcException({
          status: 400,
          message: 'Token inválido o expirado',
        });
      }

      // Buscar token válido
      const resetToken = await this.passwordResetTokenModel
        .findOne({
          token,
          user: user._id,
          isUsed: false,
          expiresAt: { $gt: new Date() },
        })
        .exec();

      if (!resetToken) {
        throw new RpcException({
          status: 400,
          message: 'Token inválido o expirado',
        });
      }

      this.logger.log(`✅ Token válido para: ${email}`);

      return {
        success: true,
        message: 'Token válido',
      };
    } catch (error) {
      this.logger.error(`❌ Error validando token para ${email}:`, error);

      if (error instanceof RpcException) {
        throw error;
      }

      throw new RpcException({
        status: 500,
        message: 'Error interno del servidor',
      });
    }
  }

  async resetPassword(
    email: string,
    token: string,
    newPassword: string,
  ): Promise<{ success: boolean; message: string }> {
    try {
      this.logger.log(`🔑 Restableciendo contraseña para: ${email}`);

      // Buscar usuario
      const user = await this.userModel
        .findOne({ email: email.toLowerCase() })
        .exec();

      if (!user) {
        throw new RpcException({
          status: 400,
          message: 'Token inválido o expirado',
        });
      }

      // Buscar y validar token
      const resetToken = await this.passwordResetTokenModel
        .findOne({
          token,
          user: user._id,
          isUsed: false,
          expiresAt: { $gt: new Date() },
        })
        .exec();

      if (!resetToken) {
        throw new RpcException({
          status: 400,
          message: 'Token inválido o expirado',
        });
      }

      // Verificar que la nueva contraseña sea diferente (obtener contraseña actual)
      const userWithPassword = await this.userModel
        .findById(user._id)
        .select('+password')
        .exec();

      if (userWithPassword) {
        const isSamePassword = await bcrypt.compare(
          newPassword,
          userWithPassword.password,
        );
        if (isSamePassword) {
          throw new RpcException({
            status: 400,
            message: 'La nueva contraseña debe ser diferente a la actual',
          });
        }
      }

      // Hashear nueva contraseña
      const hashedPassword = await bcrypt.hash(newPassword, 12);

      // Actualizar contraseña
      await this.userModel
        .findByIdAndUpdate(
          user._id,
          {
            password: hashedPassword,
            updatedAt: new Date(),
          },
          { new: true },
        )
        .exec();

      // Marcar token como usado
      await this.passwordResetTokenModel
        .findByIdAndUpdate(resetToken._id, { isUsed: true })
        .exec();

      // Invalidar todos los otros tokens del usuario
      await this.passwordResetTokenModel
        .updateMany({ user: user._id, isUsed: false }, { isUsed: true })
        .exec();

      this.logger.log(`✅ Contraseña restablecida exitosamente para: ${email}`);

      return {
        success: true,
        message: 'Contraseña restablecida exitosamente',
      };
    } catch (error) {
      this.logger.error(
        `❌ Error restableciendo contraseña para ${email}:`,
        error,
      );

      if (error instanceof RpcException) {
        throw error;
      }

      throw new RpcException({
        status: 500,
        message: 'Error interno del servidor',
      });
    }
  }

  private generateResetToken(): string {
    // Generar código de 5 dígitos
    return Math.floor(10000 + Math.random() * 90000).toString();
  }

  private async sendResetEmail(
    email: string,
    token: string,
    firstName?: string,
  ): Promise<void> {
    try {
      const emailData = {
        to: email,
        subject: 'Código de restablecimiento de contraseña',
        html: this.generateEmailTemplate(token, firstName),
      };

      await firstValueFrom(
        this.client.send({ cmd: 'integration.email.send' }, emailData),
      );

      this.logger.log(`📧 Email enviado exitosamente a: ${email}`);
    } catch (error) {
      this.logger.error(`❌ Error enviando email a ${email}:`, error);
      throw new RpcException({
        status: 500,
        message: 'Error enviando código de verificación',
      });
    }
  }

  private generateEmailTemplate(token: string, firstName?: string): string {
    const name = firstName ? firstName : 'Usuario';

    return `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <title>Código de restablecimiento de contraseña</title>
      </head>
      <body style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
        <div style="text-align: center; margin-bottom: 30px;">
          <h1 style="color: #333;">Restablecimiento de Contraseña</h1>
        </div>
        
        <div style="background-color: #f9f9f9; padding: 20px; border-radius: 8px; margin-bottom: 20px;">
          <p>Hola <strong>${name}</strong>,</p>
          
          <p>Has solicitado restablecer tu contraseña. Usa el siguiente código de verificación:</p>
          
          <div style="text-align: center; margin: 30px 0;">
            <span style="background-color: #007bff; color: white; padding: 15px 30px; font-size: 24px; font-weight: bold; border-radius: 8px; letter-spacing: 5px;">${token}</span>
          </div>
          
          <p><strong>Este código:</strong></p>
          <ul>
            <li>Expira en <strong>15 minutos</strong></li>
            <li>Solo puede ser usado una vez</li>
            <li>Es válido únicamente para tu cuenta</li>
          </ul>
          
          <p style="color: #666; font-size: 14px; margin-top: 30px;">
            Si no solicitaste este restablecimiento, ignora este correo. Tu contraseña permanecerá sin cambios.
          </p>
        </div>
        
        <div style="text-align: center; color: #999; font-size: 12px;">
          <p>Este es un correo automático, por favor no respondas.</p>
        </div>
      </body>
      </html>
    `;
  }
}
