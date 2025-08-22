import { Injectable } from '@nestjs/common';
import { RpcException } from '@nestjs/microservices';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { GetUserInfoDto } from '../dto/get-user-info.dto';
import { UserInfoResponseDto } from '../dto/user-info-response.dto';
import { User, UserDocument } from '../schemas/user.schema';

@Injectable()
export class UserInfoService {
  constructor(@InjectModel(User.name) private userModel: Model<UserDocument>) {}

  async getUserInfo(
    getUserInfoDto: GetUserInfoDto,
  ): Promise<UserInfoResponseDto> {
    try {
      const { userId } = getUserInfoDto;

      const user = await this.userModel
        .findById(userId)
        .select('personalInfo billingInfo referralCode referrerCode')
        .lean()
        .exec();

      if (!user) {
        throw new RpcException({
          status: 404,
          message: [`Usuario con ID ${userId} no encontrado`],
        });
      }

      // Contar los referidos del usuario
      const referralsCount = await this.userModel
        .countDocuments({ referrerCode: user.referralCode })
        .exec();

      return {
        firstName: user.personalInfo.firstName,
        lastName: user.personalInfo.lastName,
        birthdate: user.personalInfo.birthdate,
        ruc: user.billingInfo?.ruc,
        razonSocial: user.billingInfo?.razonSocial,
        referralCode: user.referralCode,
        referrerCode: user.referrerCode,
        referralsCount,
      };
    } catch (error) {
      if (error instanceof RpcException) {
        throw error;
      }
      throw new RpcException({
        status: 500,
        message: [
          'Error interno del servidor al obtener información del usuario',
        ],
      });
    }
  }
}
