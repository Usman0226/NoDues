import mongoose from 'mongoose';
import logger from '../utils/logger.js';

const connectDB = async (retryCount = 5) => {
  try {
    const conn = await mongoose.connect(process.env.MONGODB_URI, {
      maxPoolSize: 10,        
      minPoolSize: 2,         
      serverSelectionTimeoutMS: 10000, // Increased to handle flaky DNS on shared tiers
      socketTimeoutMS: 45000,
      family: 4, 
    });

    logger.info(`MongoDB Connected: ${conn.connection.host}`);
    return true;
  } catch (err) {
    // Specific diagnostic tips for common connection issues
    let tip = '';
    if (err.message.includes('ENOTFOUND')) {
      tip = 'DNS Error: Your server cannot resolve the MongoDB Atlas hostname. Check your VM DNS settings.';
    } else if (err.message.includes('ECONNREFUSED') || err.message.includes('ETIMEDOUT')) {
      tip = 'Connection Error: Check if MongoDB Atlas IP Whitelist (0.0.0.0/0 recommended for Azure) or Firewall allows port 27017.';
    } else if (err.message.includes('cert') || err.message.includes('SSL')) {
      tip = 'SSL Error: Check if your server has CA certificates installed (ca-certificates).';
    }

    if (retryCount > 0) {
      const waitTime = Math.min(10000, Math.pow(2, 5 - retryCount) * 1000);
      logger.warn(`MongoDB Connection Failed. ${tip ? `[${tip}] ` : ''}Retrying in ${waitTime/1000}s... (${err.message})`);
      
      await new Promise(resolve => setTimeout(resolve, waitTime));
      return connectDB(retryCount - 1);
    } else {
      logger.error(`Critical: MongoDB Connection failed after 5 attempts: ${err.message}`);
      if (tip) logger.info(`TROUBLESHOOTING TIP: ${tip}`);
      process.exit(1);
    }
  }
};

export default connectDB;
