import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import { ObjectId } from "mongodb";
import { toNodeHandler } from "better-auth/node";
import { auth, client } from "./auth.js";
import Stripe from "stripe";

dotenv.config();

const app = express();
const port = process.env.PORT || 5000;
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

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
const reviewsCollection = database.collection("reviews");

const paymentsCollection = database.collection("payments");

app.get("/", (req, res) => {
  res.send("MediCare Connect Server is Running");
});
app.post("/create-payment-intent", async (req, res) => {
  try {
    const { fee } = req.body;

    const amount = parseInt(fee * 100);

    const paymentIntent = await stripe.paymentIntents.create({
      amount,
      currency: "usd",
      payment_method_types: ["card"],
    });

    res.send({
      clientSecret: paymentIntent.client_secret,
    });
  } catch (error) {
    res.status(500).send({
      error: error.message,
    });
  }
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
app.get("/users", async (req, res) => {
  const result = await usersCollection.find().sort({ createdAt: -1 }).toArray();
  res.send(result);
});

app.patch("/users/:id", async (req, res) => {
  const result = await usersCollection.updateOne(
    { _id: new ObjectId(req.params.id) },
    { $set: req.body }
  );
  res.send(result);
});

app.get("/users/:email", async (req, res) => {
  const user = await usersCollection.findOne({ email: req.params.email });
  res.send(user);
});
app.get("/seed-admin", async (req, res) => {
  const admin = {
    name: "Admin",
    email: "admin@medicare.com",
    role: "admin",
    status: "active",
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
  const result = await reviewsCollection.updateOne(
    { _id: new ObjectId(req.params.id) },
    { $set: req.body }
  );

  res.send(result);
});

app.delete("/reviews/:id", async (req, res) => {
  const result = await reviewsCollection.deleteOne({
    _id: new ObjectId(req.params.id),
  });

  res.send(result);
});
app.post("/payments", async (req, res) => {
  const payment = req.body;

  const newPayment = {
    ...payment,
    paymentDate: new Date(),
  };

  const result = await paymentsCollection.insertOne(newPayment);
  res.send(result);
});

app.get("/payments", async (req, res) => {
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
/* PRESCRIPTIONS */
const prescriptionsCollection = database.collection("prescriptions");

app.post("/prescriptions", async (req, res) => {
  const prescription = req.body;

  const newPrescription = {
    ...prescription,
    createdAt: new Date(),
  };

  const result = await prescriptionsCollection.insertOne(newPrescription);
  res.send(result);
});

app.get("/prescriptions/:email", async (req, res) => {
  const email = req.params.email;

  const result = await prescriptionsCollection
    .find({ patientEmail: email })
    .sort({ createdAt: -1 })
    .toArray();

  res.send(result);
});
/* PAYMENTS */
app.post("/create-payment-session", async (req, res) => {
  try {
    const { appointmentId } = req.body;

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
    console.log("Stripe session error:", error);
    res.status(500).send({ message: "Payment session failed" });
  }
});

app.post("/confirm-payment", async (req, res) => {
  try {
    const { appointmentId, sessionId } = req.body;

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

    const existingPayment = await paymentsCollection.findOne({
      transactionId: session.payment_intent,
    });

    if (existingPayment) {
      return res.send({ message: "Payment already saved" });
    }

    const paymentInfo = {
      appointmentId,
      patientEmail: appointment.patientEmail,
      patientName: appointment.patientName,
      doctorEmail: appointment.doctorEmail || "",
      doctorName: appointment.doctorName,
      amount: Number(appointment.consultationFee || appointment.fee || 0),
      transactionId: session.payment_intent,
      paymentStatus: "paid",
      paymentDate: new Date(),
    };

    await paymentsCollection.insertOne(paymentInfo);

    await appointmentsCollection.updateOne(
      { _id: new ObjectId(appointmentId) },
      {
        $set: {
          paymentStatus: "paid",
          appointmentStatus: "pending",
        },
      }
    );

    res.send({
      message: "Payment confirmed",
      transactionId: session.payment_intent,
    });
  } catch (error) {
    console.log("Confirm payment error:", error);
    res.status(500).send({ message: "Payment confirmation failed" });
  }
});

app.get("/payments", async (req, res) => {
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
app.get("/payments", async (req, res) => {
  const result = await paymentsCollection
    .find()
    .sort({ paymentDate: -1 })
    .toArray();

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
    totalPayments,
  });
});

app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});