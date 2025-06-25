import { Inject, Injectable, Logger } from '@nestjs/common';
import { ClientProxy, RpcException } from '@nestjs/microservices';
import { InjectModel } from '@nestjs/mongoose';
import * as bcrypt from 'bcryptjs';
import { Model, Types } from 'mongoose';
import { firstValueFrom } from 'rxjs';
import { NATS_SERVICE } from 'src/config/services';
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
    @Inject(NATS_SERVICE) private readonly client: ClientProxy,
  ) {}

  async register(registerDto: RegisterDto) {
    try {
      // Validaciones existentes
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
      let assignedPosition: Position = Position.LEFT;

      // Si hay código de referido, buscar posición automáticamente
      if (registerDto.referrerCode) {
        const { parent, position } = await this.findOptimalPosition(
          registerDto.referrerCode,
          registerDto.position,
        );
        parentUser = parent;
        assignedPosition = position;
      }

      // Crear nuevo usuario
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

      // Actualizar el árbol binario
      if (parentUser && assignedPosition) {
        if (assignedPosition === Position.LEFT) {
          parentUser.leftChild = savedUser._id as Types.ObjectId;
        } else {
          parentUser.rightChild = savedUser._id as Types.ObjectId;
        }
        await parentUser.save();
      }

      // Enviar correo de bienvenida
      await this.sendWelcomeEmail(savedUser);

      this.logger.log(`✅ Usuario registrado exitosamente: ${savedUser.email}`);

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
        throw new RpcException({
          status: 409,
          message: `Ya existe un registro con ese campo`,
        });
      }

      throw new RpcException({
        status: 500,
        message: 'Error interno del servidor al registrar usuario',
      });
    }
  }

  /**
   * Encuentra la posición óptima para asignar un nuevo usuario
   */
  private async findOptimalPosition(
    referrerCode: string,
    preferredPosition?: Position | string,
  ): Promise<{ parent: UserDocument; position: Position }> {
    // Buscar el usuario referidor
    const referrerUser = await this.userModel.findOne({
      referralCode: referrerCode.toUpperCase(),
      isActive: true,
    });

    if (!referrerUser) {
      throw new RpcException({
        status: 404,
        message: `El código de referido ${referrerCode} no existe`,
      });
    }

    // Determinar posición objetivo
    const targetPosition =
      preferredPosition === 'RIGHT' ? Position.RIGHT : Position.LEFT;

    // Buscar posición usando BFS
    let availableParent = await this.findAvailablePosition(
      referrerUser,
      targetPosition,
    );

    // Verificar si la posición está disponible
    if (
      (targetPosition === Position.LEFT && !availableParent.leftChild) ||
      (targetPosition === Position.RIGHT && !availableParent.rightChild)
    ) {
      return { parent: availableParent, position: targetPosition };
    }

    // Si la posición preferida no está disponible, buscar la alternativa
    const alternativePosition =
      targetPosition === Position.LEFT ? Position.RIGHT : Position.LEFT;
    availableParent = await this.findAvailablePosition(
      referrerUser,
      alternativePosition,
    );

    if (
      (alternativePosition === Position.LEFT && !availableParent.leftChild) ||
      (alternativePosition === Position.RIGHT && !availableParent.rightChild)
    ) {
      return { parent: availableParent, position: alternativePosition };
    }

    // Fallback: asignar directamente bajo el referidor
    if (!referrerUser.leftChild) {
      return { parent: referrerUser, position: Position.LEFT };
    } else {
      return { parent: referrerUser, position: Position.RIGHT };
    }
  }

  /**
   * Busca posición disponible usando BFS (sin límites)
   */
  private async findAvailablePosition(
    startUser: UserDocument,
    targetPosition: Position,
  ): Promise<UserDocument> {
    const queue: UserDocument[] = [startUser];

    while (queue.length > 0) {
      const currentUser = queue.shift()!;

      // Si la posición está libre, retornar este usuario
      if (targetPosition === Position.LEFT && !currentUser.leftChild) {
        return currentUser;
      }
      if (targetPosition === Position.RIGHT && !currentUser.rightChild) {
        return currentUser;
      }

      // Agregar hijos a la cola para el siguiente nivel
      if (currentUser.leftChild) {
        const leftChild = await this.userModel.findById(currentUser.leftChild);
        if (leftChild) queue.push(leftChild);
      }

      if (currentUser.rightChild) {
        const rightChild = await this.userModel.findById(
          currentUser.rightChild,
        );
        if (rightChild) queue.push(rightChild);
      }
    }

    // Si llegamos aquí, retornar el usuario inicial como fallback
    return startUser;
  }

  /**
   * Envía correo de bienvenida al nuevo usuario
   */
  private async sendWelcomeEmail(user: UserDocument): Promise<void> {
    try {
      const emailData = {
        to: user.email,
        subject: '¡Bienvenido a nuestra plataforma! 🎉',
        html: this.generateWelcomeEmailTemplate(user),
      };

      await firstValueFrom(
        this.client.send({ cmd: 'integration.email.send' }, emailData),
      );

      this.logger.log(`📧 Correo de bienvenida enviado a: ${user.email}`);
    } catch (error) {
      this.logger.error(
        `❌ Error enviando correo de bienvenida a ${user.email}:`,
        error,
      );
      // No lanzamos error aquí para no fallar el registro si falla el email
    }
  }

  /**
   * Genera el template HTML para el correo de bienvenida
   */
  private generateWelcomeEmailTemplate(user: UserDocument): string {
    const firstName = user.personalInfo?.firstName || 'Usuario';
    const referralCode = user.referralCode;

    return `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <title>¡Bienvenido a nuestra plataforma!</title>
      </head>
      <body style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; background-color: #f5f5f5;">
        <div style="background-color: white; padding: 30px; border-radius: 10px; box-shadow: 0 2px 10px rgba(0,0,0,0.1);">
          
          <div style="text-align: center; margin-bottom: 30px;">
            <h1 style="color: #2c3e50; margin: 0; font-size: 28px;">¡Bienvenido! 🎉</h1>
          </div>
          
          <div style="margin-bottom: 30px;">
            <p style="font-size: 16px; color: #333; line-height: 1.6;">
              Hola <strong>${firstName}</strong>,
            </p>
            
            <p style="font-size: 16px; color: #333; line-height: 1.6;">
              ¡Gracias por unirte a nuestra plataforma! Tu cuenta ha sido creada exitosamente.
            </p>
            
            <div style="background-color: #f8f9fa; padding: 20px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #28a745;">
              <h3 style="color: #28a745; margin-top: 0;">Información de tu cuenta:</h3>
              <ul style="color: #333; line-height: 1.8;">
                <li><strong>Email:</strong> ${user.email}</li>
                <li><strong>Código de referido:</strong> <span style="background-color: #e3f2fd; padding: 4px 8px; border-radius: 4px; font-family: monospace; font-weight: bold;">${referralCode}</span></li>
                <li><strong>Fecha de registro:</strong> ${new Date().toLocaleDateString('es-ES')}</li>
              </ul>
            </div>
            
            <div style="background-color: #e8f5e8; padding: 20px; border-radius: 8px; margin: 20px 0; text-align: center;">
              <h3 style="color: #2c3e50; margin-top: 0;">Tu código de referido:</h3>
              <div style="background-color: #28a745; color: white; padding: 15px; border-radius: 8px; font-size: 20px; font-weight: bold; letter-spacing: 2px; margin: 10px 0;">
                ${referralCode}
              </div>
              <p style="color: #666; font-size: 14px; margin-bottom: 0;">
                Comparte este código con tus amigos para que puedan unirse a tu red
              </p>
            </div>
            
            <div style="text-align: center; margin: 30px 0;">
              <a href="http://localhost:3000/login" style="background-color: #007bff; color: white; padding: 15px 30px; text-decoration: none; border-radius: 8px; font-weight: bold; display: inline-block;">
                Iniciar Sesión
              </a>
            </div>
          </div>
          
          <div style="border-top: 1px solid #e0e0e0; padding-top: 20px; text-align: center; color: #999; font-size: 12px;">
            <p>Este es un correo automático, por favor no respondas.</p>
            <p style="margin: 5px 0;">© ${new Date().getFullYear()} Nuestra Plataforma. Todos los derechos reservados.</p>
          </div>
        </div>
      </body>
      </html>
    `;
  }

  // ... resto de métodos existentes sin cambios
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

  async findByEmailMS(email: string): Promise<{
    id: string;
    email: string;
    fullName: string;
  } | null> {
    try {
      const user = await this.userModel
        .findOne({
          email: email.toLowerCase(),
        })
        .select('email personalInfo')
        .exec();

      if (!user) {
        return null;
      }

      // Transformar la respuesta
      return {
        id: (user._id as Types.ObjectId).toString(),
        email: user.email,
        fullName: user.personalInfo
          ? `${user.personalInfo.firstName} ${user.personalInfo.lastName}`.trim()
          : 'Usuario sin nombre',
      };
    } catch (error) {
      this.logger.error(`Error buscando usuario por email ${email}:`, error);
      return null;
    }
  }
  async findByReferralCode(code: string): Promise<UserDocument | null> {
    return this.userModel
      .findOne({
        referralCode: code.toUpperCase(),
      })
      .populate('role')
      .exec();
  }

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
    };
  }

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
            $setOnInsert: {},
          },
          {
            new: true,
            upsert: false,
            runValidators: true,
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
