import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import { ObjectId } from "mongodb";
import { toNodeHandler } from "better-auth/node";
import { auth, client } from "./auth.js";

dotenv.config();

const app = express();
const port = process.env.PORT || 5000;

app.use(cors({

  origin: ["http://localhost:5173", "http://localhost:5174", "http://localhost:5176", "http://localhost:5175"],
  credentials: true,
}));

app.all("/api/auth/*splat", toNodeHandler(auth));
app.use(express.json());

const database = client.db("medicareDB");
const doctorsCollection = database.collection("doctors");
const usersCollection = database.collection("users");
const appointmentsCollection = database.collection("appointments");

app.get("/", (req, res) => {
  res.send("MediCare Connect Server is Running");
});

/* USERS */
app.post("/users", async (req, res) => {
  const user = req.body;
  const existingUser = await usersCollection.findOne({ email: user.email });

  if (existingUser) {
    return res.send({ message: "User already exists" });
  }

  const newUser = {
    ...user,
    role: user.role || "patient",
    status: "active",
    createdAt: new Date(),
  };

  const result = await usersCollection.insertOne(newUser);
  res.send(result);
});

app.get("/users/:email", async (req, res) => {
  const user = await usersCollection.findOne({ email: req.params.email });
  res.send(user);
});

/* DOCTORS */
app.get("/doctors", async (req, res) => {
  const search = req.query.search || "";
  const sort = req.query.sort || "";
  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || 6;
  const featured = req.query.featured;

  const query = search
    ? {
        $or: [
          { doctorName: { $regex: search, $options: "i" } },
          { name: { $regex: search, $options: "i" } },
          { specialization: { $regex: search, $options: "i" } },
          { speciality: { $regex: search, $options: "i" } },
        ],
      }
    : {};

  let sortQuery = {};
  if (sort === "fee") sortQuery = { consultationFee: 1 };
  if (sort === "experience") sortQuery = { experience: -1 };
  if (sort === "rating") sortQuery = { averageRating: -1 };

  const finalLimit = featured === "true" ? 6 : limit;
  const skip = featured === "true" ? 0 : (page - 1) * limit;

  const doctors = await doctorsCollection
    .find(query)
    .sort(sortQuery)
    .skip(skip)
    .limit(finalLimit)
    .toArray();

  const total = await doctorsCollection.countDocuments(query);

  res.send({
    doctors,
    total,
    page,
    totalPages: Math.ceil(total / limit),
  });
});

app.get("/doctors/:id", async (req, res) => {
  const doctor = await doctorsCollection.findOne({
    _id: new ObjectId(req.params.id),
  });
  res.send(doctor);
});

