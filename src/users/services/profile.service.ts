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

@Injectable()
export class ProfileService {
  private readonly logger = new Logger(ProfileService.name);

  constructor(
    @InjectModel(User.name) private userModel: Model<UserDocument>,
    @Inject(NATS_SERVICE) private readonly client: ClientProxy,
  ) {}

  async getUserProfile(userId: string) {
    try {
      if (!Types.ObjectId.isValid(userId)) {
        throw new RpcException({
          status: 400,
          message: 'ID de usuario inválido',
        });
      }

      const user = await this.userModel
        .findById(userId)
        .populate({
          path: 'role',
          select: 'id code name isActive',
        })
        .exec();

      if (!user) {
        throw new RpcException({
          status: 404,
          message: `Usuario con ID ${userId} no encontrado`,
        });
      }

      return {
        id: (user._id as Types.ObjectId).toString(),
        email: user.email,
        referralCode: user.referralCode,
        referrerCode: user.referrerCode || null,
        isActive: user.isActive,
        nickname: user.nickname || null,
        photo: user.photo || null,
        photoKey: user.photoKey || null,
        lastLoginAt: user.lastLoginAt || null,
        position: user.position || null,
        role: {
          id: (user.role as any)._id.toString(),
          code: (user.role as any).code,
          name: (user.role as any).name,
          isActive: (user.role as any).isActive,
        },
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
        createdAt: user.createdAt,
        updatedAt: user.updatedAt,
      };
    } catch (error) {
      this.logger.error(`Error obteniendo perfil de usuario: ${error.message}`);

      if (error instanceof RpcException) {
        throw error;
      }

      throw new RpcException({
        status: 500,
        message: 'Error interno del servidor al obtener perfil de usuario',
      });
    }
  }
  async updateContactInfo(
    userId: string,
    updateContactInfoDto: UpdateContactInfoDto,
  ) {
    try {
      if (!Types.ObjectId.isValid(userId)) {
        throw new RpcException({
          status: 400,
          message: 'ID de usuario inválido',
        });
      }

      const existingUser = await this.userModel.findById(userId).exec();
      if (!existingUser) {
        throw new RpcException({
          status: 404,
          message: `Usuario con ID ${userId} no encontrado`,
        });
      }

      const updateData: Record<string, unknown> = {};

      if (updateContactInfoDto.phone !== undefined) {
        updateData['contactInfo.phone'] = updateContactInfoDto.phone;
      }
      if (updateContactInfoDto.address !== undefined) {
        updateData['contactInfo.address'] = updateContactInfoDto.address;
      }
      if (updateContactInfoDto.postalCode !== undefined) {
        updateData['contactInfo.postalCode'] = updateContactInfoDto.postalCode;
      }
      if (updateContactInfoDto.country !== undefined) {
        updateData['contactInfo.country'] = updateContactInfoDto.country;
      }

      if (Object.keys(updateData).length === 0) {
        throw new RpcException({
          status: 400,
          message: 'No se proporcionaron campos para actualizar',
        });
      }

      const updatedUser = await this.userModel
        .findByIdAndUpdate(
          userId,
          { $set: updateData },
          {
            new: true,
            runValidators: true,
          },
        )
        .populate({
          path: 'role',
          select: 'id code name isActive',
        })
        .exec();

      if (!updatedUser) {
        throw new RpcException({
          status: 404,
          message: 'Usuario no encontrado',
        });
      }

      return {
        success: true,
        message: 'Información de contacto actualizada correctamente',
        data: {
          contactInfo: {
            phone: updatedUser.contactInfo?.phone || null,
            address: updatedUser.contactInfo?.address || null,
            postalCode: updatedUser.contactInfo?.postalCode || null,
            country: updatedUser.contactInfo?.country || null,
          },
          updatedAt: updatedUser.updatedAt,
        },
      };
    } catch (error) {
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

      throw new RpcException({
        status: 500,
        message:
          'Error interno del servidor al actualizar información de contacto',
      });
    }
  }

