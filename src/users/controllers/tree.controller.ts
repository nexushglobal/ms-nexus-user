import { Controller } from '@nestjs/common';
import { MessagePattern, Payload } from '@nestjs/microservices';
import {
  TreeQueryParams,
  TreeSearchParams,
} from '../interfaces/tree.interface';
import { TreeService } from '../services/tree.service';

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

  @MessagePattern({ cmd: 'user.tree.checkMinDepthLevels' })
  async checkMinDepthLevels(
    @Payload() data: { userId: string; minDepthLevels: number },
  ) {
    return await this.treeService.checkMinDepthLevels(
      data.userId,
      data.minDepthLevels,
    );
  }

  @MessagePattern({ cmd: 'user.tree.getDirectReferrals' })
  async getDirectReferrals(@Payload() data: { userId: string }) {
    return await this.treeService.getDirectReferrals(data.userId);
  }
}
