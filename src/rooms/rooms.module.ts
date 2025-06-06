import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { RoomsService } from './providers/rooms.service';
import { Room } from './room.entity';
import { RoomsController } from './rooms.controller';
import { UsersModule } from 'src/users/users.module';

@Module({
  providers: [RoomsService],
  imports: [TypeOrmModule.forFeature([Room]), UsersModule],
  controllers: [RoomsController],
})
export class RoomsModule {}