  async updateBillingInfo(
    userId: string,
    updateBillingInfoDto: UpdateBillingInfoDto,
  ) {
    try {
      if (!Types.ObjectId.isValid(userId)) {
        throw new RpcException({
          status: 400,
          message: 'ID de usuario inválido',
        });
      }

      const existingUser = await this.userModel.findById(userId).exec();
      if (!existingUser) {
        throw new RpcException({
          status: 404,
          message: `Usuario con ID ${userId} no encontrado`,
        });
      }

      const updateData: Record<string, unknown> = {};

      if (updateBillingInfoDto.ruc !== undefined) {
        updateData['billingInfo.ruc'] = updateBillingInfoDto.ruc;
      }
      if (updateBillingInfoDto.razonSocial !== undefined) {
        updateData['billingInfo.razonSocial'] =
          updateBillingInfoDto.razonSocial;
      }
      if (updateBillingInfoDto.address !== undefined) {
        updateData['billingInfo.address'] = updateBillingInfoDto.address;
      }

      if (Object.keys(updateData).length === 0) {
        throw new RpcException({
          status: 400,
          message: 'No se proporcionaron campos para actualizar',
        });
      }

      // Actualizar el usuario
      const updatedUser = await this.userModel
        .findByIdAndUpdate(
          userId,
          { $set: updateData },
          {
            new: true,
            runValidators: true,
          },
        )
        .exec();

      if (!updatedUser) {
        throw new RpcException({
          status: 404,
          message: 'Usuario no encontrado',
        });
      }

      return {
        success: true,
        message: 'Información de facturación actualizada correctamente',
        data: {
          billingInfo: {
            ruc: updatedUser.billingInfo?.ruc || null,
            razonSocial: updatedUser.billingInfo?.razonSocial || null,
            address: updatedUser.billingInfo?.address || null,
          },
          updatedAt: updatedUser.updatedAt,
        },
      };
    } catch (error) {
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

      throw new RpcException({
        status: 500,
        message:
          'Error interno del servidor al actualizar información de facturación',
      });
    }
  }

  async updateBankInfo(userId: string, updateBankInfoDto: UpdateBankInfoDto) {
    try {
      if (!Types.ObjectId.isValid(userId)) {
        throw new RpcException({
          status: 400,
          message: 'ID de usuario inválido',
        });
      }

      const existingUser = await this.userModel.findById(userId).exec();
      if (!existingUser) {
        throw new RpcException({
          status: 404,
          message: `Usuario con ID ${userId} no encontrado`,
        });
      }

      const updateData: Record<string, unknown> = {};

      if (updateBankInfoDto.bankName !== undefined) {
        updateData['bankInfo.bankName'] = updateBankInfoDto.bankName;
      }
      if (updateBankInfoDto.accountNumber !== undefined) {
        updateData['bankInfo.accountNumber'] = updateBankInfoDto.accountNumber;
      }
      if (updateBankInfoDto.cci !== undefined) {
        updateData['bankInfo.cci'] = updateBankInfoDto.cci;
      }

      if (Object.keys(updateData).length === 0) {
        throw new RpcException({
          status: 400,
          message: 'No se proporcionaron campos para actualizar',
        });
      }

      // Actualizar el usuario
      const updatedUser = await this.userModel
        .findByIdAndUpdate(
          userId,
          { $set: updateData },
          {
            new: true,
            runValidators: true,
          },
        )
        .exec();

      if (!updatedUser) {
        throw new RpcException({
          status: 404,
          message: 'Usuario no encontrado',
        });
      }

      return {
        success: true,
        message: 'Información bancaria actualizada correctamente',
        data: {
          bankInfo: {
            bankName: updatedUser.bankInfo?.bankName || null,
            accountNumber: updatedUser.bankInfo?.accountNumber || null,
            cci: updatedUser.bankInfo?.cci || null,
          },
          updatedAt: updatedUser.updatedAt,
        },
      };
    } catch (error) {
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

      throw new RpcException({
        status: 500,
        message:
          'Error interno del servidor al actualizar información bancaria',
      });
    }
  }

