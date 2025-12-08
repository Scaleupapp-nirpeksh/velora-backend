// src/scripts/seedDreamBoard.js

/**
 * DREAM BOARD SEED SCRIPT
 * 
 * Seeds the 10 life categories with 40 vision cards for the Dream Board game.
 * 
 * Run: node src/scripts/seedDreamBoard.js
 */

require('dotenv').config();
const mongoose = require('mongoose');
const DreamBoardCategory = require('../models/games/DreamBoardCategory');

const categories = [
  // =====================================================
  // CATEGORY 1: OUR HOME
  // =====================================================
  {
    categoryNumber: 1,
    categoryId: 'our_home',
    title: 'Our Home',
    emoji: '🏠',
    question: 'Where do you see us building our life together?',
    insight: 'Where you live shapes daily routines, social life, and sense of belonging. Alignment here affects lifestyle compatibility.',
    analysisHints: ['urban vs rural', 'stability vs adventure', 'space vs convenience'],
    cards: [
      {
        cardId: 'A',
        emoji: '🏙️',
        title: 'City Heartbeat',
        subtitle: 'High-rise living with urban energy'
      },
      {
        cardId: 'B',
        emoji: '🏡',
        title: 'Suburb Sweet Spot',
        subtitle: 'A home with a garden and peaceful streets'
      },
      {
        cardId: 'C',
        emoji: '🌳',
        title: 'Small Town Roots',
        subtitle: 'Simple living where everyone knows your name'
      },
      {
        cardId: 'D',
        emoji: '🌍',
        title: 'Wherever Life Takes Us',
        subtitle: 'Home is where we are together'
      }
    ]
  },

  // =====================================================
  // CATEGORY 2: OUR FAMILY
  // =====================================================
  {
    categoryNumber: 2,
    categoryId: 'our_family',
    title: 'Our Family',
    emoji: '👨‍👩‍👧‍👦',
    question: 'What does family look like for us?',
    insight: 'Family planning is foundational. Different visions here need early, honest conversation.',
    analysisHints: ['children preference', 'family size', 'parenting readiness'],
    cards: [
      {
        cardId: 'A',
        emoji: '👶',
        title: 'One Little Star',
        subtitle: 'One child to pour all our love into'
      },
      {
        cardId: 'B',
        emoji: '👨‍👩‍👧‍👦',
        title: 'Full House',
        subtitle: 'A home full of little feet (2-3 kids)'
      },
      {
        cardId: 'C',
        emoji: '🐕',
        title: 'Fur Babies Only',
        subtitle: 'Our pets are our children'
      },
      {
        cardId: 'D',
        emoji: '🤷',
        title: "Let's See What Happens",
        subtitle: 'Open to whatever life brings'
      }
    ]
  },

  // =====================================================
  // CATEGORY 3: OUR CAREERS
  // =====================================================
  {
    categoryNumber: 3,
    categoryId: 'our_careers',
    title: 'Our Careers',
    emoji: '💼',
    question: 'How do we balance ambition and life?',
    insight: 'Career priorities affect time together, finances, and life rhythm. Understanding each other\'s ambitions prevents future conflict.',
    analysisHints: ['ambition level', 'work-life balance', 'career vs family priority'],
    cards: [
      {
        cardId: 'A',
        emoji: '🚀',
        title: 'Chasing Big Dreams',
        subtitle: 'Ambitious, driven, reaching for the top'
      },
      {
        cardId: 'B',
        emoji: '⚖️',
        title: 'Balance is Everything',
        subtitle: 'Work to live, not live to work'
      },
      {
        cardId: 'C',
        emoji: '🎨',
        title: 'Passion Over Paychecks',
        subtitle: 'Doing what we love, even if it pays less'
      },
      {
        cardId: 'D',
        emoji: '🏠',
        title: 'Home is My Priority',
        subtitle: 'Career takes a backseat to family'
      }
    ]
  },

  // =====================================================
  // CATEGORY 4: OUR MONEY
  // =====================================================
  {
    categoryNumber: 4,
    categoryId: 'our_money',
    title: 'Our Money',
    emoji: '💰',
    question: 'How do we think about money together?',
    insight: 'Financial compatibility is crucial for long-term harmony. Different money mindsets cause significant relationship stress.',
    analysisHints: ['spending vs saving', 'risk tolerance', 'financial planning style'],
    cards: [
      {
        cardId: 'A',
        emoji: '🐿️',
        title: 'Save for Tomorrow',
        subtitle: 'Security first, splurge later'
      },
      {
        cardId: 'B',
        emoji: '📈',
        title: 'Grow Our Wealth',
        subtitle: 'Invest smart, build for the future'
      },
      {
        cardId: 'C',
        emoji: '🎉',
        title: 'Live for Today',
        subtitle: 'Experiences over savings accounts'
      },
      {
        cardId: 'D',
        emoji: '🤝',
        title: "We'll Figure It Out Together",
        subtitle: 'No strong preferences, open to discussion'
      }
    ]
  },

  // =====================================================
  // CATEGORY 5: OUR WEEKENDS
  // =====================================================
  {
    categoryNumber: 5,
    categoryId: 'our_weekends',
    title: 'Our Weekends',
    emoji: '🛋️',
    question: 'How do we spend our free time together?',
    insight: 'Weekend preferences reveal introversion/extroversion and recharge styles. Mismatched needs can drain both partners.',
    analysisHints: ['social vs private', 'active vs relaxed', 'family vs friends'],
    cards: [
      {
        cardId: 'A',
        emoji: '🎬',
        title: 'Cozy Homebodies',
        subtitle: 'Netflix, cooking, and quiet time together'
      },
      {
        cardId: 'B',
        emoji: '👯',
        title: 'Friends & Gatherings',
        subtitle: 'Our social life is our happy place'
      },
      {
        cardId: 'C',
        emoji: '🏃',
        title: 'Adventure Mode',
        subtitle: 'Always exploring, hiking, or trying something new'
      },
      {
        cardId: 'D',
        emoji: '👨‍👩‍👧',
        title: 'Family Comes First',
        subtitle: 'Weekends are for parents, siblings, extended family'
      }
    ]
  },

  // =====================================================
  // CATEGORY 6: OUR ADVENTURES
  // =====================================================
  {
    categoryNumber: 6,
    categoryId: 'our_adventures',
    title: 'Our Adventures',
    emoji: '✈️',
    question: 'How important is travel and adventure to us?',
    insight: 'Travel preferences affect budgeting, time off, and shared experiences. Wanderlust vs homebody is a key lifestyle factor.',
    analysisHints: ['travel frequency', 'adventure level', 'exploration priority'],
    cards: [
      {
        cardId: 'A',
        emoji: '🗺️',
        title: 'Bucket List Travelers',
        subtitle: 'See the world, one destination at a time'
      },
      {
        cardId: 'B',
        emoji: '🏖️',
        title: 'Annual Getaways',
        subtitle: 'One or two good vacations a year is perfect'
      },
      {
        cardId: 'C',
        emoji: '🚗',
        title: 'Weekend Wanderers',
        subtitle: 'Road trips and nearby escapes over big vacations'
      },
      {
        cardId: 'D',
        emoji: '🏠',
        title: 'Home is Our Happy Place',
        subtitle: "We don't need to go anywhere to be happy"
      }
    ]
  },

  // =====================================================
  // CATEGORY 7: OUR ROOTS (Indian Cultural Context)
  // =====================================================
  {
    categoryNumber: 7,
    categoryId: 'our_roots',
    title: 'Our Roots',
    emoji: '👪',
    question: 'How involved are our families in our life?',
    insight: 'Family involvement expectations vary greatly. This is especially important in Indian cultural context where joint families are common.',
    analysisHints: ['family proximity', 'independence level', 'tradition vs modernity'],
    cards: [
      {
        cardId: 'A',
        emoji: '🏠',
        title: 'Together Under One Roof',
        subtitle: 'Joint family living with parents'
      },
      {
        cardId: 'B',
        emoji: '🏘️',
        title: 'Close But Separate',
        subtitle: 'Our own space, but family nearby'
      },
      {
        cardId: 'C',
        emoji: '📞',
        title: 'Love From a Distance',
        subtitle: 'Independent life with regular visits'
      },
      {
        cardId: 'D',
        emoji: '🌱',
        title: 'Building Our Own Roots',
        subtitle: 'Creating new traditions as a couple'
      }
    ]
  },

  // =====================================================
  // CATEGORY 8: OUR INTIMACY
  // =====================================================
  {
    categoryNumber: 8,
    categoryId: 'our_intimacy',
    title: 'Our Intimacy',
    emoji: '🔥',
    question: 'How do we connect physically and emotionally?',
    insight: 'Intimacy expectations affect relationship satisfaction deeply. Understanding needs prevents mismatched expectations.',
    analysisHints: ['physical vs emotional', 'frequency expectations', 'affection style'],
    cards: [
      {
        cardId: 'A',
        emoji: '💋',
        title: 'Keep the Fire Burning',
        subtitle: 'Physical connection is essential to us'
      },
      {
        cardId: 'B',
        emoji: '🤗',
        title: 'Cuddles & Closeness',
        subtitle: 'Affection matters more than intensity'
      },
      {
        cardId: 'C',
        emoji: '💬',
        title: 'Emotional Depth First',
        subtitle: 'Deep conversations fuel our connection'
      },
      {
        cardId: 'D',
        emoji: '🌊',
        title: 'Ebbs & Flows',
        subtitle: 'Our intimacy naturally changes over time'
      }
    ]
  },

  // =====================================================
  // CATEGORY 9: OUR GROWTH
  // =====================================================
  {
    categoryNumber: 9,
    categoryId: 'our_growth',
    title: 'Our Growth',
    emoji: '🌱',
    question: 'How do we grow as individuals and together?',
    insight: 'Personal development priorities shape daily habits and long-term goals. Shared growth values strengthen bonds.',
    analysisHints: ['spiritual vs intellectual', 'health focus', 'ambition for growth'],
    cards: [
      {
        cardId: 'A',
        emoji: '🧘',
        title: 'Spiritual Seekers',
        subtitle: 'Inner peace and spiritual growth guide us'
      },
      {
        cardId: 'B',
        emoji: '📚',
        title: 'Always Learning',
        subtitle: 'Curiosity keeps us young'
      },
      {
        cardId: 'C',
        emoji: '💪',
        title: 'Health is Wealth',
        subtitle: 'Physical fitness is a shared priority'
      },
      {
        cardId: 'D',
        emoji: '😌',
        title: 'Just Living & Loving',
        subtitle: 'No big self-improvement agenda'
      }
    ]
  },

  // =====================================================
  // CATEGORY 10: OUR SOMEDAY
  // =====================================================
  {
    categoryNumber: 10,
    categoryId: 'our_someday',
    title: 'Our Someday',
    emoji: '🌅',
    question: 'What does our future look like when we\'re old?',
    insight: 'Long-term vision alignment ensures you\'re building toward the same destination. Retirement dreams reveal core values.',
    analysisHints: ['retirement style', 'legacy focus', 'long-term priorities'],
    cards: [
      {
        cardId: 'A',
        emoji: '🏖️',
        title: 'Retire Early & Travel',
        subtitle: 'Financial freedom to explore the world'
      },
      {
        cardId: 'B',
        emoji: '🏡',
        title: 'Grandkids & Garden',
        subtitle: 'A peaceful life surrounded by family'
      },
      {
        cardId: 'C',
        emoji: '🎯',
        title: 'Never Stop Working',
        subtitle: 'Purpose keeps us alive'
      },
      {
        cardId: 'D',
        emoji: '🤲',
        title: 'Give Back',
        subtitle: 'Leave the world better than we found it'
      }
    ]
  }
];

