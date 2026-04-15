import mongoose from 'mongoose';
import logger from '../utils/logger.js';

const connectDB = async (retryCount = 5) => {
  try {
    const conn = await mongoose.connect(process.env.MONGODB_URI, {
      maxPoolSize: 10,        
      minPoolSize: 2,         
      serverSelectionTimeoutMS: 5000,
      socketTimeoutMS: 45000,
      family: 4, 
    });

    logger.info(`MongoDB Connected: ${conn.connection.host}`);
    return true;
  } catch (err) {
    if (retryCount > 0) {
      const waitTime = Math.min(10000, Math.pow(2, 5 - retryCount) * 1000);
      logger.warn(`MongoDB Connection Failed. Retrying in ${waitTime/1000}s... (${err.message})`);
      
      // Await the delay before retrying to keep the flow synchronous
      await new Promise(resolve => setTimeout(resolve, waitTime));
      return connectDB(retryCount - 1);
    } else {
      logger.error(`Critical: MongoDB Connection failed after 5 attempts: ${err.message}`);
      logger.info('TIP: Check your MongoDB Atlas IP Whitelist or usage of SRV connection string.');
      process.exit(1);
    }
  }
};

export default connectDB;
