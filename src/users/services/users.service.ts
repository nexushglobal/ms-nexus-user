import { Inject, Injectable, Logger } from '@nestjs/common';
import { ClientProxy, RpcException } from '@nestjs/microservices';
import { InjectModel } from '@nestjs/mongoose';
import * as bcrypt from 'bcryptjs';
import { Model, Types } from 'mongoose';
import { firstValueFrom } from 'rxjs';
import {
  MEMBERSHIP_SERVICE,
  NATS_SERVICE,
  PAYMENT_SERVICE,
} from 'src/config/services';
import { v4 as uuidv4 } from 'uuid';
import { Role, RoleDocument } from '../../roles/schemas/roles.schema';
import { View, ViewDocument } from '../../views/schemas/views.schema';
import {
  MembershipResponse,
  ReferrerMembershipResponse,
} from '../interfaces/membership-response.interface';
import {
  DocumentType,
  Gender,
  Position,
  User,
  UserDocument,
} from '../schemas/user.schema';
import { TreeService } from './tree.service';

@Injectable()
export class UsersService {
  private readonly logger = new Logger(UsersService.name);

  constructor(
    @InjectModel(User.name) private userModel: Model<UserDocument>,
    @InjectModel(Role.name) private roleModel: Model<RoleDocument>,
    @InjectModel(View.name) private viewModel: Model<ViewDocument>,
    @Inject(NATS_SERVICE) private readonly client: ClientProxy,
    @Inject(PAYMENT_SERVICE) private readonly paymentsClient: ClientProxy,
    @Inject(MEMBERSHIP_SERVICE) private readonly membershipClient: ClientProxy,
    private readonly treeService: TreeService,
  ) {}

