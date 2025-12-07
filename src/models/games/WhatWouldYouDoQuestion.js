// src/models/games/WhatWouldYouDoQuestion.js

const mongoose = require('mongoose');

/**
 * WHAT WOULD YOU DO - QUESTION MODEL
 * 
 * 15 scenario-based questions to assess "marriage material" compatibility.
 * Users respond via voice notes, AI transcribes and analyzes.
 * 
 * Categories:
 * - trust_honesty: Financial honesty, boundary violations, transparency
 * - communication: Conflict resolution, apologies, difficult conversations
 * - respect: Public behavior, success handling, boundary respect
 * - values: Friend circles, family loyalty, future planning
 * - intimacy: Physical boundaries, intimacy communication
 * - control_flags: Jealousy, social media, manipulation patterns
 */

const whatWouldYouDoQuestionSchema = new mongoose.Schema({
  questionNumber: {
    type: Number,
    required: true,
    unique: true,
    min: 1,
    max: 15
  },

  category: {
    type: String,
    required: true,
    enum: [
      'trust_honesty',
      'communication', 
      'respect',
      'values',
      'intimacy',
      'control_flags'
    ]
  },

  scenarioText: {
    type: String,
    required: true,
    maxlength: 1000
  },

  // What this question reveals about compatibility
  insight: {
    type: String,
    required: true,
    maxlength: 500
  },

  // The core question being answered
  coreQuestion: {
    type: String,
    required: true,
    maxlength: 200
  },

  // Intensity level (2-4 peppers)
  intensity: {
    type: Number,
    required: true,
    min: 2,
    max: 4
  },

  // Suggested voice note duration in seconds
  suggestedDuration: {
    type: Number,
    default: 60,
    min: 30,
    max: 120
  },

  // For AI analysis - key themes to look for in responses
  analysisHints: [{
    type: String
  }],

  isActive: {
    type: Boolean,
    default: true
  }

}, {
  timestamps: true
});

// =====================================================
// INDEXES
// =====================================================

whatWouldYouDoQuestionSchema.index({ questionNumber: 1 });
whatWouldYouDoQuestionSchema.index({ category: 1 });
whatWouldYouDoQuestionSchema.index({ isActive: 1 });

// =====================================================
// STATIC METHODS
// =====================================================

/**
 * Get all active questions sorted by number
 */
whatWouldYouDoQuestionSchema.statics.getAllActive = function() {
  return this.find({ isActive: true }).sort({ questionNumber: 1 });
};

/**
 * Get questions by category
 */
whatWouldYouDoQuestionSchema.statics.getByCategory = function(category) {
  return this.find({ category, isActive: true }).sort({ questionNumber: 1 });
};

/**
 * Get questions for a game (all 15 in order)
 */
whatWouldYouDoQuestionSchema.statics.getGameQuestions = function() {
  return this.find({ isActive: true })
    .sort({ questionNumber: 1 })
    .select('questionNumber category scenarioText insight coreQuestion intensity suggestedDuration');
};

/**
 * Get a specific question by number
 */
whatWouldYouDoQuestionSchema.statics.getByNumber = function(questionNumber) {
  return this.findOne({ questionNumber, isActive: true });
};

/**
 * Get category metadata
 */
whatWouldYouDoQuestionSchema.statics.getCategoryInfo = function() {
  return {
    trust_honesty: {
      name: 'Trust & Honesty',
      emoji: '🔐',
      description: 'Are they honest? Do they hide things?',
      color: '#3B82F6'
    },
    communication: {
      name: 'Communication',
      emoji: '💬',
      description: 'How do they handle conflict and hard conversations?',
      color: '#8B5CF6'
    },
    respect: {
      name: 'Respect',
      emoji: '🤝',
      description: 'Do they respect you publicly and privately?',
      color: '#10B981'
    },
    values: {
      name: 'Values & Priorities',
      emoji: '⚖️',
      description: 'What matters to them? Where do you stand?',
      color: '#F59E0B'
    },
    intimacy: {
      name: 'Intimacy',
      emoji: '💕',
      description: 'Can they communicate about physical and emotional intimacy?',
      color: '#EC4899'
    },
    control_flags: {
      name: 'Red Flag Radar',
      emoji: '🚩',
      description: 'Spotting control, manipulation, and jealousy',
      color: '#EF4444'
    }
  };
};

/**
 * Get all 15 seed questions
 */
