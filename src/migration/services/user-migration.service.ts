import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Role, RoleDocument } from '../../roles/schemas/roles.schema';
import {
  DocumentType,
  Gender,
  Position,
  User,
  UserDocument,
} from '../../users/schemas/user.schema';
import {
  UserMigrationData,
  UserMigrationResult,
} from '../interfaces/user-migration.interfaces';

@Injectable()
export class UserMigrationService {
  private readonly logger = new Logger(UserMigrationService.name);

  // Mapeo de UUIDs antiguos a ObjectIds nuevos
  private userIdMap = new Map<string, string>();
  private roleCodeMap = new Map<string, string>();

  constructor(
    @InjectModel(User.name) private userModel: Model<UserDocument>,
    @InjectModel(Role.name) private roleModel: Model<RoleDocument>,
  ) {}

  async migrateUsers(
    usersData: UserMigrationData[],
  ): Promise<UserMigrationResult> {
    this.logger.log('🚀 Iniciando migración de usuarios...');

    const result: UserMigrationResult = {
      success: true,
      message: '',
      details: {
        users: { total: 0, created: 0, skipped: 0, errors: [] },
        relationships: { total: 0, created: 0, skipped: 0, errors: [] },
      },
    };

    try {
      // Limpiar mapeos anteriores
      this.userIdMap.clear();
      this.roleCodeMap.clear();

      // Cargar mapeo de roles existentes
      await this.loadRoleMapping();

      // Paso 1: Crear usuarios sin relaciones padre-hijo
      this.logger.log('👤 Creando usuarios...');
      await this.createUsers(usersData, result.details.users);

      // Paso 2: Establecer relaciones padre-hijo
      this.logger.log('👪 Estableciendo relaciones familiares...');
      await this.establishFamilyRelationships(
        usersData,
        result.details.relationships,
      );

      result.message = 'Migración de usuarios completada exitosamente';
      this.logger.log('✅ Migración de usuarios completada exitosamente');
    } catch (error) {
      result.success = false;
      result.message = `Error durante la migración de usuarios: ${error.message}`;
      this.logger.error('❌ Error durante la migración de usuarios:', error);
      // Re-lanzar el error para que el controlador lo maneje
      throw error;
    }

    return result;
  }

  private async loadRoleMapping(): Promise<void> {
    this.logger.log('📋 Cargando mapeo de roles...');

    const roles = await this.roleModel.find({ isActive: true }).exec();

    for (const role of roles) {
      this.roleCodeMap.set(role.code, (role._id as Types.ObjectId).toString());
    }

    this.logger.log(`✅ Cargados ${roles.length} roles`);
  }

  private async createUsers(
    usersData: UserMigrationData[],
    details: any,
  ): Promise<void> {
    details.total = usersData.length;

    for (const userData of usersData) {
      try {
        // Verificar si el usuario ya existe por email (limpiar espacios)
        const existingUser = await this.userModel
          .findOne({ email: userData.email.toLowerCase().trim() })
          .exec();

        if (existingUser) {
          this.logger.warn(
            `⚠️ Usuario ${userData.email} ya existe, saltando...`,
          );
          this.userIdMap.set(
            userData.user_id,
            (existingUser._id as Types.ObjectId).toString(),
          );
          details.skipped++;
          continue;
        }

        // Verificar que el rol exista
        const roleObjectId = this.roleCodeMap.get(
          userData.role_code.trim().toUpperCase(),
        );
        if (!roleObjectId) {
          throw new Error(`Rol ${userData.role_code.trim()} no encontrado`);
        }

        // Generar número de documento si no existe
        const documentNumber =
          userData.documentNumber?.trim() ||
          this.generateDefaultDocumentNumber();

        // Crear nuevo usuario
        const newUser = new this.userModel({
          email: userData.email.toLowerCase().trim(), // Limpiar espacios del email
          password: userData.password, // Ya viene hasheado
          referralCode: userData.referralCode.trim().toUpperCase(),
          referrerCode: userData.referrerCode?.trim().toUpperCase(),
          position: userData.position?.trim().toUpperCase() as Position,
          isActive: userData.isActive,
          lastLoginAt: userData.lastLoginAt
            ? new Date(userData.lastLoginAt)
            : undefined,
          role: new Types.ObjectId(roleObjectId),
          nickname: userData.nickname?.trim(),
          photo: userData.photo?.trim(),
          personalInfo: {
            firstName: userData.firstName.trim(),
            lastName: userData.lastName.trim(),
            documentType: DocumentType.DNI, // Por defecto DNI como solicitas
            documentNumber: documentNumber,
            gender: this.mapGender(userData.gender.trim()),
            birthdate: new Date(userData.birthDate),
          },
          contactInfo: {
            phone: userData.phone.trim(),
            address: userData.contact_address?.trim(),
            postalCode: userData.postalCode?.trim(),
            country: 'Peru', // Por defecto Peru como solicitas
          },
          billingInfo: userData.billing_info_id
            ? {
                address: userData.billing_address?.trim(),
              }
            : undefined,
          bankInfo: userData.bank_info_id
            ? {
                bankName: userData.bankName?.trim(),
                accountNumber: userData.accountNumber?.trim(),
                cci: userData.cci?.trim(),
              }
            : undefined,
        });

        // Establecer fechas de creación y actualización
        newUser.createdAt = new Date(userData.user_created_at);
        newUser.updatedAt = new Date(userData.user_updated_at);

        const savedUser = await newUser.save();
        this.userIdMap.set(
          userData.user_id,
          (savedUser._id as Types.ObjectId).toString(),
        );
        details.created++;

        this.logger.log(
          `✅ Usuario creado: ${userData.email} -> ${(savedUser._id as Types.ObjectId).toString()}`,
        );
      } catch (error) {
        const errorMsg = `Error creando usuario ${userData.email}: ${error.message}`;
        details.errors.push(errorMsg);
        this.logger.error(`❌ ${errorMsg}`);
      }
    }
  }

