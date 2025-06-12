import { Injectable } from '@nestjs/common';
import { RpcException } from '@nestjs/microservices';
import { InjectModel } from '@nestjs/mongoose';
import * as bcrypt from 'bcryptjs';

import { Model, Types } from 'mongoose';
import { Role, RoleDocument } from '../roles/schemas/roles.schema';
import {
  DocumentType,
  Gender,
  Position,
  User,
  UserDocument,
} from './schemas/user.schema';
import { v4 as uuidv4 } from 'uuid';
import { RegisterDto } from './dto/create-user.dto';

interface RegisterResponse {
  user: {
    id: string;
    email: string;
    referralCode: string;
    firstName: string;
    lastName: string;
  };
}

@Injectable()
export class UsersService {
  constructor(
    @InjectModel(User.name) private userModel: Model<UserDocument>,
    @InjectModel(Role.name) private roleModel: Model<RoleDocument>,
  ) {}

  async register(registerDto: RegisterDto): Promise<RegisterResponse> {
    try {
      // 1. Validar que el email no exista
      const existingEmail = await this.userModel.findOne({
        email: registerDto.email.toLowerCase(),
      });
      if (existingEmail) {
        throw new RpcException({
          status: 409,
          message: 'El correo electrónico ya está registrado',
        });
      }

      // 2. Validar que el documento no exista
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

      // 3. Buscar el rol por código
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

      // 4. Generar código de referido único
      const referralCode = await this.generateUniqueReferralCode();

      // 5. Encriptar contraseña
      const hashedPassword = await bcrypt.hash(registerDto.password, 12);
      let parentUser: UserDocument | null = null;
      const assignedPosition = registerDto.position || 'LEFT';

      // 6. Manejar sistema de referidos si se proporciona
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

      // 7. Crear el usuario
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

      // 8. Guardar el usuario
      const savedUser = await newUser.save();

      // 9. Actualizar el referidor si existe
      if (parentUser && assignedPosition) {
        if (assignedPosition === Position.LEFT) {
          parentUser.leftChild = savedUser._id as Types.ObjectId;
        } else {
          parentUser.rightChild = savedUser._id as Types.ObjectId;
        }
        await parentUser.save();
      }

      // 10. Retornar respuesta
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

      // Manejar errores de MongoDB (duplicados, etc.)
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
}
