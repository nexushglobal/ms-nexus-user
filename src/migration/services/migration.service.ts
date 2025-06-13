import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Role, RoleDocument } from '../../roles/schemas/roles.schema';
import { View, ViewDocument } from '../../views/schemas/views.schema';
import {
  MigrationResult,
  RoleMigrationData,
  RoleViewRelation,
  ViewMigrationData,
} from '../interfaces/roles-view.interfaces';

@Injectable()
export class MigrationService {
  private readonly logger = new Logger(MigrationService.name);

  private roleIdMap = new Map<number, string>();
  private viewIdMap = new Map<number, string>();

  constructor(
    @InjectModel(Role.name) private roleModel: Model<RoleDocument>,
    @InjectModel(View.name) private viewModel: Model<ViewDocument>,
  ) {}

  async migrateFromJsonFiles(
    rolesJson: RoleMigrationData[],
    viewsJson: ViewMigrationData[],
    relationsJson: RoleViewRelation[],
  ): Promise<MigrationResult> {
    this.logger.log('🚀 Iniciando migración de datos...');

    const result: MigrationResult = {
      success: true,
      message: '',
      details: {
        roles: { total: 0, created: 0, skipped: 0, errors: [] },
        views: { total: 0, created: 0, skipped: 0, errors: [] },
        relations: { total: 0, created: 0, skipped: 0, errors: [] },
      },
    };

    try {
      // Limpiar mapeos anteriores
      this.roleIdMap.clear();
      this.viewIdMap.clear();

      // Paso 1: Migrar roles
      this.logger.log('📋 Migrando roles...');
      await this.migrateRoles(rolesJson, result.details.roles);

      // Paso 2: Migrar vistas
      this.logger.log('👁️ Migrando vistas...');
      await this.migrateViews(viewsJson, result.details.views);

      // Paso 3: Establecer relaciones
      this.logger.log('🔗 Estableciendo relaciones roles-vistas...');
      await this.migrateRoleViewRelations(
        relationsJson,
        result.details.relations,
      );

      result.message = 'Migración completada exitosamente';
      this.logger.log('✅ Migración completada exitosamente');
    } catch (error) {
      result.success = false;
      result.message = `Error durante la migración: ${error.message}`;
      this.logger.error('❌ Error durante la migración:', error);
    }

    return result;
  }

  private async migrateRoles(
    rolesData: RoleMigrationData[],
    details: any,
  ): Promise<void> {
    details.total = rolesData.length;

    for (const roleData of rolesData) {
      try {
        // Verificar si el rol ya existe
        const existingRole = await this.roleModel
          .findOne({
            code: roleData.code.toUpperCase(),
          })
          .exec();

        if (existingRole) {
          this.logger.warn(`⚠️ Rol ${roleData.code} ya existe, saltando...`);
          this.roleIdMap.set(
            roleData.id,
            (existingRole._id as Types.ObjectId).toString(),
          );
          details.skipped++;
          continue;
        }

        // Crear nuevo rol
        const newRole = new this.roleModel({
          code: roleData.code.toUpperCase(),
          name: roleData.name,
          isActive: roleData.isActive,
          views: [], // Se asignarán en el paso de relaciones
        });

        const savedRole = await newRole.save();
        this.roleIdMap.set(
          roleData.id,
          (savedRole._id as Types.ObjectId).toString(),
        );
        details.created++;

        this.logger.log(
          `✅ Rol creado: ${roleData.code} -> ${(savedRole._id as Types.ObjectId).toString()}`,
        );
      } catch (error) {
        const errorMsg = `Error creando rol ${roleData.code}: ${error.message}`;
        details.errors.push(errorMsg);
        this.logger.error(`❌ ${errorMsg}`);
      }
    }
  }

  private async migrateViews(
    viewsData: ViewMigrationData[],
    details: any,
  ): Promise<void> {
    details.total = viewsData.length;

    // Ordenar vistas: primero las padres (parentId null), luego las hijas
    const parentViews = viewsData.filter((v) => !v.parentId);
    const childViews = viewsData.filter((v) => v.parentId);

    // Migrar vistas padre primero
    for (const viewData of parentViews) {
      await this.createView(viewData, details);
    }

    // Migrar vistas hijas después
    for (const viewData of childViews) {
      await this.createView(viewData, details);
    }
  }

