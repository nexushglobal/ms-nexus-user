import { Controller } from '@nestjs/common';
import { ViewsService } from './views.service';

@Controller()
export class ViewsController {
  constructor(private readonly viewsService: ViewsService) {}
}
