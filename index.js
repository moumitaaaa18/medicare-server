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

app.use(
  cors({
    origin: [
      "http://localhost:5173",
      "http://localhost:5174",
      "http://localhost:5175",
      "http://localhost:5176",
    ],
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

app.get("/", (req, res) => {

  res.send("MediCare Connect Server is Running");
});
/* JWT */
app.post("/jwt", async (req, res) => {
  const user = req.body;

  const token = jwt.sign(
    { email: user.email },
    process.env.JWT_SECRET,
    { expiresIn: "7d" }
  );

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

/* PAYMENT INTENT */
app.post("/create-payment-intent", async (req, res) => {
  try {
    const { fee } = req.body;
    const amount = parseInt(Number(fee) * 100);

    if (!amount || amount <= 0) {
      return res.status(400).send({ message: "Invalid fee amount" });
    }

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
  try {
    const user = req.body;
    const existingUser = await usersCollection.findOne({ email: user.email });

    if (existingUser) {
      return res.send({ message: "User already exists" });
    }

    const newUser = {
      ...user,
      role: user.role || "patient",
      status: "active",
      verificationStatus: user.role === "doctor" ? "pending" : "verified",
      createdAt: new Date(),
    };

    const result = await usersCollection.insertOne(newUser);
    res.send(result);
  } catch (error) {
    res.status(500).send({ message: "Failed to create user" });
  }
});

app.get("/users",verifyJWT, async (req, res) => {
  const result = await usersCollection.find().sort({ createdAt: -1 }).toArray();
  res.send(result);
});

app.get("/users/:email", async (req, res) => {
  const user = await usersCollection.findOne({ email: req.params.email });
  res.send(user);
});

app.patch("/users/:id", async (req, res) => {
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
  const doctor = await doctorsCollection.findOne({
    _id: new ObjectId(req.params.id),
  });
  res.send(doctor);
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

app.get("/appointments", verifyJWT,async (req, res) => {
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
  try {
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
  const result = await appointmentsCollection.deleteOne({
    _id: new ObjectId(req.params.id),
  });

  res.send(result);
});

/* REVIEWS */
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

/* PRESCRIPTIONS */
app.post("/prescriptions", async (req, res) => {
  try {
    const prescription = req.body;

    const newPrescription = {
      ...prescription,
      createdAt: new Date(),
    };

    const result = await prescriptionsCollection.insertOne(newPrescription);

    if (prescription.appointmentId) {
      await appointmentsCollection.updateOne(
        { _id: new ObjectId(prescription.appointmentId) },
        {
          $set: {
            appointmentStatus: "completed",
          },
        }
      );
    }

    res.send({
      message: "Prescription created and appointment completed",
      insertedId: result.insertedId,
    });
  } catch (error) {
    console.log("Prescription create error:", error);
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
  const payment = req.body;

  const newPayment = {
    ...payment,
    paymentStatus: "paid",
    paymentDate: new Date(),
  };

  const result = await paymentsCollection.insertOne(newPayment);

  if (payment.appointmentId) {
    await appointmentsCollection.updateOne(
      { _id: new ObjectId(payment.appointmentId) },
      {
        $set: {
          paymentStatus: "paid",
        },
      }
    );
  }

  res.send(result);
});

app.get("/payments", verifyJWT,async (req, res) => {
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

    if (!existingPayment) {
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
    }

    await appointmentsCollection.updateOne(
      { _id: new ObjectId(appointmentId) },
      {
        $set: {
          paymentStatus: "paid",
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

/* DASHBOARD STATS */
app.get("/dashboard-stats",verifyJWT, async (req, res) => {
  const totalUsers = await usersCollection.countDocuments();
  const totalDoctors = await doctorsCollection.countDocuments();
  const totalPatients = await usersCollection.countDocuments({
    role: "patient",
  });
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