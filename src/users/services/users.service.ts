import { Injectable, Logger } from '@nestjs/common';
import { RpcException } from '@nestjs/microservices';
import { InjectModel } from '@nestjs/mongoose';
import * as bcrypt from 'bcryptjs';

import { Model, Types } from 'mongoose';
import { v4 as uuidv4 } from 'uuid';
import { Role, RoleDocument } from '../../roles/schemas/roles.schema';
import { View, ViewDocument } from '../../views/schemas/views.schema';
import { RegisterDto } from '../dto/create-user.dto';
import {
  DocumentType,
  Gender,
  Position,
  User,
  UserDocument,
} from '../schemas/user.schema';

@Injectable()
export class UsersService {
  private readonly logger = new Logger(UsersService.name);
  constructor(
    @InjectModel(User.name) private userModel: Model<UserDocument>,
    @InjectModel(Role.name) private roleModel: Model<RoleDocument>,
    @InjectModel(View.name) private viewModel: Model<ViewDocument>,
  ) {}

  async register(registerDto: RegisterDto) {
    try {
      const existingEmail = await this.userModel.findOne({
        email: registerDto.email.toLowerCase(),
      });
      if (existingEmail) {
        throw new RpcException({
          status: 409,
          message: 'El correo electrónico ya está registrado',
        });
      }

      const existingDocument = await this.userModel.findOne({
        'personalInfo.documentType': registerDto.documentType.toUpperCase(),
        'personalInfo.documentNumber': registerDto.documentNumber,
      });
      if (existingDocument) {
        throw new RpcException({
          status: 409,
          message: `El documento ${registerDto.documentNumber} ya está registrado`,
        });
      }

      const role = await this.roleModel.findOne({
        code: registerDto.roleCode.toUpperCase(),
        isActive: true,
      });
      if (!role) {
        throw new RpcException({
          status: 404,
          message: `El rol ${registerDto.roleCode} no existe o no está activo`,
        });
      }

      const referralCode = await this.generateUniqueReferralCode();

      const hashedPassword = await bcrypt.hash(registerDto.password, 12);
      let parentUser: UserDocument | null = null;
      const assignedPosition = registerDto.position || 'LEFT';

      if (registerDto.referrerCode) {
        parentUser = await this.userModel.findOne({
          referralCode: registerDto.referrerCode,
          isActive: true,
        });
        if (!parentUser) {
          throw new RpcException({
            status: 404,
            message: `El código de referido ${registerDto.referrerCode} no existe`,
          });
        }
      }

      const newUser = new this.userModel({
        email: registerDto.email.toLowerCase(),
        password: hashedPassword,
        referralCode,
        referrerCode: registerDto.referrerCode?.toUpperCase(),
        parent: parentUser?._id,
        position: assignedPosition,
        role: role._id,
        isActive: true,
        personalInfo: {
          firstName: registerDto.firstName,
          lastName: registerDto.lastName,
          documentType: registerDto.documentType.toUpperCase() as DocumentType,
          documentNumber: registerDto.documentNumber,
          gender: registerDto.gender as Gender,
          birthdate: new Date(registerDto.birthDate),
        },
        contactInfo: {
          phone: registerDto.phone,
          country: registerDto.country,
        },
      });

      const savedUser = await newUser.save();

      if (parentUser && assignedPosition) {
        if (assignedPosition === Position.LEFT) {
          parentUser.leftChild = savedUser._id as Types.ObjectId;
        } else {
          parentUser.rightChild = savedUser._id as Types.ObjectId;
        }
        await parentUser.save();
      }

      return {
        user: {
          id: (savedUser._id as Types.ObjectId).toString(),
          email: savedUser.email,
          referralCode: savedUser.referralCode,
          firstName: savedUser.personalInfo.firstName,
          lastName: savedUser.personalInfo.lastName,
        },
      };
    } catch (error) {
      if (error instanceof RpcException) {
        throw error;
      }

      if (error.code === 11000) {
        // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
        const field = Object.keys(error.keyPattern)[0];
        throw new RpcException({
          status: 409,
          message: `Ya existe un registro con ese ${field}`,
        });
      }

      throw new RpcException({
        status: 500,
        message: 'Error interno del servidor al registrar usuario',
      });
    }
  }

