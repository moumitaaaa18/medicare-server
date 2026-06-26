import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import { ObjectId } from "mongodb";
import { toNodeHandler } from "better-auth/node";
import { auth, client } from "./auth.js";
import Stripe from "stripe";
import jwt from "jsonwebtoken";

dotenv.config();

const app = express();
const port = process.env.PORT || 5000;
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

const allowedOrigins = [
  "http://localhost:5173",
  "http://localhost:5174",
  "http://localhost:5175",
  "http://localhost:5176",
  "http://localhost:5177",
  "http://localhost:5178",
  "http://localhost:5179",
  process.env.CLIENT_URL,
].filter(Boolean);

app.use(
  cors({
    origin: allowedOrigins,
    credentials: true,
  })
);

app.all("/api/auth/*splat", toNodeHandler(auth));
app.use(express.json());

const database = client.db("medicareDB");
const doctorsCollection = database.collection("doctors");
const usersCollection = database.collection("users");
const appointmentsCollection = database.collection("appointments");
const reviewsCollection = database.collection("reviews");
const paymentsCollection = database.collection("payments");
const prescriptionsCollection = database.collection("prescriptions");

const isValidObjectId = (id) => ObjectId.isValid(id);

app.get("/", (req, res) => {
  res.send("MediCare Connect Server is Running");
});

/* JWT */
app.post("/jwt", async (req, res) => {
  const { email } = req.body;

  if (!email) {
    return res.status(400).send({ message: "Email is required" });
  }

  const token = jwt.sign({ email }, process.env.JWT_SECRET, {
    expiresIn: "7d",
  });

  res.send({ token });
});

const verifyJWT = (req, res, next) => {
  const authorization = req.headers.authorization;

  if (!authorization) {
    return res.status(401).send({ message: "Unauthorized access" });
  }

  const token = authorization.split(" ")[1];

  jwt.verify(token, process.env.JWT_SECRET, (error, decoded) => {
    if (error) {
      return res.status(403).send({ message: "Forbidden access" });
    }

    req.decoded = decoded;
    next();
  });
};

/* USERS */
app.post("/users", async (req, res) => {
  try {
    const user = req.body;

    if (!user?.email) {
      return res.status(400).send({ message: "Email is required" });
    }

    const role = user.role || "patient";

    const userInfo = {
      ...user,
      role,
      status: user.status || "active",
      verificationStatus: role === "doctor" ? "pending" : "verified",
      updatedAt: new Date(),
    };

    const result = await usersCollection.updateOne(
      { email: user.email },
      {
        $set: userInfo,
        $setOnInsert: {
          createdAt: new Date(),
        },
      },
      { upsert: true }
    );

    res.send({
      message: "User saved successfully",
      role: userInfo.role,
      verificationStatus: userInfo.verificationStatus,
      modifiedCount: result.modifiedCount,
      upsertedCount: result.upsertedCount,
    });
  } catch (error) {
    console.log("User save error:", error);
    res.status(500).send({ message: "Failed to save user" });
  }
});

app.get("/users", verifyJWT, async (req, res) => {
  const result = await usersCollection.find().sort({ createdAt: -1 }).toArray();
  res.send(result);
});

app.get("/users/:email", async (req, res) => {
  const result = await usersCollection.findOne({ email: req.params.email });
  res.send(result);
});

app.patch("/users/:id", async (req, res) => {
  if (!isValidObjectId(req.params.id)) {
    return res.status(400).send({ message: "Invalid user id" });
  }

  const result = await usersCollection.updateOne(
    { _id: new ObjectId(req.params.id) },
    { $set: req.body }
  );

  res.send(result);
});

app.get("/seed-admin", async (req, res) => {
  const admin = {
    name: "Admin",
    email: "admin@medicare.com",
    role: "admin",
    status: "active",
    verificationStatus: "verified",
    photo: "https://i.ibb.co/4pDNDk1/avatar.png",
    createdAt: new Date(),
  };

  const existingAdmin = await usersCollection.findOne({ email: admin.email });

  if (existingAdmin) {
    return res.send({
      message: "Admin already exists",
      email: "admin@medicare.com",
      password: "Admin@123",
    });
  }

  const result = await usersCollection.insertOne(admin);

  res.send({
    message: "Admin user inserted",
    insertedId: result.insertedId,
    email: "admin@medicare.com",
    password: "Admin@123",
  });
});

