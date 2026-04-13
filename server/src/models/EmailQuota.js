import mongoose from 'mongoose';

const emailQuotaSchema = new mongoose.Schema({
  date: {
    type: String, // Format: YYYY-MM-DD
    required: true,
    unique: true,
    index: true
  },
  // Map of accountIndex (as string) to sent count for that day
  usage: {
    type: Map,
    of: Number,
    default: {}
  },
  lastUpdated: {
    type: Date,
    default: Date.now
  }
}, {
  timestamps: true
});

const EmailQuota = mongoose.model('EmailQuota', emailQuotaSchema);

export default EmailQuota;
