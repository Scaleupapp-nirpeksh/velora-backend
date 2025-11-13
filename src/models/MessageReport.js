const mongoose = require('mongoose');

/**
 * MessageReport Model
 * Tracks reported messages for moderation
 */
const messageReportSchema = new mongoose.Schema(
  {
    // Message being reported
    messageId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Message',
      required: true,
      index: true,
    },

    // Conversation containing the message
    conversationId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Conversation',
      required: true,
      index: true,
    },

    // User who reported the message
    reportedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },

    // User who sent the reported message
    reportedUser: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },

    // ==================== REPORT DETAILS ====================

    // Primary reason for report
    reason: {
      type: String,
      enum: [
        'spam',
        'inappropriate_content',
        'harassment',
        'hate_speech',
        'violence',
        'sexual_content',
        'fake_profile',
        'underage',
        'self_harm',
        'other',
      ],
      required: true,
    },

    // Sub-category for more specific classification
    subReason: {
      type: String,
      enum: [
        // Spam sub-reasons
        'commercial_spam',
        'bot_behavior',
        'repetitive_messages',
        
        // Inappropriate sub-reasons
        'explicit_images',
        'offensive_language',
        'unsolicited_images',
        
        // Harassment sub-reasons
        'threats',
        'stalking',
        'bullying',
        'doxxing',
        
        // Other
        'scam_attempt',
        'impersonation',
        'copyright_violation',
      ],
      default: null,
    },

    // Additional details from reporter
    description: {
      type: String,
      maxlength: 1000,
      default: null,
    },

    // Screenshot or evidence URLs
    evidence: [
      {
        url: String,
        type: {
          type: String,
          enum: ['screenshot', 'chat_export', 'other'],
        },
        uploadedAt: {
          type: Date,
          default: Date.now,
        },
      },
    ],

    // ==================== MESSAGE SNAPSHOT ====================
    
    // Snapshot of the message at time of report (in case it's deleted)
    messageSnapshot: {
      type: {
        type: String,
        enum: ['text', 'photo', 'voice', 'system', 'ice_breaker'],
      },
      text: String,
      mediaUrl: String,
      sentAt: Date,
      senderId: mongoose.Schema.Types.ObjectId,
    },

    // ==================== MODERATION STATUS ====================

    // Current status of the report
    status: {
      type: String,
      enum: [
        'pending',
        'under_review',
        'action_taken',
        'dismissed',
        'escalated',
        'auto_resolved',
      ],
      default: 'pending',
      index: true,
    },

    // Priority level for review queue
    priority: {
      type: String,
      enum: ['low', 'medium', 'high', 'urgent'],
      default: 'medium',
      index: true,
    },

    // Action taken on the report
    actionTaken: {
      type: String,
      enum: [
        'none',
        'warning_issued',
        'message_deleted',
        'user_suspended',
        'user_banned',
        'conversation_blocked',
        'referred_to_legal',
      ],
      default: 'none',
    },

    // ==================== REVIEW DETAILS ====================

    // Admin/moderator who reviewed
    reviewedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },

    reviewedAt: {
      type: Date,
      default: null,
    },

    // Review notes from moderator
    reviewNotes: {
      type: String,
      maxlength: 2000,
      default: null,
    },

    // Time taken to review (in hours)
    reviewTime: {
      type: Number,
      default: null,
    },

    // ==================== AUTOMATED DETECTION ====================

    // Was this auto-flagged by AI?
    isAutoFlagged: {
      type: Boolean,
      default: false,
    },

    // AI confidence score (0-100)
    aiConfidenceScore: {
      type: Number,
      min: 0,
      max: 100,
      default: null,
    },

    // AI detected categories
    aiDetectedCategories: [
      {
        category: String,
        confidence: Number,
      },
    ],

    // ==================== USER IMPACT ====================

    // Previous reports against this user
    reportedUserViolationCount: {
      type: Number,
      default: 0,
    },

    // Is this user a repeat offender?
    isRepeatOffender: {
      type: Boolean,
      default: false,
    },

    // Previous reports by the reporter
    reporterReportCount: {
      type: Number,
      default: 0,
    },

    // Is reporter potentially abusing the system?
    isPotentialFalseReport: {
      type: Boolean,
      default: false,
    },

    // ==================== FOLLOW-UP ====================

    // Was the reporter notified of the outcome?
    reporterNotified: {
      type: Boolean,
      default: false,
    },

    reporterNotifiedAt: {
      type: Date,
      default: null,
    },

    // Was the reported user notified?
    reportedUserNotified: {
      type: Boolean,
      default: false,
    },

    reportedUserNotifiedAt: {
      type: Date,
      default: null,
    },

    // Appeal status (if user appeals the action)
    appealStatus: {
      type: String,
      enum: ['none', 'pending', 'approved', 'rejected'],
      default: 'none',
    },

    appealReason: {
      type: String,
      default: null,
    },

    appealReviewedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
  },
  {
    timestamps: true,
  }
);

// ==================== INDEXES ====================

// Index for finding reports by status and priority
messageReportSchema.index({ status: 1, priority: -1, createdAt: 1 });

// Index for finding reports by user
messageReportSchema.index({ reportedUser: 1, createdAt: -1 });

// Index for finding reports by reporter
messageReportSchema.index({ reportedBy: 1, createdAt: -1 });

// Index for moderation queue
messageReportSchema.index({ status: 1, isAutoFlagged: 1, priority: -1 });

// ==================== STATIC METHODS ====================

/**
 * Create a report with smart prioritization
 */
