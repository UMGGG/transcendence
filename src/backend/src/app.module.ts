import { Module } from '@nestjs/common';
// import { ConfigModule } from '@nestjs/config';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { AuthModule } from './auth/auth.module';
import { UserAuthModule } from './user-auth/user-auth.module';
import { TwoFactorAuthModule } from './two-factor-auth/two-factor-auth.module';
import { PrismaService } from './prisma.service';
import { UserServiceModule } from './user-service/user.module';
import { MatchModule } from './match/match.module';

@Module({
  imports: [
		AuthModule, TwoFactorAuthModule,
		UserAuthModule, UserServiceModule,
		MatchModule
	],
  // imports: [ConfigModule.forRoot(), AuthModule, UserAuthModule, TwoFactorAuthModule],
  controllers: [AppController],
  providers: [AppService, PrismaService],
})
export class AppModule {}
