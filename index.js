import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import { toNodeHandler } from "better-auth/node";
import { client, auth } from "./auth.js";

dotenv.config();

const app = express();
const port = process.env.PORT || 5000;

app.use(
  cors({
    origin: ["http://localhost:5173","http://localhost:5176"],
    credentials: true,
  })
);


app.all("/api/auth/*splat", toNodeHandler(auth));
app.use(express.json());

const database = client.db("medicareDB");
const doctorsCollection = database.collection("doctors");
const usersCollection = database.collection("users");

app.get("/doctors", async (req, res) => {
  const result = await doctorsCollection.find().toArray();
  res.send(result);
});
app.get("/users/:email", async (req, res) => {
  const email = req.params.email;
  const user = await usersCollection.findOne({ email });
  res.send(user);
});
app.post("/users", async (req, res) => {
  const user = req.body;

  const existingUser = await usersCollection.findOne({
    email: user.email,
  });

  if (existingUser) {
    return res.send({
      message: "User already exists",
    });
  }

  const newUser = {
    ...user,
    role: "patient",
    status: "active",
    createdAt: new Date(),
  };

  const result = await usersCollection.insertOne(newUser);
  res.send(result);
});

app.get("/", (req, res) => {
  res.send("Medicare Connect Server is Running");
});

app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});