  private async generateUniqueReferralCode(): Promise<string> {
    let referralCode: string;
    let attempts = 0;
    const maxAttempts = 10;

    do {
      referralCode = this.generateRandomCode();
      attempts++;

      if (attempts > maxAttempts) {
        throw new RpcException({
          status: 500,
          message: 'No se pudo generar un código de referido único',
        });
      }
    } while (await this.userModel.findOne({ referralCode }));

    return referralCode;
  }

  private generateRandomCode(): string {
    return uuidv4().substring(0, 8).toUpperCase();
  }

  async findById(id: string): Promise<UserDocument | null> {
    if (!Types.ObjectId.isValid(id)) {
      return null;
    }
    return this.userModel.findById(id).populate('role').exec();
  }

  async findByEmail(email: string): Promise<UserDocument | null> {
    return this.userModel
      .findOne({
        email: email.toLowerCase(),
      })
      .populate('role')
      .exec();
  }

  async findByReferralCode(code: string): Promise<UserDocument | null> {
    return this.userModel
      .findOne({
        referralCode: code.toUpperCase(),
      })
      .populate('role')
      .exec();
  }

  // Nuevo método para obtener usuario con toda la información necesaria para auth
  async findUserWithRoleById(id: string) {
    if (!Types.ObjectId.isValid(id)) {
      return null;
    }

    const user = await this.userModel
      .findById(id)
      .populate({
        path: 'role',
        select: 'id code name isActive',
      })
      .exec();

    if (!user) {
      return null;
    }

    return {
      id: (user._id as Types.ObjectId).toString(),
      email: user.email,
      isActive: user.isActive,
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
        : undefined,
      contactInfo: user.contactInfo
        ? {
            phone: user.contactInfo.phone,
            address: user.contactInfo.address,
            postalCode: user.contactInfo.postalCode,
            country: user.contactInfo.country,
          }
        : undefined,
      photo: user.photo,
      nickname: user.nickname,
      referralCode: user.referralCode,
      lastLoginAt: user.lastLoginAt,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
    };
  }

  // Método para obtener usuario con password para validación
  async findByEmailWithPassword(email: string) {
    const user = await this.userModel
      .findOne({ email: email.toLowerCase() })
      .populate('role')
      .select('+password')
      .exec();

    if (!user) {
      return null;
    }

    return {
      id: (user._id as Types.ObjectId).toString(),
      email: user.email,
      password: user.password,
      isActive: user.isActive,
      role: {
        id: (user.role as any)._id.toString(),
        code: (user.role as any).code,
        name: (user.role as any).name,
        isActive: (user.role as any).isActive,
      },
    };
  }

  // Método para obtener el usuario principal (root con rol CLI)
  async findPrincipalUser() {
    const user = await this.userModel
      .findOne({
        parent: null,
        'role.code': 'CLI',
      })
      .populate('role')
      .select('+password')
      .exec();

    if (!user) {
      return null;
    }

    return {
      id: (user._id as Types.ObjectId).toString(),
      email: user.email,
      // password: user.password,
      // isActive: user.isActive,
      // role: {
      //   id: user.role._id.toString(),
      //   code: user.role.code,
      //   name: user.role.name,
      //   isActive: user.role.isActive,
      // },
      // personalInfo: user.personalInfo
      //   ? {
      //       firstName: user.personalInfo.firstName,
      //       lastName: user.personalInfo.lastName,
      //     }
      //   : undefined,
      // photo: user.photo,
      // nickname: user.nickname,
    };
  }

  // Método para obtener las vistas por rol

