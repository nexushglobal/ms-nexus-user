import { Injectable, Logger } from '@nestjs/common';
import { RpcException } from '@nestjs/microservices';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { User, UserDocument } from '../schemas/user.schema';
import { TreeNode, TreeResponse } from '../interfaces/tree.interface';

@Injectable()
export class TreeService {
  private readonly logger = new Logger(TreeService.name);

  constructor(@InjectModel(User.name) private userModel: Model<UserDocument>) {}

  async getUserTree(userId: string, depth: number = 3): Promise<TreeResponse> {
    const startTime = Date.now();

    try {
      // Validar parámetros
      if (!Types.ObjectId.isValid(userId)) {
        throw new RpcException({
          status: 400,
          message: 'ID de usuario inválido',
        });
      }

      if (depth < 1 || depth > 5) {
        throw new RpcException({
          status: 400,
          message: 'La profundidad debe estar entre 1 y 5',
        });
      }

      // Verificar que el usuario raíz existe
      const rootUser = await this.userModel.findById(userId).exec();
      if (!rootUser) {
        throw new RpcException({
          status: 404,
          message: 'Usuario no encontrado',
        });
      }

      // Construir el árbol de forma optimizada
      const tree = await this.buildTreeOptimized(userId, depth);

      const queryDurationMs = Date.now() - startTime;

      return {
        tree,
        metadata: {
          queryDurationMs,
          requestedDepth: depth,
          rootUserId: userId,
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

  private async buildTreeOptimized(
    rootUserId: string,
    maxDepth: number,
  ): Promise<TreeNode> {
    // Obtener todos los usuarios descendientes hasta la profundidad máxima en una sola consulta
    const allUsers = await this.getAllDescendants(rootUserId, maxDepth);

    // Crear un mapa para acceso rápido por ID
    const userMap = new Map<string, UserDocument>();
    allUsers.forEach((user) => {
      userMap.set((user._id as Types.ObjectId).toString(), user);
    });

    // Construir el árbol recursivamente
    return this.buildNodeRecursive(rootUserId, userMap, 0, maxDepth);
  }

  private async getAllDescendants(
    rootUserId: string,
    maxDepth: number,
  ): Promise<UserDocument[]> {
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
          maxDepth: maxDepth - 1, // maxDepth en $graphLookup es 0-based
          depthField: 'depth',
        },
      },
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
      {
        $unwind: '$allUsers',
      },
      {
        $replaceRoot: {
          newRoot: '$allUsers',
        },
      },
      {
        $match: {
          depth: { $lte: maxDepth - 1 },
        },
      },
    ];

    const result = await this.userModel.aggregate(pipeline).exec();
    return result;
  }

  private buildNodeRecursive(
    userId: string,
    userMap: Map<string, UserDocument>,
    currentDepth: number,
    maxDepth: number,
  ): TreeNode {
    const user = userMap.get(userId);
    if (!user) {
      throw new Error(`Usuario ${userId} no encontrado en el mapa`);
    }

    const node: TreeNode = {
      id: (user._id as Types.ObjectId).toString(),
      email: user.email,
      referralCode: user.referralCode,
      position: user.position || null,
      isActive: user.isActive,
      fullName: user.personalInfo
        ? `${user.personalInfo.firstName} ${user.personalInfo.lastName}`
        : 'Sin nombre',
      depth: currentDepth,
    };

    // Si no hemos alcanzado la profundidad máxima, buscar hijos
    if (currentDepth < maxDepth) {
      const children: { left?: TreeNode; right?: TreeNode } = {};

      // Buscar hijo izquierdo
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

      // Buscar hijo derecho
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

      // Solo agregar children si tiene al menos un hijo
      if (children.left || children.right) {
        node.children = children;
      }
    }

    return node;
  }

  // Método alternativo más simple pero menos eficiente para árboles pequeños
  private async buildTreeSimple(
    userId: string,
    currentDepth: number = 0,
    maxDepth: number = 3,
  ): Promise<TreeNode> {
    const user = await this.userModel
      .findById(userId)
      .populate('leftChild rightChild')
      .exec();

    if (!user) {
      throw new RpcException({
        status: 404,
        message: `Usuario ${userId} no encontrado`,
      });
    }

    const node: TreeNode = {
      id: (user._id as Types.ObjectId).toString(),
      email: user.email,
      referralCode: user.referralCode,
      position: user.position || null,
      isActive: user.isActive,
      fullName: user.personalInfo
        ? `${user.personalInfo.firstName} ${user.personalInfo.lastName}`
        : 'Sin nombre',
      depth: currentDepth,
    };

    // Si no hemos alcanzado la profundidad máxima, buscar hijos recursivamente
    if (currentDepth < maxDepth) {
      const children: { left?: TreeNode; right?: TreeNode } = {};

      if (user.leftChild) {
        children.left = await this.buildTreeSimple(
          user.leftChild.toString(),
          currentDepth + 1,
          maxDepth,
        );
      }

      if (user.rightChild) {
        children.right = await this.buildTreeSimple(
          user.rightChild.toString(),
          currentDepth + 1,
          maxDepth,
        );
      }

      if (children.left || children.right) {
        node.children = children;
      }
    }

    return node;
  }
}
