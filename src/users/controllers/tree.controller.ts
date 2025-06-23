import { Controller } from '@nestjs/common';
import { MessagePattern, Payload } from '@nestjs/microservices';
import { TreeService } from '../services/tree.service';
import {
  TreeQueryParams,
  TreeSearchParams,
} from '../interfaces/tree.interface';

@Controller()
export class TreeController {
  constructor(private readonly treeService: TreeService) {}

  @MessagePattern({ cmd: 'user.tree.getUserTree' })
  async getUserTree(@Payload() data: TreeQueryParams) {
    return await this.treeService.getUserTree(data);
  }

  @MessagePattern({ cmd: 'user.tree.searchUsers' })
  async searchUsersInTree(@Payload() data: TreeSearchParams) {
    console.log('data query:', data);

    return await this.treeService.searchUsersInTree(data);
  }
}