  async updatePersonalInfo(
    userId: string,
    updatePersonalInfoDto: UpdatePersonalInfoDto,
  ) {
    try {
      // Validar ObjectId
      if (!Types.ObjectId.isValid(userId)) {
        throw new RpcException({
          status: 400,
          message: 'ID de usuario inválido',
        });
      }

      // Verificar que el usuario existe
      const existingUser = await this.userModel.findById(userId).exec();
      if (!existingUser) {
        throw new RpcException({
          status: 404,
          message: `Usuario con ID ${userId} no encontrado`,
        });
      }

      // Verificar email único si se está actualizando
      if (updatePersonalInfoDto.email) {
        const existingEmail = await this.userModel
          .findOne({
            _id: { $ne: userId }, // Excluir el usuario actual
            email: updatePersonalInfoDto.email.toLowerCase(),
          })
          .exec();

        if (existingEmail) {
          throw new RpcException({
            status: 409,
            message: `Ya existe un usuario con el email: ${updatePersonalInfoDto.email}`,
          });
        }
      }

      // Verificar nickname único si se está actualizando
      if (updatePersonalInfoDto.nickname) {
        const existingNickname = await this.userModel
          .findOne({
            _id: { $ne: userId }, // Excluir el usuario actual
            nickname: updatePersonalInfoDto.nickname,
          })
          .exec();

        if (existingNickname) {
          throw new RpcException({
            status: 409,
            message: `Ya existe un usuario con el nickname: ${updatePersonalInfoDto.nickname}`,
          });
        }
      }

      // Si se está actualizando el documento, verificar que no exista otro usuario con el mismo
      if (
        updatePersonalInfoDto.documentNumber ||
        updatePersonalInfoDto.documentType
      ) {
        const docType =
          updatePersonalInfoDto.documentType ||
          existingUser.personalInfo.documentType;
        const docNumber =
          updatePersonalInfoDto.documentNumber ||
          existingUser.personalInfo.documentNumber;

        const existingDocument = await this.userModel
          .findOne({
            _id: { $ne: userId }, // Excluir el usuario actual
            'personalInfo.documentType': docType,
            'personalInfo.documentNumber': docNumber,
          })
          .exec();

        if (existingDocument) {
          throw new RpcException({
            status: 409,
            message: `Ya existe un usuario con el documento ${docType}: ${docNumber}`,
          });
        }
      }

      // Preparar el objeto de actualización
      const updateData: Record<string, unknown> = {};

      if (updatePersonalInfoDto.nickname !== undefined) {
        updateData.nickname = updatePersonalInfoDto.nickname;
      }
      if (updatePersonalInfoDto.email !== undefined) {
        updateData.email = updatePersonalInfoDto.email.toLowerCase();
      }
      if (updatePersonalInfoDto.documentType !== undefined) {
        updateData['personalInfo.documentType'] =
          updatePersonalInfoDto.documentType;
      }
      if (updatePersonalInfoDto.documentNumber !== undefined) {
        updateData['personalInfo.documentNumber'] =
          updatePersonalInfoDto.documentNumber;
      }

      if (Object.keys(updateData).length === 0) {
        throw new RpcException({
          status: 400,
          message: 'No se proporcionaron campos para actualizar',
        });
      }

      const updatedUser = await this.userModel
        .findByIdAndUpdate(
          userId,
          { $set: updateData },
          {
            new: true,
            runValidators: true,
          },
        )
        .exec();

      if (!updatedUser) {
        throw new RpcException({
          status: 404,
          message: 'Usuario no encontrado',
        });
      }

      return {
        success: true,
        message: 'Información personal actualizada correctamente',
        data: {
          nickname: updatedUser.nickname || null,
          email: updatedUser.email || null,
          personalInfo: {
            documentType: updatedUser.personalInfo?.documentType || null,
            documentNumber: updatedUser.personalInfo?.documentNumber || null,
          },
          updatedAt: updatedUser.updatedAt,
        },
      };
    } catch (error) {
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

      // Error de duplicado de MongoDB
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
        message:
          'Error interno del servidor al actualizar información personal',
      });
    }
  }

  async updatePhoto(userId: string, updatePhotoDto: UpdatePhotoDto) {
    try {
      if (!Types.ObjectId.isValid(userId)) {
        throw new RpcException({
          status: 400,
          message: 'ID de usuario inválido',
        });
      }
      const existingUser = await this.userModel.findById(userId).exec();
      if (!existingUser) {
        throw new RpcException({
          status: 404,
          message: `Usuario con ID ${userId} no encontrado`,
        });
      }

      let oldPhotoKey: string | null = null;
      let shouldDeleteOldPhoto = false;

      if (existingUser.photo) {
        if (existingUser.photo.includes('cloudinary')) {
          this.logger.log(
            `Usuario ${userId} tiene foto de Cloudinary, creando nueva sin eliminar anterior`,
          );
        } else {
          oldPhotoKey = existingUser.photoKey ?? null;
          shouldDeleteOldPhoto = true;
          this.logger.log(
            `Usuario ${userId} tiene foto de S3, se eliminará la anterior: ${oldPhotoKey}`,
          );
        }
      }

      const uploadResult = await firstValueFrom(
        this.client.send(
          { cmd: 'integration.files.uploadImage' },
          {
            file: updatePhotoDto.file,
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

      const updatedUser = await this.userModel
        .findByIdAndUpdate(
          userId,
          {
            $set: {
              photo: uploadResult.url,
              photoKey: uploadResult.key,
            },
          },
          {
            new: true,
            runValidators: true,
          },
        )
        .exec();

      if (!updatedUser) {
        throw new RpcException({
          status: 404,
          message: 'Usuario no encontrado',
        });
      }

      if (shouldDeleteOldPhoto && oldPhotoKey) {
        try {
          await firstValueFrom(
            this.client.send(
              { cmd: 'integration.files.delete' },
              { key: oldPhotoKey },
            ),
          );
        } catch (deleteError) {
          this.logger.warn(
            `⚠️ No se pudo eliminar la foto anterior de S3: ${oldPhotoKey}`,
            deleteError,
          );
        }
      }

      return {
        success: true,
        message: 'Foto de perfil actualizada correctamente',
        data: {
          photo: updatedUser.photo,
          photoKey: updatedUser.photoKey,
          updatedAt: updatedUser.updatedAt,
        },
      };
    } catch (error) {
      if (error instanceof RpcException) {
        throw error;
      }

      throw new RpcException({
        status: 500,
        message: 'Error interno del servidor al actualizar foto de perfil',
      });
    }
  }
}
