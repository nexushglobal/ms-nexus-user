import { Inject, Injectable, Logger } from '@nestjs/common';
import { ClientProxy, RpcException } from '@nestjs/microservices';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { firstValueFrom } from 'rxjs';
import { NATS_SERVICE } from 'src/config/services';
import { UpdateBankInfoDto } from '../dto/update-back-info.dto';
import { UpdateBillingInfoDto } from '../dto/update-billing-info.dto';
import { UpdateContactInfoDto } from '../dto/update-conteact-info.dto';
import { UpdatePhotoDto } from '../dto/update-photo-dto';
import { UpdatePersonalInfoDto } from '../dto/update-profile-info.dto';
import { User, UserDocument } from '../schemas/user.schema';

interface ValidationConstraints {
  email?: { userId: string };
  nickname?: { userId: string };
  document?: { userId: string; docType: string; docNumber: string };
}

@Injectable()
export class ProfileService {
  private readonly logger = new Logger(ProfileService.name);

  constructor(
    @InjectModel(User.name) private userModel: Model<UserDocument>,
    @Inject(NATS_SERVICE) private readonly client: ClientProxy,
  ) {}

  async getUserProfile(userId: string) {
    try {
      const user = await this.validateUserAndGet(userId, {
        populate: {
          path: 'role',
          select: 'id code name isActive',
        },
      });

      return this.formatUserProfile(user);
    } catch (error) {
      this.handleError(error, 'Error obteniendo perfil de usuario');
    }
  }

  async updateContactInfo(userId: string, dto: UpdateContactInfoDto) {
    const updateData = this.buildUpdateData(dto, 'contactInfo');

    const updatedUser = await this.updateUserById(userId, updateData, {
      populate: { path: 'role', select: 'id code name isActive' },
    });

    return {
      contactInfo: this.extractNestedData(updatedUser, 'contactInfo'),
      updatedAt: updatedUser.updatedAt,
    };
  }

  async updateBillingInfo(userId: string, dto: UpdateBillingInfoDto) {
    const updateData = this.buildUpdateData(dto, 'billingInfo');

    const updatedUser = await this.updateUserById(userId, updateData);

    return {
      billingInfo: this.extractNestedData(updatedUser, 'billingInfo'),
      updatedAt: updatedUser.updatedAt,
    };
  }

  async updateBankInfo(userId: string, dto: UpdateBankInfoDto) {
    const updateData = this.buildUpdateData(dto, 'bankInfo');

    const updatedUser = await this.updateUserById(userId, updateData);

    return {
      bankInfo: this.extractNestedData(updatedUser, 'bankInfo'),
      updatedAt: updatedUser.updatedAt,
    };
  }

  async updatePersonalInfo(userId: string, dto: UpdatePersonalInfoDto) {
    // Validar restricciones únicas
    await this.validateUniqueConstraints(userId, {
      email: dto.email ? { userId } : undefined,
      nickname: dto.nickname ? { userId } : undefined,
      document:
        dto.documentNumber || dto.documentType
          ? {
              userId,
              docType: dto.documentType || '',
              docNumber: dto.documentNumber || '',
            }
          : undefined,
    });

    const updateData = this.buildPersonalInfoUpdateData(dto);

    const updatedUser = await this.updateUserById(userId, updateData);

    return {
      nickname: updatedUser.nickname || null,
      email: updatedUser.email || null,
      personalInfo: {
        documentType: updatedUser.personalInfo?.documentType || null,
        documentNumber: updatedUser.personalInfo?.documentNumber || null,
      },
      updatedAt: updatedUser.updatedAt,
    };
  }

  async updatePhoto(userId: string, dto: UpdatePhotoDto) {
    try {
      const existingUser = await this.validateUserAndGet(userId);

      const { oldPhotoKey, shouldDeleteOldPhoto } =
        this.analyzeExistingPhoto(existingUser);
      console.log('Foto existente analizada:', {
        oldPhotoKey,
        shouldDeleteOldPhoto,
      });
      const uploadResult = await this.uploadPhotoToS3(dto);

      const updatedUser = await this.updateUserById(userId, {
        photo: uploadResult.url,
        photoKey: uploadResult.key,
      });

      // Eliminar foto anterior si es necesario
      if (shouldDeleteOldPhoto && oldPhotoKey) {
        await this.deleteOldPhoto(oldPhotoKey);
      }

      return {
        photo: updatedUser.photo,
        photoKey: updatedUser.photoKey,
        updatedAt: updatedUser.updatedAt,
      };
    } catch (error) {
      this.handleError(error, 'Error actualizando foto de perfil');
    }
  }