messageReportSchema.statics.createReport = async function ({
  messageId,
  conversationId,
  reportedBy,
  reportedUser,
  reason,
  subReason = null,
  description = null,
}) {
  // Get the message being reported
  const Message = mongoose.model('Message');
  const message = await Message.findById(messageId);
  
  if (!message) {
    throw new Error('Message not found');
  }

  // Create snapshot of the message
  const messageSnapshot = {
    type: message.type,
    text: message.text,
    mediaUrl: message.media?.url,
    sentAt: message.createdAt,
    senderId: message.senderId,
  };

  // Check reporter's history
  const reporterReportCount = await this.countDocuments({ reportedBy });
  const isPotentialFalseReport = reporterReportCount > 10; // Flag if excessive reports

  // Check reported user's history
  const reportedUserViolationCount = await this.countDocuments({
    reportedUser,
    status: 'action_taken',
  });
  const isRepeatOffender = reportedUserViolationCount >= 2;

  // Determine priority
  let priority = 'medium';
  if (['hate_speech', 'violence', 'self_harm', 'underage'].includes(reason)) {
    priority = 'urgent';
  } else if (isRepeatOffender) {
    priority = 'high';
  } else if (isPotentialFalseReport) {
    priority = 'low';
  }

  // Create the report
  const report = await this.create({
    messageId,
    conversationId,
    reportedBy,
    reportedUser,
    reason,
    subReason,
    description,
    messageSnapshot,
    priority,
    reporterReportCount,
    isPotentialFalseReport,
    reportedUserViolationCount,
    isRepeatOffender,
  });

  // Update the message
  await message.report(reportedBy, reason);

  // Auto-escalate if urgent
  if (priority === 'urgent') {
    await report.escalate();
  }

  return report;
};

/**
 * Get moderation queue
 */
messageReportSchema.statics.getModerationQueue = async function (options = {}) {
  const {
    status = 'pending',
    priority = null,
    page = 1,
    limit = 20,
  } = options;

  const skip = (page - 1) * limit;
  const query = { status };

  if (priority) {
    query.priority = priority;
  }

  const reports = await this.find(query)
    .sort({ priority: -1, createdAt: 1 }) // Urgent first, then oldest
    .skip(skip)
    .limit(limit)
    .populate('reportedBy', 'firstName lastName')
    .populate('reportedUser', 'firstName lastName profilePhoto')
    .populate('messageId')
    .lean();

  const total = await this.countDocuments(query);

  return {
    reports,
    total,
    page,
    totalPages: Math.ceil(total / limit),
    hasMore: skip + reports.length < total,
  };
};

/**
 * Get user violation history
 */
messageReportSchema.statics.getUserViolations = async function (userId) {
  const reports = await this.find({
    reportedUser: userId,
    status: 'action_taken',
  })
    .sort({ createdAt: -1 })
    .populate('messageId', 'type text')
    .lean();

  return reports;
};

/**
 * Auto-resolve old dismissed reports (for cleanup)
 */
messageReportSchema.statics.autoResolveOldReports = async function () {
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

  const result = await this.updateMany(
    {
      status: 'dismissed',
      createdAt: { $lt: thirtyDaysAgo },
    },
    {
      status: 'auto_resolved',
    }
  );

  return result.modifiedCount;
};

// ==================== INSTANCE METHODS ====================

/**
 * Review and take action on report
 */
messageReportSchema.methods.review = async function (
  reviewerId,
  action,
  notes = null
) {
  this.status = 'action_taken';
  this.actionTaken = action;
  this.reviewedBy = reviewerId;
  this.reviewedAt = new Date();
  this.reviewNotes = notes;
  this.reviewTime = (Date.now() - this.createdAt.getTime()) / (1000 * 60 * 60); // Hours

  await this.save();

  // Take action based on decision
  switch (action) {
    case 'message_deleted':
      const Message = mongoose.model('Message');
      const message = await Message.findById(this.messageId);
      if (message) {
        await message.softDelete(reviewerId, true);
      }
      break;

    case 'user_suspended':
    case 'user_banned':
      const User = mongoose.model('User');
      await User.findByIdAndUpdate(this.reportedUser, {
        isBanned: action === 'user_banned',
        isSuspended: action === 'user_suspended',
        suspendedUntil: action === 'user_suspended' 
          ? new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) // 7 days
          : null,
      });
      break;

    case 'conversation_blocked':
      const Block = mongoose.model('Block');
      await Block.createBlock({
        blockerId: this.reportedBy,
        blockedUserId: this.reportedUser,
        conversationId: this.conversationId,
        reason: 'safety_concern',
      });
      break;
  }

  return this;
};

/**
 * Dismiss report
 */
messageReportSchema.methods.dismiss = async function (reviewerId, notes = null) {
  this.status = 'dismissed';
  this.actionTaken = 'none';
  this.reviewedBy = reviewerId;
  this.reviewedAt = new Date();
  this.reviewNotes = notes;
  this.reviewTime = (Date.now() - this.createdAt.getTime()) / (1000 * 60 * 60);

  await this.save();
  return this;
};

/**
 * Escalate report
 */
messageReportSchema.methods.escalate = async function () {
  this.status = 'escalated';
  this.priority = 'urgent';
  await this.save();

  // Here you could add logic to notify admins
  // Send push notification, email, etc.

  return this;
};

/**
 * Notify reporter of outcome
 */
messageReportSchema.methods.notifyReporter = async function (message) {
  this.reporterNotified = true;
  this.reporterNotifiedAt = new Date();
  await this.save();

  // Here you would send actual notification
  // Via push notification, in-app message, etc.

  return this;
};

module.exports = mongoose.model('MessageReport', messageReportSchema);