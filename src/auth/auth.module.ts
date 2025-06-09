import { Module } from '@nestjs/common';
import { PassportModule } from '@nestjs/passport';
import { JwtModule } from '@nestjs/jwt';
import { JwtStrategy } from './jwt.strategy'; // o ajusta la ruta

@Module({
  imports: [
    PassportModule,
    JwtModule.register({
      secret: process.env.JWT_SECRET, // Cambia esto por una variable de entorno o un secreto seguro
      signOptions: { expiresIn: '15m' }, // Cambia esto según tus necesidades
    }),
  ],
  providers: [JwtStrategy],
  exports: [], // opcional, puedes exportar guards si los necesitas en otros módulos
})
export class AuthModule {}
