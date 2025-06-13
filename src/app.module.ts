import { Module } from '@nestjs/common';
import { UsersModule } from './users/users.module';
import { envs } from './config/envs';
import { ViewsModule } from './views/views.module';
import { RolesModule } from './roles/roles.module';
import { MongooseModule } from '@nestjs/mongoose';
import { MigrationModule } from './migration/migration.module';

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
    MigrationModule,
  ],
})
export class AppModule {}
