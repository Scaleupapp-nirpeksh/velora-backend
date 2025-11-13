// src/models/User.js

const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const userSchema = new mongoose.Schema(
  {
    phone: {
      type: String,
      required: [true, 'Phone number is required'],
      unique: true,  // ✅ Creates index automatically
      trim: true,
      match: [/^\+?[1-9]\d{1,14}$/, 'Please provide a valid phone number'],
    },
    phoneVerified: {
      type: Boolean,
      default: false,
    },
    dateOfBirth: {
      type: Date,
    },
    firstName: {
      type: String,
      trim: true,
      maxlength: [50, 'First name cannot exceed 50 characters'],
    },
    lastName: {
      type: String,
      trim: true,
      maxlength: [50, 'Last name cannot exceed 50 characters'],
    },
    email: {
      type: String,
      trim: true,
      lowercase: true,
      match: [/^\S+@\S+\.\S+$/, 'Please provide a valid email'],
    },
    location: {
      city: {
        type: String,
        trim: true,
      },
      coordinates: {
        type: [Number], // [longitude, latitude]
        index: '2dsphere',  // ✅ Creates geospatial index automatically
      },
    },
    gender: {
      type: String,
      enum: ['male', 'female', 'other'],
    },
    interestedIn: {
      type: String,
      enum: ['men', 'women', 'everyone'],
    },
    username: {
      type: String,
      unique: true,  // ✅ Creates index automatically
      sparse: true, // Allow null but unique when set
      trim: true,
      lowercase: true,
      minlength: [3, 'Username must be at least 3 characters'],
      maxlength: [30, 'Username cannot exceed 30 characters'],
      match: [/^[a-zA-Z0-9_]+$/, 'Username can only contain letters, numbers, and underscores'],
    },
    bio: {
      text: {
        type: String,
        maxlength: [500, 'Bio cannot exceed 500 characters'],
      },
      audioUrl: String,
      audioDuration: Number,
    },
    profilePhoto: String,
    photos: {
      type: [String],
      validate: [arrayLimit, 'Cannot upload more than 6 photos'],
    },
    questionsAnswered: {
      type: Number,
      default: 0,
    },
    isPremium: {
      type: Boolean,
      default: false,
    },
    premiumExpiry: Date,
    isActive: {
      type: Boolean,
      default: true,
    },
    isBanned: {
      type: Boolean,
      default: false,
    },
    banReason: String,
    fcmToken: String, // For push notifications
    lastActive: {
      type: Date,
      default: Date.now,
    },
    refreshToken: String, // Store hashed refresh token
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

// Custom validator for photos array length
function arrayLimit(val) {
  return val.length <= 6;
}

// Indexes - ONLY compound indexes (phone, username, coordinates already indexed above)
userSchema.index({ isActive: 1, isBanned: 1 });
userSchema.index({ createdAt: -1 });

// Virtual for full name
userSchema.virtual('fullName').get(function () {
  if (this.firstName && this.lastName) {
    return `${this.firstName} ${this.lastName}`;
  }
  return this.firstName || this.username || 'Anonymous';
});

// Method to check if profile is complete
userSchema.methods.isProfileComplete = function () {
  return !!(
    this.firstName &&
    this.gender &&
    this.interestedIn &&
    this.username &&
    this.profilePhoto &&
    this.questionsAnswered >= 25
  );
};

// Method to update last active
userSchema.methods.updateLastActive = async function () {
  this.lastActive = Date.now();
  await this.save({ validateBeforeSave: false });
};

// Hash refresh token before saving
userSchema.pre('save', async function (next) {
  if (!this.isModified('refreshToken') || !this.refreshToken) {
    return next();
  }
  
  this.refreshToken = await bcrypt.hash(this.refreshToken, 10);
  next();
});

// Method to compare refresh tokens
userSchema.methods.compareRefreshToken = async function (token) {
  if (!this.refreshToken) return false;
  return await bcrypt.compare(token, this.refreshToken);
};

// Don't return sensitive fields in JSON
userSchema.methods.toJSON = function () {
  const user = this.toObject();
  delete user.refreshToken;
  delete user.__v;
  return user;
};

const User = mongoose.model('User', userSchema);

module.exports = User;