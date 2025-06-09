import { Module } from '@nestjs/common';
import { DatabaseService } from './database.service';
import { DatabaseController } from './database.controller';
import { AuthModule } from '../auth/auth.module';

@Module({
  controllers: [DatabaseController],
  providers: [DatabaseService],
  imports:[ AuthModule ]
})
export class DatabaseModule {}
