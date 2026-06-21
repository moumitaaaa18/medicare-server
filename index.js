import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import { toNodeHandler } from "better-auth/node";
import { auth, client } from "./auth.js";

dotenv.config();

const app = express();
const port = process.env.PORT || 5000;

app.use(
  cors({
    origin: ["http://localhost:5173", "http://localhost:5176","http://localhost:5174"],
    credentials: true,
  })
);

app.all("/api/auth/*splat", toNodeHandler(auth));

app.use(express.json());

const database = client.db("medicareDB");
const doctorsCollection = database.collection("doctors");
const usersCollection = database.collection("users");
const appointmentsCollection = database.collection("appointments");

app.get("/", (req, res) => {
  res.send("MediCare Connect Server is Running");
});

app.get("/doctors", async (req, res) => {
  const result = await doctorsCollection.find().toArray();
  res.send(result);
});

app.get("/users/:email", async (req, res) => {
  const email = req.params.email;
  const user = await usersCollection.findOne({ email });
  res.send(user);
});
app.get("/dashboard-stats", async (req, res) => {
  const totalUsers = await usersCollection.countDocuments();
  const totalDoctors = await doctorsCollection.countDocuments();
  const totalPatients = await usersCollection.countDocuments({ role: "patient" });
  const totalAdmins = await usersCollection.countDocuments({ role: "admin" });
  const appointmentsCollection = database.collection("appointments");

app.post("/appointments", async (req, res) => {
  const appointment = req.body;

  const newAppointment = {
    ...appointment,
    appointmentStatus: "pending",
    paymentStatus: "unpaid",
    createdAt: new Date(),
  };

  const result = await appointmentsCollection.insertOne(newAppointment);
  res.send(result);
});

app.get("/appointments/:email", async (req, res) => {
  const email = req.params.email;

  const result = await appointmentsCollection
    .find({ patientEmail: email })
    .sort({ createdAt: -1 })
    .toArray();

  res.send(result);
});

  res.send({
    totalUsers,
    totalDoctors,
    totalPatients,
    totalAdmins,
    totalAppointments: 0,
    totalPayments: 0,
  });
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

app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});