async function seedDreamBoard() {
  try {
    // Connect to MongoDB
    const mongoUri = process.env.MONGODB_URI || 'mongodb://localhost:27017/velora';
    console.log('📦 Connecting to MongoDB...');
    await mongoose.connect(mongoUri);
    console.log('✅ Connected to MongoDB');

    // Clear existing categories
    console.log('🧹 Clearing existing Dream Board categories...');
    await DreamBoardCategory.deleteMany({});
    console.log('✅ Cleared existing categories');

    // Insert new categories
    console.log('🌱 Seeding Dream Board categories...');
    const result = await DreamBoardCategory.insertMany(categories);
    console.log(`✅ Seeded ${result.length} categories with ${result.length * 4} cards`);

    // Log summary
    console.log('\n📊 SEED SUMMARY:');
    console.log('═══════════════════════════════════════════════════');
    result.forEach((cat, idx) => {
      console.log(`${cat.emoji} Category ${idx + 1}: ${cat.title}`);
      cat.cards.forEach(card => {
        console.log(`   ${card.cardId}. ${card.emoji} ${card.title}`);
      });
    });
    console.log('═══════════════════════════════════════════════════');
    console.log('✅ Dream Board seeding complete!\n');

    // Disconnect
    await mongoose.disconnect();
    console.log('📤 Disconnected from MongoDB');
    process.exit(0);

  } catch (error) {
    console.error('❌ Seeding failed:', error);
    await mongoose.disconnect();
    process.exit(1);
  }
}

// Run the seed
seedDreamBoard();