import { Injectable } from '@nestjs/common';
import { RpcException } from '@nestjs/microservices';
import { InjectModel } from '@nestjs/mongoose';
import * as bcrypt from 'bcryptjs';
import { Model } from 'mongoose';
import { v4 as uuidv4 } from 'uuid';
import {
  PasswordResetToken,
  PasswordResetTokenDocument,
} from '../schemas/password-reset-token.schema';
import { User, UserDocument } from '../schemas/user.schema';

@Injectable()
export class PasswordResetService {
  private readonly SALT_ROUNDS = 10;
  private readonly TOKEN_EXPIRY_HOURS = 24;

  constructor(
    @InjectModel(User.name) private userModel: Model<UserDocument>,
    @InjectModel(PasswordResetToken.name)
    private resetTokenModel: Model<PasswordResetTokenDocument>,
  ) {}

  async requestPasswordReset(email: string) {
    try {
      const user = await this.userModel
        .findOne({
          email: email.toLowerCase(),
        })
        .exec();

      if (!user) {
        return {
          success: true,
          message:
            'Si el correo está registrado, recibirás un enlace para restablecer tu contraseña',
        };
      }

      const token = uuidv4();

      const expiresAt = new Date();
      expiresAt.setHours(expiresAt.getHours() + this.TOKEN_EXPIRY_HOURS);

      const resetToken = new this.resetTokenModel({
        token,
        user: user._id,
        expiresAt,
      });
      await resetToken.save();

      return {
        success: true,
        message:
          'Si el correo está registrado, recibirás un enlace para restablecer tu contraseña',
        token,
        email: user.email,
      };
    } catch {
      throw new RpcException({
        status: 500,
        message:
          'No se pudo procesar la solicitud de restablecimiento de contraseña',
      });
    }
  }

  async verifyResetToken(token: string) {
    const resetToken = await this.getValidToken(token);

    // Poblar información del usuario
    await resetToken.populate('user');
    const user = resetToken.user as any;

    return {
      success: true,
      message: 'Token válido',
      email: user.email,
    };
  }

  async resetPassword(token: string, newPassword: string) {
    const resetToken = await this.getValidToken(token);

    // Hash de la nueva contraseña
    const hashedPassword = await this.hashPassword(newPassword);

    // Actualizar contraseña del usuario
    await this.userModel
      .findByIdAndUpdate(
        resetToken.user,
        { password: hashedPassword },
        { new: true },
      )
      .exec();

    // Marcar token como usado
    resetToken.isUsed = true;
    await resetToken.save();

    // Obtener email del usuario para confirmación
    const user = await this.userModel
      .findById(resetToken.user)
      .select('email')
      .exec();

    return {
      success: true,
      message: 'Contraseña actualizada correctamente',
      email: user?.email,
    };
  }

  private async getValidToken(
    token: string,
  ): Promise<PasswordResetTokenDocument> {
    const resetToken = await this.resetTokenModel
      .findOne({
        token,
      })
      .exec();

    if (!resetToken) {
      throw new RpcException({
        status: 404,
        message: 'Token de restablecimiento no encontrado o inválido',
      });
    }

    if (resetToken.isUsed) {
      throw new RpcException({
        status: 401,
        message: 'Este token ya ha sido utilizado',
      });
    }

    if (new Date() > resetToken.expiresAt) {
      throw new RpcException({
        status: 401,
        message: 'El token ha expirado',
      });
    }

    return resetToken;
  }

  private async hashPassword(password: string): Promise<string> {
    return bcrypt.hash(password, this.SALT_ROUNDS);
  }
}