  // ========== MÉTODOS PRIVADOS DE UTILIDAD ==========

  private validateObjectId(userId: string): void {
    if (!Types.ObjectId.isValid(userId)) {
      throw new RpcException({
        status: 400,
        message: 'ID de usuario inválido',
      });
    }
  }

  private async validateUserAndGet(
    userId: string,
    options?: { populate?: string | Record<string, any> },
  ): Promise<UserDocument> {
    this.validateObjectId(userId);

    let query = this.userModel.findById(userId);

    if (options?.populate) {
      query = query.populate(options.populate as string | string[]);
    }

    const user = await query.exec();

    if (!user) {
      throw new RpcException({
        status: 404,
        message: `Usuario con ID ${userId} no encontrado`,
      });
    }

    return user;
  }

  private async updateUserById(
    userId: string,
    updateData: Record<string, any>,
    options?: { populate?: string | Record<string, any> },
  ): Promise<UserDocument> {
    await this.validateUserAndGet(userId);

    if (Object.keys(updateData).length === 0) {
      throw new RpcException({
        status: 400,
        message: 'No se proporcionaron campos para actualizar',
      });
    }

    let query = this.userModel.findByIdAndUpdate(
      userId,
      { $set: updateData },
      { new: true, runValidators: true },
    );

    if (options?.populate) {
      query = query.populate(options.populate as string | string[]);
    }

    const updatedUser = await query.exec();

    if (!updatedUser) {
      throw new RpcException({
        status: 404,
        message: 'Usuario no encontrado',
      });
    }

    return updatedUser;
  }

  private buildUpdateData(
    dto: Record<string, any>,
    prefix: string,
  ): Record<string, any> {
    const updateData: Record<string, any> = {};

    Object.entries(dto).forEach(([key, value]) => {
      if (value !== undefined) {
        updateData[`${prefix}.${key}`] = value;
      }
    });

    return updateData;
  }

  private buildPersonalInfoUpdateData(
    dto: UpdatePersonalInfoDto,
  ): Record<string, any> {
    const updateData: Record<string, any> = {};

    if (dto.nickname !== undefined) {
      updateData.nickname = dto.nickname;
    }
    if (dto.email !== undefined) {
      updateData.email = dto.email.toLowerCase();
    }
    if (dto.documentType !== undefined) {
      updateData['personalInfo.documentType'] = dto.documentType;
    }
    if (dto.documentNumber !== undefined) {
      updateData['personalInfo.documentNumber'] = dto.documentNumber;
    }

    return updateData;
  }

  private extractNestedData(
    user: UserDocument,
    field: string,
  ): Record<string, any> | null {
    const data = (user as any)[field];
    if (!data) return null;

    const result: Record<string, any> = {};
    Object.keys(
      data.toObject ? (data.toObject() as object) : (data as object),
    ).forEach((key) => {
      result[key] = data[key] || null;
    });

    return result;
  }

  private async validateUniqueConstraints(
    userId: string,
    constraints: ValidationConstraints,
  ): Promise<void> {
    const existingUser = await this.validateUserAndGet(userId);

    // Validar email único
    if (constraints.email) {
      await this.validateUniqueField(
        userId,
        'email',
        constraints.email.userId,
        'Ya existe un usuario con este email',
      );
    }

    // Validar nickname único
    if (constraints.nickname) {
      await this.validateUniqueField(
        userId,
        'nickname',
        constraints.nickname.userId,
        'Ya existe un usuario con este nickname',
      );
    }

    // Validar documento único
    if (constraints.document) {
      const { docType, docNumber } = constraints.document;
      const finalDocType = docType || existingUser.personalInfo.documentType;
      const finalDocNumber =
        docNumber || existingUser.personalInfo.documentNumber;

      const existingDocument = await this.userModel
        .findOne({
          _id: { $ne: userId },
          'personalInfo.documentType': finalDocType,
          'personalInfo.documentNumber': finalDocNumber,
        })
        .exec();

      if (existingDocument) {
        throw new RpcException({
          status: 409,
          message: `Ya existe un usuario con el documento ${finalDocType}: ${finalDocNumber}`,
        });
      }
    }
  }

