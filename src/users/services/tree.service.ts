import { Injectable, Logger } from '@nestjs/common';
import { RpcException } from '@nestjs/microservices';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { User, UserDocument } from '../schemas/user.schema';
import {
  TreeNode,
  TreeResponse,
  TreeSearchResult,
  TreeSearchResponse,
  TreeQueryParams,
  TreeSearchParams,
} from '../interfaces/tree.interface';

// Interfaces para agregación
interface UserAggregationResult {
  _id: Types.ObjectId;
  email: string;
  referralCode: string;
  position?: 'LEFT' | 'RIGHT';
  isActive: boolean;
  personalInfo?: {
    firstName: string;
    lastName: string;
    documentNumber?: string;
  };
  parent?: Types.ObjectId;
  leftChild?: Types.ObjectId;
  rightChild?: Types.ObjectId;
  depth: number;
}

@Injectable()
export class TreeService {
  private readonly logger = new Logger(TreeService.name);

  constructor(@InjectModel(User.name) private userModel: Model<UserDocument>) {}

  async getUserTree(params: TreeQueryParams): Promise<TreeResponse> {
    const startTime = Date.now();

    try {
      const { userId, depth = 3, currentUserId } = params;

      // Determinar el ID del usuario a consultar
      const targetUserId = userId || currentUserId;

      // Validar parámetros
      if (!Types.ObjectId.isValid(targetUserId)) {
        throw new RpcException({
          status: 400,
          message: 'ID de usuario inválido',
        });
      }

      if (!Types.ObjectId.isValid(currentUserId)) {
        throw new RpcException({
          status: 400,
          message: 'ID de usuario logueado inválido',
        });
      }

      if (depth < 1 || depth > 5) {
        throw new RpcException({
          status: 400,
          message: 'La profundidad debe estar entre 1 y 5',
        });
      }

      // Verificar que el usuario objetivo existe
      const targetUser = await this.userModel.findById(targetUserId).exec();
      if (!targetUser) {
        throw new RpcException({
          status: 404,
          message: 'Usuario no encontrado',
        });
      }

      // Verificar permisos: el usuario objetivo debe estar en el árbol del usuario logueado
      if (targetUserId !== currentUserId) {
        const hasAccess = await this.verifyTreeAccess(
          currentUserId,
          targetUserId,
        );
        if (!hasAccess) {
          throw new RpcException({
            status: 403,
            message: 'No tienes permisos para acceder a este árbol de usuarios',
          });
        }
      }

      // Construir el árbol
      const tree = await this.buildTreeOptimized(targetUserId, depth);

      // Verificar si puede subir (tiene padre y no es el usuario logueado)
      const canGoUp = targetUserId !== currentUserId && !!targetUser.parent;
      const parentId = canGoUp ? targetUser.parent?.toString() : undefined;

      const queryDurationMs = Date.now() - startTime;

      return {
        tree,
        metadata: {
          queryDurationMs,
          requestedDepth: depth,
          rootUserId: targetUserId,
          currentUserId,
          canGoUp,
          parentId,
        },
      };
    } catch (error) {
      this.logger.error(`Error obteniendo árbol de usuario: ${error.message}`);

      if (error instanceof RpcException) {
        throw error;
      }

      throw new RpcException({
        status: 500,
        message: 'Error interno del servidor al obtener el árbol de usuarios',
      });
    }
  }

