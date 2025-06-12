import { Controller } from '@nestjs/common';
import { MessagePattern, Payload } from '@nestjs/microservices';
import { ViewsService } from './views.service';

@Controller()
export class ViewsController {
  constructor(private readonly viewsService: ViewsService) {}

  @MessagePattern({ cmd: 'user.view.getViewsByRoleId' })
  async getViewsByRoleId(@Payload() data: { roleId: string }) {
    const views = await this.viewsService.getViewsByRoleId(data.roleId);
    return {
      success: true,
      views,
    };
  }
}