app.get("/reset-doctors", async (req, res) => {
  await doctorsCollection.deleteMany({});

  const doctors = [
    {
      doctorName: "Dr. Sam Rene",
      specialization: "Cardiologist",
      qualifications: "MBBS, FCPS",
      experience: 10,
      consultationFee: 500,
      hospitalName: "MediCare General Hospital",
      profileImage: "https://images.unsplash.com/photo-1559839734-2b71ea197ec2?w=600&auto=format&fit=crop",
      availableDays: ["Sunday", "Tuesday", "Thursday"],
      availableSlots: ["10:00 AM", "12:00 PM", "2:00 PM"],
      verificationStatus: "verified",
      averageRating: 4.9,
      createdAt: new Date(),
    },
    {
      doctorName: "Dr. Tanvir Hasan",
      specialization: "Neurologist",
      qualifications: "MBBS, MD",
      experience: 9,
      consultationFee: 700,
      hospitalName: "City Care Hospital",
      profileImage: "https://images.unsplash.com/photo-1622253692010-333f2da6031d?w=600&auto=format&fit=crop",
      availableDays: ["Monday", "Wednesday", "Friday"],
      availableSlots: ["4:00 PM", "6:00 PM", "8:00 PM"],
      verificationStatus: "Specialist",
      averageRating: 4.7,
      createdAt: new Date(),
    },
    {
      doctorName: "Dr. Faria",
      specialization: "Dermatologist",
      qualifications: "MBBS, DDV",
      experience: 7,
      consultationFee: 600,
      hospitalName: "Skin Care Hospital",
      profileImage: "https://images.unsplash.com/photo-1594824476967-48c8b964273f?w=600&auto=format&fit=crop",
      availableDays: ["Saturday", "Monday", "Wednesday"],
      availableSlots: ["11:00 AM", "1:00 PM", "3:00 PM"],
      verificationStatus: "Certified Specialist",
      averageRating: 4.8,
      createdAt: new Date(),
    },
    {
      doctorName: "Dr. Ime D. Aris",
      specialization: "Orthopedic",
      qualifications: "MBBS, MS Ortho",
      experience: 12,
      consultationFee: 800,
      hospitalName: "Bone Care Hospital",
      profileImage: "https://images.unsplash.com/photo-1537368910025-700350fe46c7?w=600&auto=format&fit=crop",
      availableDays: ["Sunday", "Monday", "Thursday"],
      availableSlots: ["6:00 PM", "7:30 PM", "9:00 PM"],
      verificationStatus: "verified",
      averageRating: 4.6,
      createdAt: new Date(),
    },
    {
      doctorName: "Dr. Ahnaf Karim",
      specialization: "Pediatrician",
      qualifications: "MBBS, DCH",
      experience: 8,
      consultationFee: 650,
      hospitalName: "Child Care Hospital",
      profileImage: "https://images.unsplash.com/photo-1612349317150-e413f6a5b16d?w=600&auto=format&fit=crop",
      availableDays: ["Tuesday", "Thursday", "Saturday"],
      availableSlots: ["9:00 AM", "11:00 AM", "1:00 PM"],
      verificationStatus: "Fresher",
      averageRating: 4.5,
      createdAt: new Date(),
    },
    {
      doctorName: "Dr. Mahfuzur Rahman",
      specialization: "Dentist",
      qualifications: "BDS, FCPS",
      experience: 6,
      consultationFee: 500,
      hospitalName: "Dental Care Hospital",
      profileImage: "https://images.unsplash.com/photo-1582750433449-648ed127bb54?w=600&auto=format&fit=crop",
      availableDays: ["Monday", "Tuesday", "Friday"],
      availableSlots: ["5:00 PM", "7:00 PM", "8:30 PM"],
      verificationStatus: "verified",
      averageRating: 4.4,
      createdAt: new Date(),
    },
    {
      doctorName: "Dr. Rebecca D'M",
      specialization: "Gynecologist",
      qualifications: "MBBS, FCPS",
      experience: 11,
      consultationFee: 850,
      hospitalName: "Women Care Hospital",
      profileImage: "https://images.unsplash.com/photo-1651008376811-b90baee60c1f?w=600&auto=format&fit=crop",
      availableDays: ["Sunday", "Wednesday", "Friday"],
      availableSlots: ["3:00 PM", "5:00 PM", "7:00 PM"],
      verificationStatus: "verified",
      averageRating: 4.9,
      createdAt: new Date(),
    },
    {
      doctorName: "Dr. Rafiqul Islam",
      specialization: "ENT Specialist",
      qualifications: "MBBS, MS ENT",
      experience: 6,
      consultationFee: 550,
      hospitalName: "ENT Care Hospital",
      profileImage: "https://images.unsplash.com/photo-1607990281513-2c110a25bd8c?w=600&auto=format&fit=crop",
      availableDays: ["Saturday", "Monday", "Thursday"],
      availableSlots: ["12:00 PM", "2:00 PM", "4:00 PM"],
      verificationStatus: "verified",
      averageRating: 4.3,
      createdAt: new Date(),
    },
    {
      doctorName: "Dr. Salsa Martina",
      specialization: "Psychiatrist",
      qualifications: "MBBS, MD Psychiatry",
      experience: 9,
      consultationFee: 750,
      hospitalName: "Mental Health Center",
      profileImage: "https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?w=600&auto=format&fit=crop",
      availableDays: ["Tuesday", "Wednesday", "Friday"],
      availableSlots: ["7:00 PM", "8:30 PM", "10:00 PM"],
      verificationStatus: "verified",
      averageRating: 4.8,
      createdAt: new Date(),
    },
    {
      doctorName: "Dr. Abdullah Al Mamun",
      specialization: "Urologist",
      qualifications: "MBBS, MS Urology",
      experience: 13,
      consultationFee: 950,
      hospitalName: "MediCare General Hospital",
      profileImage: "https://images.unsplash.com/photo-1504813184591-01572f98c85f?w=600&auto=format&fit=crop",
      availableDays: ["Sunday", "Tuesday", "Saturday"],
      availableSlots: ["8:00 AM", "10:00 AM", "12:00 PM"],
      verificationStatus: "verified",
      averageRating: 4.7,
      createdAt: new Date(),
    },
    {
      doctorName: "Dr. Jenelia Merrie",
      specialization: "Eye Specialist",
      qualifications: "MBBS, DO",
      experience: 7,
      consultationFee: 600,
      hospitalName: "Vision Care Hospital",
      profileImage: "https://images.unsplash.com/photo-1594744803329-e58b31de8bf5?w=600&auto=format&fit=crop",
      availableDays: ["Monday", "Thursday", "Friday"],
      availableSlots: ["2:00 PM", "4:00 PM", "6:00 PM"],
      verificationStatus: "verified",
      averageRating: 4.6,
      createdAt: new Date(),
    },
    {
      doctorName: "Dr. Sohanur Rahman",
      specialization: "Medicine Specialist",
      qualifications: "MBBS, FCPS Medicine",
      experience: 15,
      consultationFee: 900,
      hospitalName: "MediCare General Hospital",
      profileImage: "https://images.unsplash.com/photo-1584467735871-8e85353a8413?w=600&auto=format&fit=crop",
      availableDays: ["Saturday", "Sunday", "Wednesday"],
      availableSlots: ["9:30 AM", "11:30 AM", "1:30 PM"],
      verificationStatus: "verified",
      averageRating: 4.9,
      createdAt: new Date(),
    },
  ];

  const result = await doctorsCollection.insertMany(doctors);

  res.send({
    message: "12 doctors inserted successfully",
    insertedCount: result.insertedCount,
  });
});

