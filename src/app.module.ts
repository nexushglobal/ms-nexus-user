import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { envs } from './config/envs';
import { RolesModule } from './roles/roles.module';
import { UsersModule } from './users/users.module';
import { ViewsModule } from './views/views.module';

@Module({
  imports: [
    MongooseModule.forRoot(envs.MONGODB_URI, {
      maxPoolSize: 10,
      serverSelectionTimeoutMS: 5000,
      socketTimeoutMS: 45000,
      bufferCommands: false,
    }),
    UsersModule,
    ViewsModule,
    RolesModule,
  ],
})
export class AppModule {}
