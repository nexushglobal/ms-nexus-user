import { Module } from '@nestjs/common';
import { UsersModule } from './users/users.module';
import { envs } from './config/envs';
import { ViewsModule } from './views/views.module';
import { RolesModule } from './roles/roles.module';

@Module({
  imports: [
    MongooseModule.forRoot(envs.MONGODB_URI, {
      // Opciones de conexión
      maxPoolSize: 10,
      serverSelectionTimeoutMS: 5000,
      socketTimeoutMS: 45000,
      bufferMaxEntries: 0,
      bufferCommands: false,
    }),
    UsersModule,
    ViewsModule,
    RolesModule,
  ],
})
export class AppModule {}
