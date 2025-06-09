import { Module } from '@nestjs/common';
import { DatabaseModule } from './database/database.module';
import * as dotenv from 'dotenv';

dotenv.config();  // Cargar las variables de entorno desde el archivo .env

@Module({
  imports: [DatabaseModule],
  controllers: [],
  providers: [],
})
export class AppModule {}
