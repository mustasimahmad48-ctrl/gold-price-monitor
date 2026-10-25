"use strict";

const mongoose = require("mongoose");
const env = require("./env");

let connectionPromise = null;
let databaseErrorListenerAttached = false;

async function connectMongoDB() {
  if (!env.MONGODB_URI) {
    console.log("MongoDB is not configured; running without a database.");
    return null;
  }

  if (mongoose.connection.readyState === 1) {
    return mongoose.connection;
  }

  if (connectionPromise) {
    return connectionPromise;
  }

  connectionPromise = (async () => {
    try {
      await mongoose.connect(env.MONGODB_URI, {
        serverSelectionTimeoutMS: 10000,
        connectTimeoutMS: 10000,
      });

      if (!databaseErrorListenerAttached) {
        mongoose.connection.on("error", (error) => {
          console.error("MongoDB connection error:", error.message);
        });
        databaseErrorListenerAttached = true;
      }

      console.log("MongoDB connected successfully.");
      return mongoose.connection;
    } catch (error) {
      console.error("MongoDB connection failed:", error.message);
      throw error;
    } finally {
      connectionPromise = null;
    }
  })();

  return connectionPromise;
}

async function disconnectMongoDB() {
  if (connectionPromise) {
    try {
      await connectionPromise;
    } catch {
      // Connection failure is already logged by connectMongoDB.
    }
  }

  if (mongoose.connection.readyState !== 0) {
    await mongoose.disconnect();
  }
}

function isMongoDBConnected() {
  return mongoose.connection.readyState === 1;
}

module.exports = {
  connectMongoDB,
  disconnectMongoDB,
  isMongoDBConnected,
};
