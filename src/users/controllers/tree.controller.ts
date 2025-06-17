import { Controller } from '@nestjs/common';
import { MessagePattern, Payload } from '@nestjs/microservices';
import { TreeService } from '../services/tree.service';

@Controller()
export class TreeController {
  constructor(private readonly treeService: TreeService) {}

  @MessagePattern({ cmd: 'user.tree.getUserTree' })
  async getUserTree(@Payload() data: { userId: string; depth?: number }) {
    const { userId, depth = 3 } = data;
    return await this.treeService.getUserTree(userId, depth);
  }
}
