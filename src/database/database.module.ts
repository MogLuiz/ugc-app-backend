import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigService } from '@nestjs/config';

@Module({
  imports: [
    TypeOrmModule.forRootAsync({
      useFactory: (configService: ConfigService) => {
        const databaseUrl = configService.get<string>('DATABASE_URL');
        if (databaseUrl) {
          return {
            type: 'postgres',
            url: databaseUrl,
            entities: [],
            synchronize: false,
            logging: configService.get<string>('NODE_ENV') === 'development',
            ssl: { rejectUnauthorized: false },
          };
        }
        const host = configService.get<string>('DB_HOST') ?? '';
        const isSupabase = host.includes('supabase.co');
        return {
          type: 'postgres',
          host,
          port: configService.get<number>('DB_PORT'),
          username: configService.get<string>('DB_USERNAME'),
          password: configService.get<string>('DB_PASSWORD'),
          database: configService.get<string>('DB_DATABASE'),
          entities: [],
          synchronize: false,
          logging: configService.get<string>('NODE_ENV') === 'development',
          ...(isSupabase && {
            ssl: { rejectUnauthorized: false },
          }),
        };
      },
      inject: [ConfigService],
    }),
  ],
})
export class DatabaseModule {}
