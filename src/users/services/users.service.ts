import { Injectable } from '@nestjs/common';
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
      .select('+password')
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
      password: user.password,
      isActive: user.isActive,
      // role:
      //   typeof user.role === 'object' &&
      //   user.role !== null &&
      //   'code' in user.role
      //     ? {
      //         id: user.role._id.toString(),
      //         code: user.role.code,
      //         name: user.role.name,
      //         isActive: user.role.isActive,
      //       }
      //     : {
      //         id: user.role?.toString?.() ?? '',
      //         code: '',
      //         name: '',
      //         isActive: false,
      //       },
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
  async updateLastLoginAt(userId: string): Promise<void> {
    if (!Types.ObjectId.isValid(userId)) {
      return;
    }

    await this.userModel
      .findByIdAndUpdate(userId, { lastLoginAt: new Date() }, { new: true })
      .exec();
  }

  // Método para validar si un usuario existe y está activo
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

  // Método para obtener información básica del usuario
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

  // Método para actualizar contraseña
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
}
