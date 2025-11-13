const mongoose = require('mongoose');

const otpSchema = new mongoose.Schema(
  {
    phone: {
      type: String,
      required: true,
      index: true,
    },
    otp: {
      type: String,
      required: true,
    },
    attempts: {
      type: Number,
      default: 0,
    },
    verified: {
      type: Boolean,
      default: false,
    },
    expiresAt: {
      type: Date,
      required: true,
      index: { expires: 0 }, // TTL index - MongoDB will auto-delete after expiresAt
    },
  },
  {
    timestamps: true,
  }
);

// Indexes
otpSchema.index({ phone: 1, createdAt: -1 });

// Method to check if OTP is expired
otpSchema.methods.isExpired = function () {
  return Date.now() > this.expiresAt;
};

// Method to increment attempts
otpSchema.methods.incrementAttempts = async function () {
  this.attempts += 1;
  await this.save();
};

const OTP = mongoose.model('OTP', otpSchema);

module.exports = OTP;