  async searchUsersInTree(
    params: TreeSearchParams,
  ): Promise<TreeSearchResponse> {
    const startTime = Date.now();

    try {
      const { search, page = 1, limit = 20, currentUserId } = params;

      this.logger.log(
        `🔍 Iniciando búsqueda: "${search}" para usuario: ${currentUserId}`,
      );

      if (!Types.ObjectId.isValid(currentUserId)) {
        throw new RpcException({
          status: 400,
          message: 'ID de usuario logueado inválido',
        });
      }

      if (!search || search.trim().length < 2) {
        throw new RpcException({
          status: 400,
          message: 'El término de búsqueda debe tener al menos 2 caracteres',
        });
      }

      // Obtener todos los descendientes del usuario logueado usando UserDocument
      const descendants = await this.getAllDescendantsForSearch(currentUserId);

      this.logger.log(
        `📊 Encontrados ${descendants.length} descendientes para buscar`,
      );

      if (descendants.length === 0) {
        return {
          results: [],
          metadata: {
            queryDurationMs: Date.now() - startTime,
            total: 0,
            page,
            limit,
            searchTerm: search,
            rootUserId: currentUserId,
          },
        };
      }

      // Filtrar por término de búsqueda
      const searchTerm = search.trim().toLowerCase();
      const filteredResults = descendants.filter((user) => {
        try {
          // Verificar que user y sus propiedades no sean null
          if (!user || !user._id) {
            this.logger.warn('⚠️ Usuario sin ID encontrado, saltando');
            return false;
          }

          const fullName = user.personalInfo
            ? `${user.personalInfo.firstName || ''} ${user.personalInfo.lastName || ''}`
                .toLowerCase()
                .trim()
            : '';
          const email = (user.email || '').toLowerCase();
          const documentNumber = (
            user.personalInfo?.documentNumber || ''
          ).toLowerCase();

          return (
            fullName.includes(searchTerm) ||
            email.includes(searchTerm) ||
            documentNumber.includes(searchTerm)
          );
        } catch (error) {
          this.logger.error(`❌ Error filtrando usuario:`, error);
          return false;
        }
      });

      this.logger.log(
        `🎯 ${filteredResults.length} usuarios coinciden con la búsqueda`,
      );

      // Paginación
      const offset = (page - 1) * limit;
      const paginatedResults = filteredResults.slice(offset, offset + limit);

      // Convertir a TreeSearchResult
      const results: TreeSearchResult[] = [];

      for (let i = 0; i < paginatedResults.length; i++) {
        const user = paginatedResults[i];
        try {
          // Verificar que el usuario tiene _id válido
          if (!user || !user._id) {
            this.logger.warn(`⚠️ Saltando usuario ${i} sin ID válido`);
            continue;
          }

          let userIdString: string;
          try {
            userIdString = (user._id as Types.ObjectId).toString();
            if (
              !userIdString ||
              userIdString === 'null' ||
              userIdString === 'undefined'
            ) {
              this.logger.warn(
                `⚠️ Saltando usuario ${i} con ID inválido: ${userIdString}`,
              );
              continue;
            }
          } catch (error) {
            this.logger.warn(
              `⚠️ Error convirtiendo _id a string para usuario ${i}: ${error.message}`,
            );
            continue;
          }

          this.logger.debug(
            `🔍 Procesando usuario ${i}: ${userIdString} (${user.email})`,
          );

          const result: TreeSearchResult = {
            id: userIdString,
            email: user.email || '',
            referralCode: user.referralCode || '',
            fullName: user.personalInfo
              ? `${user.personalInfo.firstName || ''} ${user.personalInfo.lastName || ''}`.trim()
              : 'Sin nombre',
            documentNumber: user.personalInfo?.documentNumber || undefined,
            position: user.position || null,
            isActive: user.isActive || false,
          };

          results.push(result);
          this.logger.debug(`✅ Usuario ${i} procesado correctamente`);
        } catch (error) {
          this.logger.error(`❌ Error procesando usuario ${i}:`, {
            error: error.message,
            stack: error.stack,
            userId: user?._id?.toString(),
            email: user?.email,
          });
          // Continúa con el siguiente usuario
        }
      }

      const queryDurationMs = Date.now() - startTime;

      this.logger.log(
        `✅ Búsqueda completada: ${results.length} resultados en ${queryDurationMs}ms`,
      );

      return {
        results,
        metadata: {
          queryDurationMs,
          total: filteredResults.length,
          page,
          limit,
          searchTerm: search,
          rootUserId: currentUserId,
        },
      };
    } catch (error) {
      this.logger.error(
        `❌ Error buscando usuarios en árbol: ${error.message}`,
        error.stack,
      );

      if (error instanceof RpcException) {
        throw error;
      }

      throw new RpcException({
        status: 500,
        message: 'Error interno del servidor al buscar usuarios',
      });
    }
  }