  // Método para actualizar la última conexión del usuario
  async updateLastLoginAt(userId: string) {
    try {
      if (!Types.ObjectId.isValid(userId)) {
        this.logger.warn(`❌ ID de usuario inválido: ${userId}`);
        return;
      }

      const result = await this.userModel
        .findByIdAndUpdate(
          userId,
          {
            lastLoginAt: new Date(),
            // Si es la primera vez que inicia sesión, también podemos actualizar otros campos
            $setOnInsert: {
              // Campos que solo se establecen si no existen
            },
          },
          {
            new: true,
            upsert: false, // No crear si no existe
            runValidators: true, // Ejecutar validadores del schema
          },
        )
        .exec();

      if (!result) {
        this.logger.warn(
          `❌ Usuario no encontrado para actualizar lastLoginAt: ${userId}`,
        );
        return false;
      }

      this.logger.log(`✅ LastLoginAt actualizado para usuario: ${userId}`);
      return true;
    } catch (error) {
      this.logger.error(
        `❌ Error actualizando lastLoginAt para usuario ${userId}:`,
        error.message,
      );
    }
  }

  async validateUserExists(userId: string): Promise<boolean> {
    if (!Types.ObjectId.isValid(userId)) {
      return false;
    }

    const user = await this.userModel
      .findById(userId)
      .select('isActive')
      .exec();

    return user?.isActive || false;
  }

  async getUserBasicInfo(userId: string): Promise<{
    id: string;
    email: string;
    firstName?: string;
    lastName?: string;
    photo?: string;
    nickname?: string;
  } | null> {
    if (!Types.ObjectId.isValid(userId)) {
      return null;
    }

    const user = await this.userModel
      .findById(userId)
      .select('email personalInfo photo nickname')
      .exec();

    if (!user) {
      return null;
    }

    return {
      id: (user._id as Types.ObjectId).toString(),
      email: user.email,
      firstName: user.personalInfo?.firstName,
      lastName: user.personalInfo?.lastName,
      photo: user.photo,
      nickname: user.nickname,
    };
  }

  async updatePassword(
    userId: string,
    hashedPassword: string,
  ): Promise<boolean> {
    try {
      if (!Types.ObjectId.isValid(userId)) {
        return false;
      }

      const result = await this.userModel
        .findByIdAndUpdate(userId, { password: hashedPassword }, { new: true })
        .exec();

      return !!result;
    } catch (error) {
      console.error('Error updating password:', error);
      return false;
    }
  }

  async changePassword(
    userId: string,
    currentPassword: string,
    newPassword: string,
  ): Promise<{ success: boolean; message: string }> {
    try {
      if (!Types.ObjectId.isValid(userId)) {
        throw new RpcException({
          status: 400,
          message: 'ID de usuario inválido',
        });
      }

      const user = await this.userModel
        .findById(userId)
        .select('+password')
        .exec();

      if (!user) {
        throw new RpcException({
          status: 404,
          message: 'Usuario no encontrado',
        });
      }

      if (!user.isActive) {
        throw new RpcException({
          status: 403,
          message: 'Usuario inactivo',
        });
      }

      const isCurrentPasswordValid = await bcrypt.compare(
        currentPassword,
        user.password,
      );

      if (!isCurrentPasswordValid) {
        throw new RpcException({
          status: 400,
          message: 'La contraseña actual es incorrecta',
        });
      }

      const isSamePassword = await bcrypt.compare(newPassword, user.password);
      if (isSamePassword) {
        throw new RpcException({
          status: 400,
          message: 'La nueva contraseña debe ser diferente a la actual',
        });
      }

      const hashedNewPassword = await bcrypt.hash(newPassword, 12);

      await this.userModel
        .findByIdAndUpdate(
          userId,
          {
            password: hashedNewPassword,
            updatedAt: new Date(),
          },
          { new: true },
        )
        .exec();

      this.logger.log(`✅ Contraseña actualizada para usuario: ${userId}`);

      return {
        success: true,
        message: 'Contraseña actualizada exitosamente',
      };
    } catch (error) {
      this.logger.error(
        `❌ Error cambiando contraseña para usuario ${userId}:`,
        error,
      );

      if (error instanceof RpcException) {
        throw error;
      }

      throw new RpcException({
        status: 500,
        message: 'Error interno del servidor al cambiar la contraseña',
      });
    }
  }
}
