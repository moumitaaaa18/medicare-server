import { betterAuth } from "better-auth";
import { mongodbAdapter } from "better-auth/adapters/mongodb";
import { MongoClient, ServerApiVersion } from "mongodb";
import dotenv from "dotenv";

dotenv.config();

const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.vrddblm.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0`;

export const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});

await client.connect();

const db = client.db("medicareDB");

export const auth = betterAuth({
  database: mongodbAdapter(db, {
    client,
  }),

  baseURL: "http://localhost:5000",

  trustedOrigins: ["http://localhost:5173"],

  emailAndPassword: {
    enabled: true,
  },
});