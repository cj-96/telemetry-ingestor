import * as mongoose from 'mongoose';

export const databaseProviders = [
  {
    provide: 'DATABASE_CONNECTION',
    useFactory: (): Promise<typeof mongoose> => {
      const uri = process.env.MONGO_URI;
      if (!uri) {
        throw new Error('MONGO_URI environment variable is not defined');
      }
      return mongoose.connect(uri);
    },
  },
];
