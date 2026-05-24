import { MongoClient, ServerApiVersion, Db } from 'mongodb';

let dbInstance: Db | null = null;

export const connectDB = async (): Promise<Db> => {
  if (dbInstance) return dbInstance;
  
  const uri = process.env.MONGODB_URI;
  if (!uri) throw new Error("Missing MONGODB_URI environment variable definition.");

  const client = new MongoClient(uri, {
    serverApi: {
      version: ServerApiVersion.v1,
      strict: true,
      deprecationErrors: true,
    }
  });

  await client.connect();
  dbInstance = client.db(); 
  
  await client.db("admin").command({ ping: 1 });
  console.log(" Successfully connected to MongoDB Atlas via Stable API!");
  
  return dbInstance;
};

export const getDB = (): Db => {
  if (!dbInstance) throw new Error("Database instance context has not been initialized yet.");
  return dbInstance;
};
