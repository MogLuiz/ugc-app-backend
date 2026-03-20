import { DataSource } from 'typeorm';
import { config } from 'dotenv';
import { BootstrapSchema1731710000000 } from './migrations/1731710000000-BootstrapSchema';
import { AddCompanyPortfolioMedia1763700000000 } from './migrations/1763700000000-AddCompanyPortfolioMedia';
import { AddSchedulingCore1765400000000 } from './migrations/1765400000000-AddSchedulingCore';
import { HardenSchedulingContracts1765600000000 } from './migrations/1765600000000-HardenSchedulingContracts';
import { AddCreatorJobTypes1765800000000 } from './migrations/1765800000000-AddCreatorJobTypes';
import { AddJobTypePriceCents1765900000000 } from './migrations/1765900000000-AddJobTypePriceCents';
import { AddProfileRating1766000000000 } from './migrations/1766000000000-AddProfileRating';

config();

const databaseUrl = process.env.DATABASE_URL;

export const AppDataSource = new DataSource(
  databaseUrl
    ? {
        type: 'postgres',
        url: databaseUrl,
        entities: [__dirname + '/../**/*.entity{.ts,.js}'],
        migrations: [
          BootstrapSchema1731710000000,
          AddCompanyPortfolioMedia1763700000000,
          AddSchedulingCore1765400000000,
          HardenSchedulingContracts1765600000000,
          AddCreatorJobTypes1765800000000,
          AddJobTypePriceCents1765900000000,
          AddProfileRating1766000000000,
        ],
        synchronize: false,
        logging: process.env.NODE_ENV === 'development',
        ssl: { rejectUnauthorized: false },
      }
    : {
        type: 'postgres',
        host: process.env.DB_HOST || 'localhost',
        port: parseInt(process.env.DB_PORT || '5432', 10),
        username: process.env.DB_USERNAME || 'postgres',
        password: process.env.DB_PASSWORD || 'postgres',
        database: process.env.DB_DATABASE || 'ugc',
        entities: [__dirname + '/../**/*.entity{.ts,.js}'],
        migrations: [
          BootstrapSchema1731710000000,
          AddCompanyPortfolioMedia1763700000000,
          AddSchedulingCore1765400000000,
          HardenSchedulingContracts1765600000000,
          AddCreatorJobTypes1765800000000,
          AddJobTypePriceCents1765900000000,
          AddProfileRating1766000000000,
        ],
        synchronize: false,
        logging: process.env.NODE_ENV === 'development',
        ...(process.env.DB_HOST?.includes('supabase.co') && {
          ssl: { rejectUnauthorized: false },
        }),
      },
);