  private async validateUniqueField(
    userId: string,
    field: string,
    value: any,
    errorMessage: string,
  ): Promise<void> {
    const existing = await this.userModel
      .findOne({
        _id: { $ne: userId },
        [field]: value,
      })
      .exec();

    if (existing) {
      throw new RpcException({
        status: 409,
        message: errorMessage,
      });
    }
  }

  private analyzeExistingPhoto(user: UserDocument): {
    oldPhotoKey: string | null;
    shouldDeleteOldPhoto: boolean;
  } {
    if (!user.photo) {
      return { oldPhotoKey: null, shouldDeleteOldPhoto: false };
    }

    if (user.photo.includes('cloudinary')) {
      return { oldPhotoKey: null, shouldDeleteOldPhoto: false };
    }

    return {
      oldPhotoKey: user.photoKey ?? null,
      shouldDeleteOldPhoto: true,
    };
  }

  private async uploadPhotoToS3(
    dto: UpdatePhotoDto,
  ): Promise<{ url: string; key: string }> {
    const uploadResult = await firstValueFrom(
      this.client.send(
        { cmd: 'integration.files.uploadImage' },
        {
          file: dto.file,
          folder: 'profiles',
        },
      ),
    );

    if (!uploadResult.success && !uploadResult.url) {
      throw new RpcException({
        status: 500,
        message: 'Error al subir la imagen',
      });
    }

    return uploadResult;
  }

  private async deleteOldPhoto(photoKey: string): Promise<void> {
    try {
      await firstValueFrom(
        this.client.send(
          { cmd: 'integration.files.delete' },
          { key: photoKey },
        ),
      );
    } catch (deleteError) {
      this.logger.warn(
        `⚠️ No se pudo eliminar la foto anterior de S3: ${photoKey}`,
        deleteError,
      );
    }
  }

  private formatUserProfile(user: UserDocument): Record<string, any> {
    return {
      id: (user._id as Types.ObjectId).toString(),
      email: user.email,
      referralCode: user.referralCode,
      referrerCode: user.referrerCode || null,
      isActive: user.isActive,
      nickname: user.nickname || null,
      photo: user.photo || null,
      personalInfo: user.personalInfo
        ? {
            firstName: user.personalInfo.firstName,
            lastName: user.personalInfo.lastName,
            documentType: user.personalInfo.documentType,
            documentNumber: user.personalInfo.documentNumber,
            gender: user.personalInfo.gender,
            birthdate: user.personalInfo.birthdate,
          }
        : null,
      contactInfo: user.contactInfo
        ? {
            phone: user.contactInfo.phone,
            address: user.contactInfo.address || null,
            postalCode: user.contactInfo.postalCode || null,
            country: user.contactInfo.country,
          }
        : null,
      billingInfo: user.billingInfo
        ? {
            ruc: user.billingInfo.ruc || null,
            razonSocial: user.billingInfo.razonSocial || null,
            address: user.billingInfo.address || null,
          }
        : null,
      bankInfo: user.bankInfo
        ? {
            bankName: user.bankInfo.bankName || null,
            accountNumber: user.bankInfo.accountNumber || null,
            cci: user.bankInfo.cci || null,
          }
        : null,
    };
  }

  private handleError(error: any, defaultMessage: string): never {
    this.logger.error(`${defaultMessage}: ${error.message}`);

    if (error instanceof RpcException) {
      throw error;
    }

    if (error.name === 'ValidationError') {
      const validationErrors = Object.values(
        error.errors as { [key: string]: { message: string } },
      ).map((err) => err.message);

      throw new RpcException({
        status: 400,
        message: 'Error de validación',
        errors: validationErrors,
      });
    }

    if (error.code === 11000) {
      const duplicatedField = Object.keys(
        error.keyPattern as Record<string, unknown>,
      )[0];

      let message = 'Ya existe un usuario con esta información';
      if (duplicatedField === 'email') {
        message = 'Ya existe un usuario con este email';
      } else if (duplicatedField === 'nickname') {
        message = 'Ya existe un usuario con este nickname';
      }

      throw new RpcException({
        status: 409,
        message,
      });
    }

    throw new RpcException({
      status: 500,
      message: defaultMessage,
    });
  }
}