app.get("/make-doctor/:email", async (req, res) => {
  const result = await usersCollection.updateOne(
    { email: req.params.email },
    {
      $set: {
        role: "doctor",
        status: "active",
        verificationStatus: "pending",
      },
    }
  );

  res.send({
    message: "User role updated to doctor",
    modifiedCount: result.modifiedCount,
  });
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
  if (!isValidObjectId(req.params.id)) {
    return res.status(400).send({ message: "Invalid doctor id" });
  }

  const result = await doctorsCollection.findOne({
    _id: new ObjectId(req.params.id),
  });

  res.send(result);
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
      verificationStatus: "verified",
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
      verificationStatus: "verified",
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
      verificationStatus: "verified",
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
  try {
    const appointment = req.body;

    const newAppointment = {
      ...appointment,
      appointmentStatus: "pending",
      paymentStatus: "unpaid",
      createdAt: new Date(),
    };

    const result = await appointmentsCollection.insertOne(newAppointment);
    res.send(result);
  } catch (error) {
    res.status(500).send({ message: "Failed to create appointment" });
  }
});

app.get("/appointments", verifyJWT, async (req, res) => {
  try {
    const { doctorEmail } = req.query;
    const query = doctorEmail ? { doctorEmail } : {};

    const result = await appointmentsCollection
      .find(query)
      .sort({ createdAt: -1 })
      .toArray();

    res.send(result);
  } catch (error) {
    res.status(500).send({ message: "Failed to get appointments" });
  }
});

app.get("/appointments/patient/:email", async (req, res) => {
  try {
    const result = await appointmentsCollection
      .find({ patientEmail: req.params.email })
      .sort({ createdAt: -1 })
      .toArray();

    res.send(result);
  } catch (error) {
    res.status(500).send({ message: "Failed to get patient appointments" });
  }
});

app.patch("/appointments/:id", async (req, res) => {
  try {
    if (!isValidObjectId(req.params.id)) {
      return res.status(400).send({ message: "Invalid appointment id" });
    }

    const result = await appointmentsCollection.updateOne(
      { _id: new ObjectId(req.params.id) },
      { $set: req.body }
    );

    res.send(result);
  } catch (error) {
    res.status(500).send({ message: "Failed to update appointment" });
  }
});

app.delete("/appointments/:id", async (req, res) => {
  if (!isValidObjectId(req.params.id)) {
    return res.status(400).send({ message: "Invalid appointment id" });
  }

  const result = await appointmentsCollection.deleteOne({
    _id: new ObjectId(req.params.id),
  });

  res.send(result);
});

/* REVIEWS */
app.get("/reviews", async (req, res) => {
  const result = await reviewsCollection
    .find()
    .sort({ createdAt: -1 })
    .toArray();

  res.send(result);
});

app.get("/reviews/:email", async (req, res) => {
  const result = await reviewsCollection
    .find({ patientEmail: req.params.email })
    .sort({ createdAt: -1 })
    .toArray();

  res.send(result);
});

app.post("/reviews", async (req, res) => {
  const review = req.body;

  const newReview = {
    ...review,
    createdAt: new Date(),
  };

  const result = await reviewsCollection.insertOne(newReview);
  res.send(result);
});

app.patch("/reviews/:id", async (req, res) => {
  if (!isValidObjectId(req.params.id)) {
    return res.status(400).send({ message: "Invalid review id" });
  }

  const result = await reviewsCollection.updateOne(
    { _id: new ObjectId(req.params.id) },
    { $set: req.body }
  );

  res.send(result);
});

app.delete("/reviews/:id", async (req, res) => {
  if (!isValidObjectId(req.params.id)) {
    return res.status(400).send({ message: "Invalid review id" });
  }

  const result = await reviewsCollection.deleteOne({
    _id: new ObjectId(req.params.id),
  });

  res.send(result);
});

/* PRESCRIPTIONS */
app.post("/prescriptions", async (req, res) => {
  try {
    const prescription = req.body;

    const result = await prescriptionsCollection.insertOne({
      ...prescription,
      createdAt: new Date(),
    });

    if (prescription.appointmentId && isValidObjectId(prescription.appointmentId)) {
      await appointmentsCollection.updateOne(
        { _id: new ObjectId(prescription.appointmentId) },
        { $set: { appointmentStatus: "completed" } }
      );
    }

    res.send({
      message: "Prescription created successfully",
      insertedId: result.insertedId,
    });
  } catch (error) {
    res.status(500).send({ message: "Failed to create prescription" });
  }
});

app.get("/prescriptions/:email", async (req, res) => {
  const result = await prescriptionsCollection
    .find({ patientEmail: req.params.email })
    .sort({ createdAt: -1 })
    .toArray();

  res.send(result);
});

/* PAYMENTS */
app.post("/payments", async (req, res) => {
  try {
    const payment = req.body;

    const result = await paymentsCollection.insertOne({
      ...payment,
      paymentStatus: "paid",
      paymentDate: new Date(),
    });

    if (payment.appointmentId && isValidObjectId(payment.appointmentId)) {
      await appointmentsCollection.updateOne(
        { _id: new ObjectId(payment.appointmentId) },
        { $set: { paymentStatus: "paid" } }
      );
    }

    res.send(result);
  } catch (error) {
    res.status(500).send({ message: "Payment failed" });
  }
});