  // ========== MÉTODOS PRIVADOS ==========

  private async getAllDescendantsForSearch(
    rootUserId: string,
  ): Promise<UserDocument[]> {
    try {
      this.logger.log(
        `📋 Obteniendo descendientes para usuario: ${rootUserId}`,
      );

      const pipeline = [
        {
          $match: {
            _id: new Types.ObjectId(rootUserId),
          },
        },
        {
          $graphLookup: {
            from: 'users',
            startWith: '$_id',
            connectFromField: '_id',
            connectToField: 'parent',
            as: 'descendants',
            // Sin maxDepth - busca en todo el árbol descendiente
          },
        },
        {
          $project: {
            descendants: 1,
          },
        },
        {
          $unwind: {
            path: '$descendants',
            preserveNullAndEmptyArrays: false, // Solo incluir si hay descendientes
          },
        },
        {
          $replaceRoot: {
            newRoot: '$descendants',
          },
        },
        {
          $match: {
            _id: { $ne: null }, // Excluir documentos sin _id
            isActive: true, // Solo usuarios activos
          },
        },
        {
          $project: {
            _id: 1,
            email: 1,
            referralCode: 1,
            position: 1,
            isActive: 1,
            personalInfo: 1,
          },
        },
      ];

      const result = await this.userModel
        .aggregate<UserDocument>(pipeline)
        .exec();

      this.logger.log(`📊 Encontrados ${result.length} descendientes válidos`);

      // Filtrar cualquier resultado null o sin _id
      const validResults = result.filter((user) => user && user._id);

      this.logger.log(
        `✅ ${validResults.length} descendientes después de filtrar`,
      );

      return validResults;
    } catch (error) {
      this.logger.error(`❌ Error obteniendo descendientes:`, error);
      return [];
    }
  }

  private async verifyTreeAccess(
    currentUserId: string,
    targetUserId: string,
  ): Promise<boolean> {
    try {
      // El usuario objetivo debe ser descendiente del usuario logueado
      const isDescendant = await this.isUserDescendant(
        currentUserId,
        targetUserId,
      );
      return isDescendant;
    } catch (error) {
      this.logger.error(`Error verificando acceso al árbol: ${error.message}`);
      return false;
    }
  }

  private async isUserDescendant(
    ancestorId: string,
    descendantId: string,
  ): Promise<boolean> {
    const pipeline = [
      {
        $match: {
          _id: new Types.ObjectId(ancestorId),
        },
      },
      {
        $graphLookup: {
          from: 'users',
          startWith: '$_id',
          connectFromField: '_id',
          connectToField: 'parent',
          as: 'descendants',
          // Sin maxDepth - permite buscar en todo el árbol
        },
      },
      {
        $project: {
          isDescendant: {
            $in: [new Types.ObjectId(descendantId), '$descendants._id'],
          },
        },
      },
    ];

    const result = await this.userModel.aggregate(pipeline).exec();
    return result.length > 0 && result[0].isDescendant;
  }

  private async buildTreeOptimized(
    rootUserId: string,
    maxDepth: number,
  ): Promise<TreeNode> {
    const allUsers = await this.getAllDescendants(rootUserId, maxDepth);
    const userMap = new Map<string, UserAggregationResult>();

    allUsers.forEach((user) => {
      userMap.set(user._id.toString(), user);
    });

    return this.buildNodeRecursive(rootUserId, userMap, 0, maxDepth);
  }