/* APPOINTMENTS */
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

app.get("/appointments", async (req, res) => {
  const result = await appointmentsCollection
    .find()
    .sort({ createdAt: -1 })
    .toArray();

  res.send(result);
});

app.get("/appointments/:email", async (req, res) => {
  const result = await appointmentsCollection
    .find({ patientEmail: req.params.email })
    .sort({ createdAt: -1 })
    .toArray();

  res.send(result);
});
app.patch("/appointments/:id", async (req, res) => {
  const result = await appointmentsCollection.updateOne(
    { _id: new ObjectId(req.params.id) },
    { $set: req.body }
  );

  res.send(result);
});

app.delete("/appointments/:id", async (req, res) => {
  const result = await appointmentsCollection.deleteOne({
    _id: new ObjectId(req.params.id),
  });

  res.send(result);
});

/* DASHBOARD STATS */
app.get("/dashboard-stats", async (req, res) => {
  const totalUsers = await usersCollection.countDocuments();
  const totalDoctors = await doctorsCollection.countDocuments();
  const totalPatients = await usersCollection.countDocuments({ role: "patient" });
  const totalAdmins = await usersCollection.countDocuments({ role: "admin" });
  const totalAppointments = await appointmentsCollection.countDocuments();

  res.send({
    totalUsers,
    totalDoctors,
    totalPatients,
    totalAdmins,
    totalAppointments,
    totalPayments: 0,
  });
});

app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});