app.get("/payments", verifyJWT, async (req, res) => {
  const result = await paymentsCollection
    .find()
    .sort({ paymentDate: -1 })
    .toArray();

  res.send(result);
});

app.get("/payments/:email", async (req, res) => {
  const result = await paymentsCollection
    .find({ patientEmail: req.params.email })
    .sort({ paymentDate: -1 })
    .toArray();

  res.send(result);
});

/* STRIPE */
app.post("/create-payment-intent", async (req, res) => {
  try {
    const { fee } = req.body;
    const amount = parseInt(Number(fee) * 100);

    if (!amount || amount <= 0) {
      return res.status(400).send({ message: "Invalid payment amount" });
    }

    const paymentIntent = await stripe.paymentIntents.create({
      amount,
      currency: "usd",
      payment_method_types: ["card"],
    });

    res.send({ clientSecret: paymentIntent.client_secret });
  } catch (error) {
    res.status(500).send({ error: error.message });
  }
});

app.post("/create-payment-session", async (req, res) => {
  try {
    const { appointmentId } = req.body;

    if (!isValidObjectId(appointmentId)) {
      return res.status(400).send({ message: "Invalid appointment id" });
    }

    const appointment = await appointmentsCollection.findOne({
      _id: new ObjectId(appointmentId),
    });

    if (!appointment) {
      return res.status(404).send({ message: "Appointment not found" });
    }

    const amount = Number(appointment.consultationFee || appointment.fee || 0);

    if (!amount || amount <= 0) {
      return res.status(400).send({ message: "Invalid payment amount" });
    }

    const session = await stripe.checkout.sessions.create({
      payment_method_types: ["card"],
      mode: "payment",
      line_items: [
        {
          price_data: {
            currency: "usd",
            product_data: {
              name: `Appointment with ${appointment.doctorName}`,
            },
            unit_amount: amount * 100,
          },
          quantity: 1,
        },
      ],
      success_url: `${process.env.CLIENT_URL}/payment-success?appointmentId=${appointmentId}&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${process.env.CLIENT_URL}/dashboard`,
    });

    res.send({ url: session.url });
  } catch (error) {
    res.status(500).send({ message: "Payment session failed" });
  }
});

app.post("/confirm-payment", async (req, res) => {
  try {
    const { appointmentId, sessionId } = req.body;

    if (!isValidObjectId(appointmentId)) {
      return res.status(400).send({ message: "Invalid appointment id" });
    }

    const session = await stripe.checkout.sessions.retrieve(sessionId);

    if (session.payment_status !== "paid") {
      return res.status(400).send({ message: "Payment not completed" });
    }

    const appointment = await appointmentsCollection.findOne({
      _id: new ObjectId(appointmentId),
    });

    if (!appointment) {
      return res.status(404).send({ message: "Appointment not found" });
    }

    const existing = await paymentsCollection.findOne({
      transactionId: session.payment_intent,
    });

    if (!existing) {
      await paymentsCollection.insertOne({
        appointmentId,
        patientEmail: appointment.patientEmail,
        patientName: appointment.patientName,
        doctorEmail: appointment.doctorEmail || "",
        doctorName: appointment.doctorName,
        amount: Number(appointment.consultationFee || appointment.fee || 0),
        transactionId: session.payment_intent,
        paymentStatus: "paid",
        paymentDate: new Date(),
      });
    }

    await appointmentsCollection.updateOne(
      { _id: new ObjectId(appointmentId) },
      { $set: { paymentStatus: "paid" } }
    );

    res.send({ message: "Payment confirmed" });
  } catch (error) {
    res.status(500).send({ message: "Payment confirmation failed" });
  }
});

/* DASHBOARD STATS */
app.get("/dashboard-stats", verifyJWT, async (req, res) => {
  const totalUsers = await usersCollection.countDocuments();
  const totalDoctors = await usersCollection.countDocuments({ role: "doctor" });
  const totalPatients = await usersCollection.countDocuments({ role: "patient" });
  const totalAdmins = await usersCollection.countDocuments({ role: "admin" });
  const totalAppointments = await appointmentsCollection.countDocuments();
  const totalPayments = await paymentsCollection.countDocuments();
  const totalReviews = await reviewsCollection.countDocuments();

  res.send({
    totalUsers,
    totalDoctors,
    totalPatients,
    totalAdmins,
    totalAppointments,
    totalPayments,
    totalReviews,
  });
});

app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});