  async register(registerDto: {
    email: string;
    password: string;

    // Datos personales
    firstName: string;
    lastName: string;
    phone: string;
    birthDate: string;
    gender: string;

    // Ubicación

    country: string;

    // Sistema de referidos

    referrerCode?: string;
    position?: 'LEFT' | 'RIGHT';
    roleCode: string;
    documentType: string;
    documentNumber: string;
  }) {
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

      this.logger.log(`👤 Usuario registrado: ${JSON.stringify(registerDto)}`);

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
          //tranformar de MASCULINO a Masculino
          gender:
            Gender[registerDto.gender.toUpperCase() as keyof typeof Gender],
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
      this.logger.error(
        `❌ Error registrando usuario: ${error.message}`,
        error.stack,
      );
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

  async getUserDetailedInfo(userId: string): Promise<{
    id: string;
    email: string;
    fullName: string;
    phone?: string;
    documentNumber?: string;
    documentType?: string;
    firstName?: string;
    lastName?: string;
    address?: string;
    address_city?: string;
    country_code?: string;
  } | null> {
    try {
      if (!Types.ObjectId.isValid(userId)) {
        return null;
      }

      this.logger.log(
        `👤 Obteniendo información detallada del usuario: ${userId}`,
      );

      const user = await this.userModel
        .findById(userId)
        .select('email personalInfo contactInfo')
        .exec();

      if (!user) {
        return null;
      }

      const result = {
        id: (user._id as Types.ObjectId).toString(),
        email: user.email,
        fullName: user.personalInfo
          ? `${user.personalInfo.firstName} ${user.personalInfo.lastName}`.trim()
          : 'Usuario sin nombre',
        phone: user.contactInfo?.phone,
        documentNumber: user.personalInfo?.documentNumber,
        documentType: user.personalInfo?.documentType,
        firstName: user.personalInfo?.firstName,
        lastName: user.personalInfo?.lastName,
        address: user.contactInfo?.address,
        address_city: user.contactInfo?.address_city,
        country_code: user.contactInfo?.country_code,
      };

      this.logger.log(
        `✅ Información detallada obtenida para usuario: ${userId}`,
      );

      return result;
    } catch (error) {
      this.logger.error(
        `❌ Error obteniendo información detallada del usuario ${userId}:`,
        error,
      );
      return null;
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
    console.log('ID recibido:', id);
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
      billingInfo: user.billingInfo
        ? {
            ruc: user.billingInfo.ruc,
            razonSocial: user.billingInfo.razonSocial,
            address: user.billingInfo.address,
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
  async getUsersInfoBatch(userIds: string[]): Promise<{
    [userId: string]: {
      id: string;
      email: string;
      fullName: string;
      documentNumber?: string;
    };
  }> {
    try {
      if (!userIds || userIds.length === 0) {
        return {};
      }

      this.logger.log(
        `👥 Obteniendo información en lote de ${userIds.length} usuarios`,
      );

      // Filtrar IDs válidos
      const validUserIds = userIds.filter((id) => Types.ObjectId.isValid(id));

      if (validUserIds.length === 0) {
        return {};
      }

      const users = await this.userModel
        .find({
          _id: { $in: validUserIds.map((id) => new Types.ObjectId(id)) },
        })
        .select('email personalInfo')
        .exec();

      const result: {
        [userId: string]: {
          id: string;
          email: string;
          fullName: string;
          documentNumber?: string;
        };
      } = {};

      users.forEach((user) => {
        const userId = (user._id as Types.ObjectId).toString();
        result[userId] = {
          id: userId,
          email: user.email,
          fullName: user.personalInfo
            ? `${user.personalInfo.firstName} ${user.personalInfo.lastName}`.trim()
            : 'Usuario sin nombre',
          documentNumber: user.personalInfo?.documentNumber,
        };
      });

      this.logger.log(
        `✅ Información obtenida para ${users.length} de ${userIds.length} usuarios solicitados`,
      );

      return result;
    } catch (error) {
      this.logger.error(
        `❌ Error obteniendo información de usuarios en lote:`,
        error,
      );
      return {};
    }
  }

  async findPrincipalUser() {
    try {
      //cesar.huertas@inmobiliariahuertas.com
      const principalUser = await this.userModel
        .findOne({
          email: 'cesar.huertas@inmobiliariahuertas.com',
        })
        .populate({
          path: 'role',
          match: { code: 'CLI', isActive: true },
        })
        .exec();

      if (!principalUser || !principalUser.role) {
        this.logger.warn('❌ Usuario principal no encontrado');
        return null;
      }

      const result = {
        id: (principalUser._id as Types.ObjectId).toString(),
        email: principalUser.email,
        firstName: principalUser.personalInfo?.firstName || '',
        lastName: principalUser.personalInfo?.lastName || '',
        role: {
          id: (principalUser.role as any)._id.toString(),
          code: (principalUser.role as any).code,
          name: (principalUser.role as any).name,
        },
      };

      this.logger.log(
        `✅ Usuario principal encontrado: ${principalUser.email}`,
      );
      return result;
    } catch (error) {
      this.logger.error('❌ Error buscando usuario principal:', error);
      return null;
    }
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

  async getCustomerInfo(userId: string) {
    this.logger.log(`Getting customer info for user: ${userId}`);

    try {
      const culqiCustomer = await firstValueFrom(
        this.paymentsClient.send({ cmd: 'culqi.getCustomer' }, { userId }),
      );

      if (culqiCustomer) {
        this.logger.log(
          `Customer found in payments service for user: ${userId}`,
        );
        return culqiCustomer;
      }
    } catch (error) {
      this.logger.warn(
        `Customer not found in payments service for user: ${userId}`,
        error.message,
      );
    }

    const user = await this.getUserDetailedInfo(userId);
    return {
      userId,
      defaultData: {
        email: user?.email,
        firstName: user?.firstName,
        lastName: user?.lastName,
        address: user?.address,
        address_city: user?.address_city,
        country_code: user?.country_code,
        phone: user?.phone,
        metadata: {
          documentType: user?.documentType,
          documentNumber: user?.documentNumber,
        },
      },
    };
  }

  /**
   * Obtiene la información de membresía del referido padre de un usuario
   * @param userId - ID del usuario del cual queremos obtener la membresía del padre
   * @returns Información de la membresía del referido padre
   */
  async getReferrerMembership(
    userId: string,
  ): Promise<ReferrerMembershipResponse> {
    try {
      this.logger.log(
        `🔍 Buscando membresía del referido padre para usuario: ${userId}`,
      );

      // Validar que el userId sea válido
      if (!Types.ObjectId.isValid(userId)) {
        this.logger.warn(`❌ ID de usuario inválido: ${userId}`);
        return {
          hasReferrer: false,
          referrerMembership: null,
          message: 'ID de usuario inválido',
        };
      }

      // 1. Buscar al usuario y obtener su referrerCode
      const user = await this.userModel
        .findById(userId)
        .select('referrerCode personalInfo.firstName personalInfo.lastName')
        .exec();

      if (!user) {
        this.logger.warn(`❌ Usuario no encontrado: ${userId}`);
        return {
          hasReferrer: false,
          referrerMembership: null,
          message: 'Usuario no encontrado',
        };
      }

      if (!user.referrerCode) {
        this.logger.log(
          `ℹ️ Usuario ${userId} no tiene código de referido padre`,
        );
        return {
          hasReferrer: false,
          referrerMembership: null,
          message: 'El usuario no tiene un referido padre',
        };
      }

      this.logger.log(
        `📋 Usuario encontrado. ReferrerCode: ${user.referrerCode}`,
      );

      // 2. Buscar al usuario padre mediante el referrerCode
      const referrerUser = await this.userModel
        .findOne({
          referralCode: user.referrerCode,
          isActive: true,
        })
        .select('_id personalInfo.firstName personalInfo.lastName email')
        .exec();

      if (!referrerUser) {
        this.logger.warn(
          `❌ Usuario referido padre no encontrado con código: ${user.referrerCode}`,
        );
        return {
          hasReferrer: false,
          referrerMembership: null,
          message: `Usuario referido padre no encontrado con código: ${user.referrerCode}`,
        };
      }

      const referrerId = (referrerUser._id as Types.ObjectId).toString();
      this.logger.log(`👤 Referido padre encontrado: ${referrerId}`);

      // 3. Consumir el servicio externo para obtener la membresía del padre
      const membershipResponse: MembershipResponse = await firstValueFrom(
        this.membershipClient.send(
          { cmd: 'membership.getUserMembershipByUserId' },
          { userId: referrerId },
        ),
      );

      this.logger.log(
        `📄 Respuesta del servicio de membresía: ${JSON.stringify(membershipResponse)}`,
      );

      // 4. Retornar la información de la membresía del padre
      const result: ReferrerMembershipResponse = {
        hasReferrer: true,
        referrerMembership: membershipResponse,
        message: membershipResponse.hasActiveMembership
          ? 'Membresía del referido padre obtenida exitosamente'
          : 'El referido padre no tiene membresía activa',
      };

      this.logger.log(
        `✅ Membresía del referido padre procesada para usuario: ${userId}`,
      );
      return result;
    } catch (error) {
      this.logger.error(
        `❌ Error obteniendo membresía del referido padre para usuario ${userId}:`,
        error,
      );

      // Si es un error del servicio de membresía, intentamos manejar la respuesta
      if (error.message && typeof error.message === 'string') {
        return {
          hasReferrer: false,
          referrerMembership: null,
          message: `Error al consultar membresía: ${error.message}`,
        };
      }

      return {
        hasReferrer: false,
        referrerMembership: null,
        message:
          'Error interno del servidor al obtener la membresía del referido padre',
      };
    }
  }

  /**
   * Obtiene todos los usuarios superiores en la jerarquía binaria con membresía activa
   * @param userId - ID del usuario base
   * @returns Array de usuarios superiores con membresía activa
   */
  async getActiveAncestorsWithMembership(userId: string): Promise<
    {
      userId: string;
      userName: string;
      userEmail: string;
      site: 'LEFT' | 'RIGHT';
    }[]
  > {
    try {
      this.logger.log(
        `🔍 Obteniendo ancestros con membresía activa para usuario: ${userId}`,
      );

      // Validar que el userId sea válido
      if (!Types.ObjectId.isValid(userId)) {
        this.logger.warn(`❌ ID de usuario inválido: ${userId}`);
        throw new RpcException({
          status: 400,
          message: 'ID de usuario inválido',
        });
      }

      // 1. Obtener todos los usuarios superiores en la jerarquía
      const ancestors = await this.treeService.getUserAncestors(userId);

      if (ancestors.length === 0) {
        this.logger.log(
          `ℹ️ Usuario ${userId} no tiene ancestros en la jerarquía`,
        );
        return [];
      }

      this.logger.log(
        `📋 Encontrados ${ancestors.length} ancestros para el usuario ${userId}`,
      );

      // 2. Preparar array de userIds para consultar membresías
      const userIds = ancestors.map((ancestor) => ({
        userId: ancestor.userId,
      }));

      // 3. Consultar el servicio de membresías para verificar cuáles tienen membresía activa
      this.logger.log(
        `📞 Consultando membresías activas para ${userIds.length} usuarios`,
      );

      const membershipResponse = await firstValueFrom(
        this.membershipClient.send(
          { cmd: 'membership.checkUserActiveMembership' },
          { users: userIds },
        ),
      );

      this.logger.log(
        `📄 Respuesta del servicio de membresías: ${JSON.stringify(membershipResponse)}`,
      );

      // 4. Filtrar solo los usuarios que tienen membresía activa
      const activeMembershipResults: Array<{
        userId: string;
        active: boolean;
      }> = membershipResponse?.results || [];

      const activeMembershipUserIds = new Set(
        activeMembershipResults
          .filter((result) => result.active)
          .map((result) => result.userId),
      );

      const activeAncestorsWithMembership = ancestors.filter((ancestor) =>
        activeMembershipUserIds.has(ancestor.userId),
      );

      this.logger.log(
        `✅ Encontrados ${activeAncestorsWithMembership.length} ancestros con membresía activa para usuario: ${userId}`,
      );

      return activeAncestorsWithMembership;
    } catch (error) {
      this.logger.error(
        `❌ Error obteniendo ancestros con membresía activa para usuario ${userId}:`,
        error,
      );

      if (error instanceof RpcException) {
        throw error;
      }

      throw new RpcException({
        status: 500,
        message:
          'Error interno del servidor al obtener ancestros con membresía activa',
      });
    }
  }

  async getUserWithdrawalInfo(userId: string) {
    try {
      this.logger.log(
        `🔍 Obteniendo información de retiro para usuario: ${userId}`,
      );

      if (!Types.ObjectId.isValid(userId)) {
        throw new RpcException({
          status: 400,
          message: 'ID de usuario inválido',
        });
      }

      const user = await this.userModel
        .findById(userId)
        .select('email personalInfo contactInfo billingInfo bankInfo')
        .exec();

      if (!user) {
        throw new RpcException({
          status: 404,
          message: 'Usuario no encontrado',
        });
      }

      const result = {
        userId: (user._id as Types.ObjectId).toString(),
        userName: user.personalInfo
          ? `${user.personalInfo.firstName} ${user.personalInfo.lastName}`.trim()
          : '',
        userEmail: user.email,
        documentType: user.personalInfo?.documentType || '',
        documentNumber: user.personalInfo?.documentNumber || '',
        ruc: user.billingInfo?.ruc || '',
        razonSocial: user.billingInfo?.razonSocial || '',
        address: user.billingInfo?.address || user.contactInfo?.address || '',
        bankName: user.bankInfo?.bankName || '',
        accountNumber: user.bankInfo?.accountNumber || '',
        cci: user.bankInfo?.cci || '',
        phone: user.contactInfo?.phone || '',
      };

      this.logger.log(
        `✅ Información de retiro obtenida para usuario: ${userId}`,
      );
      return result;
    } catch (error) {
      this.logger.error(
        `❌ Error obteniendo información de retiro para usuario ${userId}:`,
        error,
      );

      if (error instanceof RpcException) {
        throw error;
      }

      throw new RpcException({
        status: 500,
        message:
          'Error interno del servidor al obtener información del usuario',
      });
    }
  }

  async getUserWithPosition(userId: string): Promise<{
    id: string;
    email: string;
    firstName?: string;
    lastName?: string;
    position?: 'LEFT' | 'RIGHT';
  } | null> {
    try {
      if (!Types.ObjectId.isValid(userId)) {
        return null;
      }

      this.logger.log(`👤 Obteniendo usuario con posición: ${userId}`);

      const user = await this.userModel
        .findById(userId)
        .select('email personalInfo position')
        .exec();

      if (!user) {
        return null;
      }

      const result = {
        id: (user._id as Types.ObjectId).toString(),
        email: user.email,
        firstName: user.personalInfo?.firstName,
        lastName: user.personalInfo?.lastName,
        position: user.position,
      };

      this.logger.log(`✅ Usuario con posición obtenido: ${userId}`);
      return result;
    } catch (error) {
      this.logger.error(
        `❌ Error obteniendo usuario con posición ${userId}:`,
        error,
      );
      return null;
    }
  }
}
