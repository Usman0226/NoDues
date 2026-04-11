import mongoose from 'mongoose';
import logger from '../utils/logger.js';

const connectDB = async () => {
  try {
    const conn = await mongoose.connect(process.env.MONGODB_URI, {
      maxPoolSize: 10,        // max 10 concurrent DB connections
      minPoolSize: 2,         // keep 2 warm connections alive—cold-start requests don't wait
      serverSelectionTimeoutMS: 5000,
      socketTimeoutMS: 45000,
    });

    logger.info(`MongoDB Connected: ${conn.connection.host}`);
  } catch (err) {
    logger.error(`Error connecting to MongoDB: ${err.message}`);
    process.exit(1);
  }
};

export default connectDB;