whatWouldYouDoQuestionSchema.statics.getSeedData = function() {
  return [
    // =====================================================
    // TRUST & HONESTY (Q1-Q2)
    // =====================================================
    {
      questionNumber: 1,
      category: 'trust_honesty',
      scenarioText: "You find out your partner has ₹5 lakh in credit card debt they never mentioned. When you ask, they say 'it's not a big deal, I'll handle it.' How does this make you feel and what do you do?",
      insight: 'Reveals expectations around financial transparency and how they handle hidden truths',
      coreQuestion: 'Are they financially responsible and honest?',
      intensity: 2,
      suggestedDuration: 60,
      analysisHints: ['financial honesty', 'trust', 'communication about money', 'dealbreaker assessment', 'forgiveness vs accountability']
    },
    {
      questionNumber: 2,
      category: 'trust_honesty',
      scenarioText: "You discover your partner still talks to their ex regularly and never told you. They say it's purely friendly and 'didn't want to make you insecure.' What's your reaction?",
      insight: 'Tests boundaries around exes, transparency expectations, and trust foundations',
      coreQuestion: 'Do they keep things from you "for your own good"?',
      intensity: 3,
      suggestedDuration: 60,
      analysisHints: ['transparency', 'ex boundaries', 'trust', 'communication', 'insecurity handling']
    },

    // =====================================================
    // COMMUNICATION (Q3-Q5)
    // =====================================================
    {
      questionNumber: 3,
      category: 'communication',
      scenarioText: "You had a genuine disagreement. Instead of talking it out, your partner gave you silent treatment for 3 days and then acted like nothing happened. How do you address this pattern?",
      insight: 'Reveals conflict resolution style and emotional maturity expectations',
      coreQuestion: 'Can they handle conflict like an adult?',
      intensity: 2,
      suggestedDuration: 60,
      analysisHints: ['conflict resolution', 'emotional maturity', 'communication style', 'pattern recognition', 'dealbreaker assessment']
    },
    {
      questionNumber: 4,
      category: 'communication',
      scenarioText: "Your partner said something hurtful. Instead of apologizing, they said 'I was just joking, you're too sensitive.' This happens often. How do you address this?",
      insight: 'Tests accountability expectations and emotional intelligence',
      coreQuestion: 'Do they take responsibility or deflect?',
      intensity: 3,
      suggestedDuration: 60,
      analysisHints: ['accountability', 'gaslighting awareness', 'emotional intelligence', 'pattern tolerance', 'self-respect']
    },
    {
      questionNumber: 5,
      category: 'communication',
      scenarioText: "You try to have an honest conversation about physical expectations, boundaries, or past experiences. Your partner either shuts down completely, gets awkward and changes the topic, or judges you for even bringing it up. What do you do?",
      insight: 'Reveals maturity around difficult conversations and intimacy communication',
      coreQuestion: 'Can they talk about hard things?',
      intensity: 3,
      suggestedDuration: 60,
      analysisHints: ['intimacy communication', 'maturity', 'judgment', 'openness', 'compatibility in communication style']
    },

    // =====================================================
    // RESPECT (Q6-Q8)
    // =====================================================
    {
      questionNumber: 6,
      category: 'respect',
      scenarioText: "Your partner went through your phone while you were asleep. When confronted, they said 'If you have nothing to hide, why do you care?' What happens next?",
      insight: 'Tests boundary respect, privacy expectations, and trust dynamics',
      coreQuestion: 'Do they respect your boundaries?',
      intensity: 3,
      suggestedDuration: 60,
      analysisHints: ['privacy', 'boundaries', 'trust', 'accountability', 'manipulation recognition']
    },
    {
      questionNumber: 7,
      category: 'respect',
      scenarioText: "In front of their family, your partner dismisses your opinions and talks over you. Later they say, 'I have to act a certain way around them, you know how they are.' How do you handle this?",
      insight: 'Reveals public vs private treatment and whether they defend you',
      coreQuestion: 'Are they the same person everywhere?',
      intensity: 3,
      suggestedDuration: 60,
      analysisHints: ['public respect', 'consistency', 'family dynamics', 'having your back', 'self-respect']
    },
    {
      questionNumber: 8,
      category: 'respect',
      scenarioText: "You get a huge career win—better job, higher salary than theirs, public recognition. Instead of celebrating, your partner seems distant or makes small comments that undermine it. What do you do?",
      insight: 'Tests ego, insecurity, and ability to celebrate your success',
      coreQuestion: 'Can they handle you being successful?',
      intensity: 2,
      suggestedDuration: 60,
      analysisHints: ['ego', 'insecurity', 'support', 'equality', 'celebration vs competition']
    },

    // =====================================================
    // VALUES & PRIORITIES (Q9-Q11)
    // =====================================================
    {
      questionNumber: 9,
      category: 'values',
      scenarioText: "Your partner's parents don't approve of you—maybe your background, caste, profession, or family status. Your partner says they love you but need 'time to convince them.' It's been 6 months. Nothing has changed. What do you need from them?",
      insight: 'Reveals whether they will fight for you or let family decide',
      coreQuestion: 'Will they choose you?',
      intensity: 3,
      suggestedDuration: 90,
      analysisHints: ['family loyalty', 'commitment', 'action vs words', 'timeline expectations', 'self-worth']
    },
    {
      questionNumber: 10,
      category: 'values',
      scenarioText: "Your partner's closest friends make you uncomfortable—they're disrespectful to women, or drink too much, or gossip about everyone. Your partner says 'that's just how they are, I'm not like them.' Is this a problem for you?",
      insight: 'Tests values alignment—you are who you surround yourself with',
      coreQuestion: 'What do their friendships reveal about them?',
      intensity: 2,
      suggestedDuration: 60,
      analysisHints: ['values', 'friend circle', 'character judgment', 'influence', 'boundaries']
    },
    {
      questionNumber: 11,
      category: 'values',
      scenarioText: "You're getting serious, but your partner avoids conversations about the future—where to live, kids, finances, career plans. They say 'let's just enjoy the present, why stress?' How do you handle this?",
      insight: 'Reveals commitment readiness and future alignment',
      coreQuestion: 'Are they serious about a future with you?',
      intensity: 3,
      suggestedDuration: 60,
      analysisHints: ['commitment', 'future planning', 'avoidance patterns', 'compatibility', 'timeline alignment']
    },

    // =====================================================
    // CONTROL FLAGS (Q12-Q14)
    // =====================================================
    {
      questionNumber: 12,
      category: 'control_flags',
      scenarioText: "Your partner gets upset when you spend time with your friends, especially if they're of the opposite gender. They call it 'caring' and 'loving you too much.' What's your take on this?",
      insight: 'Identifies jealousy and control disguised as love',
      coreQuestion: 'Is this love or control?',
      intensity: 3,
      suggestedDuration: 60,
      analysisHints: ['jealousy', 'control', 'trust', 'independence', 'red flag recognition']
    },
    {
      questionNumber: 13,
      category: 'control_flags',
      scenarioText: "Your partner posts everything about your relationship online—photos, details, even hints about fights. When you ask for privacy, they say 'if you loved me, you'd want to show it.' What do you do?",
      insight: 'Tests privacy respect and emotional manipulation recognition',
      coreQuestion: 'Do they respect your need for privacy?',
      intensity: 2,
      suggestedDuration: 60,
      analysisHints: ['privacy', 'social media boundaries', 'manipulation', 'respect', 'guilt-tripping recognition']
    },
    {
      questionNumber: 14,
      category: 'control_flags',
      scenarioText: "Your partner is offered a big promotion, but it means 70-hour work weeks for the next 2 years. They're excited and didn't really ask how you feel about barely seeing them. How do you respond?",
      insight: 'Reveals whether they consider you in big decisions',
      coreQuestion: 'Are you part of their decisions?',
      intensity: 2,
      suggestedDuration: 60,
      analysisHints: ['partnership', 'decision making', 'priorities', 'consideration', 'communication expectations']
    },

    // =====================================================
    // INTIMACY (Q15)
    // =====================================================
    {
      questionNumber: 15,
      category: 'intimacy',
      scenarioText: "Your partner keeps pushing for physical intimacy faster than you're comfortable with. When you say you want to wait, they say 'If you really loved me, you wouldn't make me wait' or sulk about it. How do you respond?",
      insight: 'Tests consent understanding, boundary respect, and manipulation recognition',
      coreQuestion: 'Do they respect your physical boundaries?',
      intensity: 4,
      suggestedDuration: 60,
      analysisHints: ['consent', 'boundaries', 'manipulation', 'pressure', 'respect', 'dealbreaker assessment']
    }
  ];
};

// =====================================================
// MODEL EXPORT
// =====================================================

const WhatWouldYouDoQuestion = mongoose.model('WhatWouldYouDoQuestion', whatWouldYouDoQuestionSchema);

module.exports = WhatWouldYouDoQuestion;