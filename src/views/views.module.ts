import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { View, ViewSchema } from './schemas/views.schema';
import { ViewsController } from './views.controller';
import { ViewsService } from './views.service';

@Module({
  imports: [
    MongooseModule.forFeature([
      {
        name: View.name,
        schema: ViewSchema,
      },
    ]),
  ],
  controllers: [ViewsController],
  providers: [ViewsService],
  exports: [MongooseModule],
})
export class ViewsModule {}