  private async getAllDescendants(
    rootUserId: string,
    maxDepth?: number,
  ): Promise<UserAggregationResult[]> {
    const matchStage = { _id: new Types.ObjectId(rootUserId) };
    const graphLookupStage: any = {
      from: 'users',
      startWith: '$_id',
      connectFromField: '_id',
      connectToField: 'parent',
      as: 'descendants',
      depthField: 'depth',
    };

    if (maxDepth) {
      graphLookupStage.maxDepth = maxDepth - 1;
    }

    const pipeline: any[] = [
      { $match: matchStage },
      { $graphLookup: graphLookupStage },
      {
        $project: {
          allUsers: {
            $concatArrays: [
              [
                {
                  _id: '$_id',
                  email: '$email',
                  referralCode: '$referralCode',
                  position: '$position',
                  isActive: '$isActive',
                  personalInfo: '$personalInfo',
                  parent: '$parent',
                  leftChild: '$leftChild',
                  rightChild: '$rightChild',
                  depth: 0,
                },
              ],
              '$descendants',
            ],
          },
        },
      },
      { $unwind: '$allUsers' },
      { $replaceRoot: { newRoot: '$allUsers' } },
    ];

    if (maxDepth) {
      pipeline.push({
        $match: {
          depth: { $lte: maxDepth - 1 },
        },
      });
    }

    const result = await this.userModel
      .aggregate<UserAggregationResult>(pipeline)
      .exec();
    return result;
  }

  private buildNodeRecursive(
    userId: string,
    userMap: Map<string, UserAggregationResult>,
    currentDepth: number,
    maxDepth: number,
  ): TreeNode {
    const user = userMap.get(userId);
    if (!user) {
      throw new Error(`Usuario ${userId} no encontrado en el mapa`);
    }

    const node: TreeNode = {
      id: user._id.toString(),
      email: user.email,
      referralCode: user.referralCode,
      position: user.position || null,
      isActive: user.isActive,
      fullName: user.personalInfo
        ? `${user.personalInfo.firstName} ${user.personalInfo.lastName}`
        : 'Sin nombre',
      depth: currentDepth,
    };

    if (currentDepth < maxDepth) {
      const children: { left?: TreeNode; right?: TreeNode } = {};

      if (user.leftChild) {
        const leftChildId = user.leftChild.toString();
        if (userMap.has(leftChildId)) {
          children.left = this.buildNodeRecursive(
            leftChildId,
            userMap,
            currentDepth + 1,
            maxDepth,
          );
        }
      }

      if (user.rightChild) {
        const rightChildId = user.rightChild.toString();
        if (userMap.has(rightChildId)) {
          children.right = this.buildNodeRecursive(
            rightChildId,
            userMap,
            currentDepth + 1,
            maxDepth,
          );
        }
      }

      if (children.left || children.right) {
        node.children = children;
      }
    }

    return node;
  }

  private async getPathFromRoot(
    rootUserId: string,
    targetUserId: string,
  ): Promise<string[]> {
    const pipeline = [
      {
        $match: {
          _id: new Types.ObjectId(targetUserId),
        },
      },
      {
        $graphLookup: {
          from: 'users',
          startWith: '$parent',
          connectFromField: 'parent',
          connectToField: '_id',
          as: 'ancestors',
          maxDepth: 10,
        },
      },
      {
        $project: {
          path: {
            $reverseArray: {
              $map: {
                input: '$ancestors',
                as: 'ancestor',
                in: '$ancestor._id',
              },
            },
          },
        },
      },
    ];

    interface PathResult {
      path: Types.ObjectId[];
    }

    const result = await this.userModel.aggregate<PathResult>(pipeline).exec();

    if (result.length === 0) return [];

    const path = result[0].path || [];
    const rootIndex = path.findIndex(
      (id: Types.ObjectId) => id.toString() === rootUserId,
    );

    if (rootIndex === -1) return [];

    return path.slice(rootIndex).map((id: Types.ObjectId) => id.toString());
  }
}