  private async createView(
    viewData: ViewMigrationData,
    details: any,
  ): Promise<void> {
    try {
      // Verificar si la vista ya existe
      const existingView = await this.viewModel
        .findOne({
          code: viewData.code.toUpperCase(),
        })
        .exec();

      if (existingView) {
        this.logger.warn(`⚠️ Vista ${viewData.code} ya existe, saltando...`);
        this.viewIdMap.set(
          viewData.id,
          (existingView._id as Types.ObjectId).toString(),
        );
        details.skipped++;
        return;
      }

      // Determinar el parent si existe
      let parentObjectId: Types.ObjectId | null = null;
      if (viewData.parentId) {
        const parentId = this.viewIdMap.get(viewData.parentId);
        if (parentId) {
          parentObjectId = new Types.ObjectId(parentId);
        } else {
          throw new Error(
            `Parent view con ID ${viewData.parentId} no encontrado`,
          );
        }
      }

      // Crear nueva vista
      const newView = new this.viewModel({
        code: viewData.code.toUpperCase(),
        name: viewData.name,
        icon: viewData.icon || undefined,
        url: viewData.url || undefined,
        isActive: viewData.isActive,
        order: viewData.order,
        metadata: viewData.metadata || {},
        parent: parentObjectId,
        children: [],
        roles: [], // Se asignarán en el paso de relaciones
      });

      const savedView = await newView.save();
      this.viewIdMap.set(
        viewData.id,
        (savedView._id as Types.ObjectId).toString(),
      );

      // Si es una vista hija, actualizar el parent para incluirla en children
      if (parentObjectId) {
        await this.viewModel
          .findByIdAndUpdate(parentObjectId, {
            $addToSet: { children: savedView._id },
          })
          .exec();
      }

      details.created++;
      this.logger.log(
        `✅ Vista creada: ${viewData.code} -> ${(savedView._id as Types.ObjectId).toString()}`,
      );
    } catch (error) {
      const errorMsg = `Error creando vista ${viewData.code}: ${error.message}`;
      details.errors.push(errorMsg);
      this.logger.error(`❌ ${errorMsg}`);
    }
  }

  private async migrateRoleViewRelations(
    relationsData: RoleViewRelation[],
    details: any,
  ): Promise<void> {
    details.total = relationsData.length;

    for (const relation of relationsData) {
      try {
        const roleObjectId = this.roleIdMap.get(relation.role_id);
        const viewObjectId = this.viewIdMap.get(relation.view_id);

        if (!roleObjectId) {
          throw new Error(
            `Rol con ID ${relation.role_id} no encontrado en el mapeo`,
          );
        }

        if (!viewObjectId) {
          throw new Error(
            `Vista con ID ${relation.view_id} no encontrado en el mapeo`,
          );
        }

        // Actualizar rol para incluir la vista
        await this.roleModel
          .findByIdAndUpdate(roleObjectId, {
            $addToSet: { views: new Types.ObjectId(viewObjectId) },
          })
          .exec();

        // Actualizar vista para incluir el rol
        await this.viewModel
          .findByIdAndUpdate(viewObjectId, {
            $addToSet: { roles: new Types.ObjectId(roleObjectId) },
          })
          .exec();

        details.created++;
        this.logger.log(
          `✅ Relación creada: Rol ${relation.role_id} <-> Vista ${relation.view_id}`,
        );
      } catch (error) {
        const errorMsg = `Error creando relación rol ${relation.role_id} <-> vista ${relation.view_id}: ${error.message}`;
        details.errors.push(errorMsg);
        this.logger.error(`❌ ${errorMsg}`);
      }
    }
  }

  validateJsonData(
    rolesJson: any[],
    viewsJson: any[],
    relationsJson: any[],
  ): { valid: boolean; errors: string[] } {
    const errors: string[] = [];

    // Validar estructura de roles
    if (!Array.isArray(rolesJson)) {
      errors.push('Los datos de roles deben ser un array');
    } else {
      rolesJson.forEach((role, index) => {
        if (!role.id || !role.code || !role.name) {
          errors.push(
            `Rol en índice ${index} falta campos requeridos (id, code, name)`,
          );
        }
      });
    }

    // Validar estructura de vistas
    if (!Array.isArray(viewsJson)) {
      errors.push('Los datos de vistas deben ser un array');
    } else {
      viewsJson.forEach((view, index) => {
        if (!view.id || !view.code || !view.name) {
          errors.push(
            `Vista en índice ${index} falta campos requeridos (id, code, name)`,
          );
        }
      });
    }

    // Validar estructura de relaciones
    if (!Array.isArray(relationsJson)) {
      errors.push('Los datos de relaciones deben ser un array');
    } else {
      relationsJson.forEach((relation, index) => {
        if (!relation.view_id || !relation.role_id) {
          errors.push(
            `Relación en índice ${index} falta campos requeridos (view_id, role_id)`,
          );
        }
      });
    }

    return {
      valid: errors.length === 0,
      errors,
    };
  }
}