  private async establishFamilyRelationships(
    usersData: UserMigrationData[],
    details: any,
  ): Promise<void> {
    const relationshipsToProcess = usersData.filter((user) => user.parent_id);
    details.total = relationshipsToProcess.length;

    for (const userData of relationshipsToProcess) {
      try {
        const userObjectId = this.userIdMap.get(userData.user_id);
        const parentObjectId = this.userIdMap.get(userData.parent_id!);

        if (!userObjectId) {
          throw new Error(
            `Usuario hijo ${userData.user_id} no encontrado en el mapeo`,
          );
        }

        if (!parentObjectId) {
          throw new Error(
            `Usuario padre ${userData.parent_id} no encontrado en el mapeo`,
          );
        }

        // Actualizar el usuario hijo con el parent
        await this.userModel
          .findByIdAndUpdate(userObjectId, {
            parent: new Types.ObjectId(parentObjectId),
          })
          .exec();

        // Actualizar el usuario padre con el hijo correspondiente
        const updateField =
          userData.position === Position.LEFT ? 'leftChild' : 'rightChild';
        await this.userModel
          .findByIdAndUpdate(parentObjectId, {
            [updateField]: new Types.ObjectId(userObjectId),
          })
          .exec();

        details.created++;
        this.logger.log(
          `✅ Relación establecida: Usuario ${userData.user_id} -> Padre ${userData.parent_id} (${userData.position})`,
        );
      } catch (error) {
        const errorMsg = `Error estableciendo relación para usuario ${userData.user_id}: ${error.message}`;
        details.errors.push(errorMsg);
        this.logger.error(`❌ ${errorMsg}`);
      }
    }
  }

  private generateDefaultDocumentNumber(): string {
    // Generar un número de documento por defecto (8 dígitos para DNI)
    return Math.floor(10000000 + Math.random() * 90000000).toString();
  }

  private mapGender(gender: string): Gender {
    switch (gender.toUpperCase()) {
      case 'MASCULINO':
        return Gender.MASCULINO;
      case 'FEMENINO':
        return Gender.FEMENINO;
      default:
        return Gender.OTRO;
    }
  }

  validateUserData(usersData: any[]): { valid: boolean; errors: string[] } {
    const errors: string[] = [];

    if (!Array.isArray(usersData)) {
      errors.push('Los datos de usuarios deben ser un array');
      return { valid: false, errors };
    }

    usersData.forEach((user, index) => {
      // Validar campos requeridos
      const requiredFields = [
        'user_id',
        'email',
        'password',
        'referralCode',
        'firstName',
        'lastName',
        'gender',
        'birthDate',
        'phone',
        'role_code',
      ];

      for (const field of requiredFields) {
        if (
          !user[field] ||
          (typeof user[field] === 'string' && !user[field].trim())
        ) {
          errors.push(
            `Usuario en índice ${index} falta el campo requerido: ${field}`,
          );
        }
      }

      // Validar formato de email (limpiar espacios antes de validar)
      if (user.email) {
        const cleanEmail = user.email.trim();
        if (!this.isValidEmail(String(cleanEmail))) {
          errors.push(
            `Usuario en índice ${index} tiene un email inválido: ${cleanEmail}`,
          );
        }
      }

      // Validar género (limpiar espacios)
      if (user.gender) {
        const cleanGender = user.gender.trim().toUpperCase();
        if (!['MASCULINO', 'FEMENINO', 'OTRO'].includes(String(cleanGender))) {
          errors.push(
            `Usuario en índice ${index} tiene un género inválido: ${user.gender}`,
          );
        }
      }

      // Validar posición si existe (limpiar espacios)
      if (user.position) {
        const cleanPosition = user.position.trim().toUpperCase();
        if (!['LEFT', 'RIGHT'].includes(String(cleanPosition))) {
          errors.push(
            `Usuario en índice ${index} tiene una posición inválida: ${user.position}`,
          );
        }
      }

      // Validar fecha de nacimiento
      if (
        typeof user.birthDate === 'string' &&
        user.birthDate &&
        isNaN(Date.parse(user.birthDate as string))
      ) {
        errors.push(
          `Usuario en índice ${index} tiene una fecha de nacimiento inválida: ${user.birthDate}`,
        );
      }
    });

    return {
      valid: errors.length === 0,
      errors,
    };
  }

  private isValidEmail(email: string): boolean {
    const emailRegex = /^\w+([.-]?\w+)*@\w+([.-]?\w+)*(\.\w{2,3})+$/;
    return emailRegex.test(email);
  }
}
