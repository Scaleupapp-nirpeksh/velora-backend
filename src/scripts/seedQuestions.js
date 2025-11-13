// @ts-nocheck
/**
 * Seed Script for Velora Dating App - 50 Questions
 * 
 * This script populates the database with all 50 personality questions
 * organized into 6 dimensions for the matching algorithm.
 * 
 * Run: node src/scripts/seedQuestions.js
 */

const mongoose = require('mongoose');
const Question = require('../models/Question');
require('dotenv').config();

// MongoDB connection
const connectDB = async () => {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('✅ MongoDB Connected for seeding');
  } catch (error) {
    console.error('❌ MongoDB connection failed:', error.message);
    process.exit(1);
  }
};

// All 50 Questions (Schema-corrected)
// Field mappings:
// - maxCharacterLimit (Number) instead of characterLimit (Object)
// - dayUnlocked instead of unlockDay
// - weight on 1-10 scale instead of 0-1 scale
const questions = [
  // ============================================
  // DIMENSION 1: EMOTIONAL INTIMACY & VULNERABILITY (8 Questions)
  // ============================================
  {
    questionNumber: 1,
    dimension: 'emotional_intimacy',
    questionText: "Tell me about your closest friend. What's one thing they do that you're secretly jealous of or wish you could be better at?",
    questionType: 'text',
    characterLimit: 200,
    followUpQuestion: "When you think about that trait in your friend, you feel:",
    followUpOptions: [
      { key: 'A', text: 'Inspired to work on it in myself' },
      { key: 'B', text: "A bit insecure or inferior, honestly" },
      { key: 'C', text: "Happy for them but it's not for me" },
      { key: 'D', text: 'Curious about how they got that way' },
      { key: 'E', text: "Doesn't really affect me much" }
    ],
    dayUnlocked: 1,
    weight: 8.5,
  },
  {
    questionNumber: 2,
    dimension: 'emotional_intimacy',
    questionText: "Think about the last time you cried (even teared up counts). Don't tell me why - just tell me: where were you and who (if anyone) saw you?",
    questionType: 'text',
    characterLimit: 100,
    followUpQuestion: "If someone was there or found out later, what happened?",
    followUpOptions: [
      { key: 'A', text: 'I talked about it openly' },
      { key: 'B', text: 'I downplayed it / changed the subject' },
      { key: 'C', text: 'I left or hid until I composed myself' },
      { key: 'D', text: 'They comforted me and I let them' },
      { key: 'E', text: 'No one saw / I cry privately only' }
    ],
    dayUnlocked: 1,
    weight: 9.0,
  },
  {
    questionNumber: 3,
    dimension: 'emotional_intimacy',
    questionText: "Your partner mentions they had lunch with an ex (who's now just a friend). They seem really engaged in conversation. How do you feel?",
    questionType: 'single_choice',
    options: [
      { key: 'A', text: "Totally fine - I'm secure in our relationship" },
      { key: 'B', text: "A little insecure but I wouldn't show it" },
      { key: 'C', text: "I'd casually join the conversation" },
      { key: 'D', text: "I'd feel jealous and bring it up later" },
      { key: 'E', text: "I'd feel upset in the moment and probably show it" }
    ],
    dayUnlocked: 1,
    weight: 8.0,
  },
  {
    questionNumber: 4,
    dimension: 'emotional_intimacy',
    questionText: 'Think about the last time you genuinely apologized to someone (not "sorry" in passing). What was it for?',
    questionType: 'text',
    characterLimit: 150,
    followUpQuestion: "How did you feel during and after that apology?",
    followUpOptions: [
      { key: 'A', text: 'Relieved and lighter - I hate unresolved tension' },
      { key: 'B', text: 'Defensive even while apologizing - I felt partly justified' },
      { key: 'C', text: 'Embarrassed but knew it was right' },
      { key: 'D', text: 'Anxious about their reaction' },
      { key: 'E', text: "I rarely apologize / I'm usually not in the wrong" }
    ],
    dayUnlocked: 1,
    weight: 9.5,
  },
  {
    questionNumber: 5,
    dimension: 'emotional_intimacy',
    questionText: "You get your dream job offer - amazing pay, perfect role. But it's in another city, and your relationship is just getting serious (6-9 months in). They can't relocate easily. What's your honest first instinct?",
    questionType: 'single_choice',
    options: [
      { key: 'A', text: 'Take the job - career comes first at this stage' },
      { key: 'B', text: 'Turn it down - the relationship matters more' },
      { key: 'C', text: 'Have a serious conversation and decide together' },
      { key: 'D', text: 'Ask them to try long distance' },
      { key: 'E', text: "Ask them to move with me even though it's hard for them" },
      { key: 'F', text: 'Id be torn - this would break me' }
    ],
    dayUnlocked: 1,
    weight: 9.0,
  },
  {
    questionNumber: 6,
    dimension: 'emotional_intimacy',
    questionText: "Your family is going through financial stress. Your partner's family is well-off and comfortable. How do you feel?",
    questionType: 'single_choice',
    options: [
      { key: 'A', text: "It's private - I wouldn't share my family's situation with them" },
      { key: 'B', text: "I'd be honest but embarrassed" },
      { key: 'C', text: "I'd feel insecure or inferior around their family" },
      { key: 'D', text: "It wouldn't affect me - everyone's situation is different" },
      { key: 'E', text: "I'd worry they or their family would judge me/my family" }
    ],
    dayUnlocked: 1,
    weight: 8.5,
  },
  {
    questionNumber: 7,
    dimension: 'emotional_intimacy',
    questionText: "Your parent says something critical/hurtful about your partner (looks, job, family background). The criticism feels unfair. What do you do?",
    questionType: 'single_choice',
    options: [
      { key: 'A', text: 'Defend my partner strongly - my parents need to respect them' },
      { key: 'B', text: 'Stay silent in the moment, address it with parents privately later' },
      { key: 'C', text: 'Stay silent with both - avoid the conflict entirely' },
      { key: 'D', text: 'Partially agree with parents to keep peace, address with partner later' },
      { key: 'E', text: "Take parents' side - their opinion matters more than my partner's feelings" },
      { key: 'F', text: "Break up - if my parents don't approve, it won't work" }
    ],
    dayUnlocked: 1,
    weight: 10.0,
  },
  {
    questionNumber: 8,
    dimension: 'emotional_intimacy',
    questionText: "What ended your last serious relationship (or why haven't you had one)?",
    questionType: 'text',
    characterLimit: 150,
    followUpQuestion: "When you think about that relationship now, you feel:",
    followUpOptions: [
      { key: 'A', text: 'Grateful for what I learned' },
      { key: 'B', text: "Regret - I wish I'd done things differently" },
      { key: 'C', text: "Relieved it's over" },
      { key: 'D', text: 'Still hurt or angry about how it ended' },
      { key: 'E', text: "Indifferent - it's in the past" },
      { key: 'F', text: "Haven't had a serious relationship yet" }
    ],
    dayUnlocked: 1,
    weight: 9.0,
  },

  // ============================================
  // DIMENSION 2: LIFE VISION & VALUES (10 Questions)
  // ============================================
  {
    questionNumber: 9,
    dimension: 'life_vision',
    questionText: "You're in a close friend group WhatsApp chat. Two friends start arguing about something political/controversial. It's getting heated. Messages are flying. What do you actually do?",
    questionType: 'single_choice',
    options: [
      { key: 'A', text: 'Jump in and try to mediate / calm things down' },
      { key: 'B', text: "Mute the chat and check back later when it's over" },
      { key: 'C', text: 'Leave the group temporarily until drama passes' },
      { key: 'D', text: 'Send a meme or joke to diffuse tension' },
      { key: 'E', text: 'Pick a side and join the argument' },
      { key: 'F', text: "DM one of them privately to check if they're okay" }
    ],
    dayUnlocked: 1,
    weight: 7.5,
  },
  {
    questionNumber: 10,
    dimension: 'life_vision',
    questionText: 'You accidentally overhear your partner on a phone call with their best friend. They\'re talking about you. They say: "Yeah, things are good, but sometimes I feel like [your name] doesn\'t really get me, you know?" You weren\'t supposed to hear this. What do you do?',
    questionType: 'single_choice',
    options: [
      { key: 'A', text: 'Bring it up immediately - "I heard what you said..."' },
      { key: 'B', text: "Feel hurt but don't say anything - don't want to admit I was eavesdropping" },
      { key: 'C', text: 'Wait a few days and then bring up the topic casually' },
      { key: 'D', text: 'Bring it up but frame it as "I feel like I don\'t fully understand you - help me"' },
      { key: 'E', text: 'Internalize it and try to change my behavior without discussing it' },
      { key: 'F', text: 'Get upset and defensive - how dare they complain about me?' }
    ],
    dayUnlocked: 1,
    weight: 8.5,
  },
  {
    questionNumber: 11,
    dimension: 'life_vision',
    questionText: "Your partner forgot an important day (birthday, anniversary, event you talked about). They feel terrible and apologize profusely. Three months later, you two have a different argument. Do you bring up the forgotten event as proof they don't care?",
    questionType: 'single_choice',
    options: [
      { key: 'A', text: "Honestly, yes - it's relevant to the pattern" },
      { key: 'B', text: "No - bringing up old stuff is unfair" },
      { key: 'C', text: "Only if they're denying there's a pattern" },
      { key: 'D', text: "I'd want to but I'd know it's wrong" },
      { key: 'E', text: "I wouldn't have truly forgiven them yet, so it would come up" }
    ],
    dayUnlocked: 1,
    weight: 9.5,
  },
  {
    questionNumber: 12,
    dimension: 'life_vision',
    questionText: "When you're stressed, sad, or overwhelmed, what do you reach for first?",
    questionType: 'single_choice',
    options: [
      { key: 'A', text: 'Food (specific comfort food)' },
      { key: 'B', text: 'Sleep / rest' },
      { key: 'C', text: 'Calling a friend or family' },
      { key: 'D', text: 'Exercise / physical activity' },
      { key: 'E', text: 'TV / movies / scrolling / distraction' },
      { key: 'F', text: 'Alcohol / smoking / substances' },
      { key: 'G', text: 'Work or staying busy' },
      { key: 'H', text: 'Alone time in silence' }
    ],
    dayUnlocked: 1,
    weight: 8.0,
  },
  {
    questionNumber: 13,
    dimension: 'life_vision',
    questionText: "How important is religion or spirituality in your life?",
    questionType: 'single_choice',
    options: [
      { key: 'A', text: 'Very important - it guides my decisions and values' },
      { key: 'B', text: "Somewhat important - I practice but I'm flexible" },
      { key: 'C', text: 'Culturally important but not deeply spiritual' },
      { key: 'D', text: "Not important - I'm agnostic/atheist" },
      { key: 'E', text: "I'm spiritual but not religious" },
      { key: 'F', text: "It's complicated / I'm figuring it out" }
    ],
    followUpQuestion: "If your partner had a very different belief system than you, how would that work?",
    followUpOptions: [
      { key: 'A', text: "It wouldn't work - shared faith is crucial" },
      { key: 'B', text: "I'd need them to respect my practices" },
      { key: 'C', text: "I'd be fine as long as we respect each other" },
      { key: 'D', text: "I'd be open to learning about their beliefs" },
      { key: 'E', text: "I'd prefer we didn't discuss religion much" }
    ],
    dayUnlocked: 1,
    weight: 9.0,
  },
  {
    questionNumber: 14,
    dimension: 'life_vision',
    questionText: "What's a romantic movie scene or love song that genuinely moved you? (Don't overthink it - first thing that comes to mind)",
    questionType: 'text',
    characterLimit: 150,
    followUpQuestion: "What about it resonated with you?",
    followUpOptions: [
      { key: 'A', text: 'The grand gesture / dramatic moment' },
      { key: 'B', text: 'The quiet intimacy / small moments' },
      { key: 'C', text: 'The sacrifice one person made' },
      { key: 'D', text: 'The way they communicated / understood each other' },
      { key: 'E', text: 'The physical chemistry / passion' },
      { key: 'F', text: 'The friendship that became love' }
    ],
    dayUnlocked: 1,
    weight: 7.5,
  },
  {
    questionNumber: 15,
    dimension: 'life_vision',
    questionText: "How do you feel about having children?",
    questionType: 'single_choice',
    options: [
      { key: 'A', text: "Definitely want kids - it's a life goal" },
      { key: 'B', text: 'Probably want kids but timing depends' },
      { key: 'C', text: "Unsure / haven't decided" },
      { key: 'D', text: "Probably don't want kids" },
      { key: 'E', text: "Definitely don't want kids" },
      { key: 'F', text: 'Open to adoption/fostering but not biological kids' }
    ],
    followUpQuestion: "If you want kids: What's your ideal timeline?",
    followUpOptions: [
      { key: 'A', text: 'Within 2 years of finding the right person' },
      { key: 'B', text: '3-5 years after getting married' },
      { key: 'C', text: 'After 30 / when financially stable' },
      { key: 'D', text: 'No specific timeline - when it feels right' },
      { key: 'E', text: "Flexible based on partner's preferences" }
    ],
    dayUnlocked: 1,
    weight: 10.0,
  },
  {
    questionNumber: 16,
    dimension: 'life_vision',
    questionText: "How involved do you want your parents/family to be in your romantic relationship and life decisions?",
    questionType: 'single_choice',
    options: [
      { key: 'A', text: 'Very involved - family opinion matters a lot to me' },
      { key: 'B', text: 'Somewhat involved - I value their input but make my own decisions' },
      { key: 'C', text: 'Minimal involvement - I\'m independent from family' },
      { key: 'D', text: "It's complicated - I want distance but feel obligated" },
      { key: 'E', text: "I'm not close to my family" }
    ],
    dayUnlocked: 2,
    weight: 9.5,
  },
  {
    questionNumber: 17,
    dimension: 'life_vision',
    questionText: "What's your ideal work situation 5 years from now?",
    questionType: 'single_choice',
    options: [
      { key: 'A', text: 'Climbing the corporate ladder - ambitious career path' },
      { key: 'B', text: 'Stable 9-5 job with good work-life balance' },
      { key: 'C', text: 'Entrepreneurship / building my own thing' },
      { key: 'D', text: 'Freelance / flexible remote work' },
      { key: 'E', text: 'Part-time work / focus on family and personal life' },
      { key: 'F', text: "I don't know yet / figuring it out" }
    ],
    dayUnlocked: 2,
    weight: 8.5,
  },
  {
    questionNumber: 18,
    dimension: 'life_vision',
    questionText: "How important is it that your partner gets along with your close friends?",
    questionType: 'single_choice',
    options: [
      { key: 'A', text: 'Critical - they need to fit into my friend group' },
      { key: 'B', text: 'Important but not dealbreaker - separate social lives are okay' },
      { key: 'C', text: 'Not very important - I keep romance and friendships separate' },
      { key: 'D', text: "I'd prioritize my partner over friends if there's tension" },
      { key: 'E', text: "I'd prioritize my friends - they were here first" }
    ],
    dayUnlocked: 2,
    weight: 7.5,
  },

  // ============================================
  // DIMENSION 3: CONFLICT & COMMUNICATION (7 Questions)
  // ============================================
  {
    questionNumber: 19,
    dimension: 'conflict_communication',
    questionText: "Think about last weekend (or your most recent 2 days off). What did you ACTUALLY do?",
    questionType: 'text',
    characterLimit: 200,
    followUpQuestion: "How did you feel about how you spent that time?",
    followUpOptions: [
      { key: 'A', text: 'Great - exactly what I needed' },
      { key: 'B', text: 'Productive - got things done' },
      { key: 'C', text: 'Lazy but necessary' },
      { key: 'D', text: "Wasted - wish I'd done something else" },
      { key: 'E', text: 'Lonely - wish I had someone to spend it with' }
    ],
    dayUnlocked: 2,
    weight: 7.0,
  },
  {
    questionNumber: 20,
    dimension: 'conflict_communication',
    questionText: "It's 10 PM on a Tuesday. You're at home. Your phone rings - it's a close friend. They're going through something and want to talk. You have work tomorrow. What do you honestly do?",
    questionType: 'single_choice',
    options: [
      { key: 'A', text: 'Answer and talk as long as they need' },
      { key: 'B', text: 'Answer briefly and say "Can we talk tomorrow when I have more time?"' },
      { key: 'C', text: 'Text back "Everything ok? Can we talk tomorrow?"' },
      { key: 'D', text: 'Let it go to voicemail and call them back tomorrow' },
      { key: 'E', text: 'Answer and talk for 15-20 mins max' }
    ],
    dayUnlocked: 2,
    weight: 7.5,
  },
  {
    questionNumber: 21,
    dimension: 'conflict_communication',
    questionText: "You wake up with a bad cold / flu. You feel terrible but not hospital-level sick. What do you do?",
    questionType: 'single_choice',
    options: [
      { key: 'A', text: 'Power through - work from home and push through the day' },
      { key: 'B', text: 'Take the day off and actually rest' },
      { key: 'C', text: 'Take the day off but catch up on errands / personal stuff' },
      { key: 'D', text: 'Complain a lot and want someone to take care of me' },
      { key: 'E', text: "Isolate myself - I don't want to be around anyone when I'm sick" }
    ],
    dayUnlocked: 3,
    weight: 7.5,
  },
  {
    questionNumber: 22,
    dimension: 'conflict_communication',
    questionText: "Think about what you spent the most money on last month (excluding rent/EMIs). What was it?",
    questionType: 'text',
    characterLimit: 100,
    followUpQuestion: "How did you feel about that purchase?",
    followUpOptions: [
      { key: 'A', text: 'Worth it - no regrets' },
      { key: 'B', text: 'Necessary but wish it was cheaper' },
      { key: 'C', text: "Guilty - probably didn't need it" },
      { key: 'D', text: "Excited - I'd been planning it for a while" },
      { key: 'E', text: 'Indifferent - just part of life' }
    ],
    dayUnlocked: 3,
    weight: 7.0,
  },
  {
    questionNumber: 23,
    dimension: 'conflict_communication',
    questionText: "On a normal workday, what time do you ACTUALLY wake up and what's the first thing you do?",
    questionType: 'text',
    characterLimit: 100,
    dayUnlocked: 3,
    weight: 6.5,
  },
  {
    questionNumber: 24,
    dimension: 'conflict_communication',
    questionText: "You made plans with someone for Friday night. What would make you actually cancel?",
    questionType: 'single_choice',
    options: [
      { key: 'A', text: 'Only a genuine emergency or being really sick' },
      { key: 'B', text: 'Feeling mentally exhausted / need alone time' },
      { key: 'C', text: 'Getting a better offer / more exciting plans' },
      { key: 'D', text: 'Work emergency or deadline' },
      { key: 'E', text: "I rarely cancel - I honor commitments even if I'm tired" },
      { key: 'F', text: "I'd feel too guilty to cancel even if I wanted to" }
    ],
    dayUnlocked: 3,
    weight: 8.0,
  },
  {
    questionNumber: 25,
    dimension: 'conflict_communication',
    questionText: "You have a friend group chat. What's your typical role?",
    questionType: 'single_choice',
    options: [
      { key: 'A', text: "I'm the one sending memes and jokes" },
      { key: 'B', text: 'I mostly lurk and react with emojis' },
      { key: 'C', text: "I'm the one organizing plans or checking on people" },
      { key: 'D', text: 'I share updates about my life' },
      { key: 'E', text: 'I participate actively in conversations' },
      { key: 'F', text: 'I have it muted - I check once a day' }
    ],
    dayUnlocked: 3,
    weight: 7.0,
  },

  // ============================================
  // DIMENSION 4: LOVE LANGUAGES & AFFECTION (6 Questions)
  // ============================================
  {
    questionNumber: 26,
    dimension: 'love_languages',
    questionText: "After a long week, your partner wants to show you they love you. Which gesture would mean the most to you? Pick top 2:",
    questionType: 'multiple_choice',
    options: [
      { key: 'A', text: 'They plan a surprise date or experience' },
      { key: 'B', text: 'They cook your favorite meal or bring you something thoughtful' },
      { key: 'C', text: 'They write you a heartfelt message or letter' },
      { key: 'D', text: 'They give you a long massage or physical affection' },
      { key: 'E', text: "They handle a chore or task you've been dreading" },
      { key: 'F', text: 'They simply sit with you in comfortable silence' }
    ],
    maxSelections: 2,
    dayUnlocked: 4,
    weight: 8.5,
  },
  {
    questionNumber: 27,
    dimension: 'love_languages',
    questionText: "You're at a family wedding with your partner (6 months of dating). What feels comfortable to you?",
    questionType: 'single_choice',
    options: [
      { key: 'A', text: 'Holding hands, arm around shoulder - normal couple affection' },
      { key: 'B', text: 'Minimal PDA in front of family - hand-holding max' },
      { key: 'C', text: "No physical affection at all - it's too public/family is conservative" },
      { key: 'D', text: "We'd dance together, be affectionate - I don't hide my relationship" },
      { key: 'E', text: "It depends on my family's vibe and my partner's comfort" }
    ],
    dayUnlocked: 4,
    weight: 8.0,
  },
  {
    questionNumber: 28,
    dimension: 'love_languages',
    questionText: "What kind of compliments from a partner mean the most to you? Pick top 2:",
    questionType: 'multiple_choice',
    options: [
      { key: 'A', text: 'About my physical appearance ("You look beautiful/handsome")' },
      { key: 'B', text: 'About my personality ("You\'re so thoughtful/funny/kind")' },
      { key: 'C', text: 'About my achievements ("I\'m proud of what you accomplished")' },
      { key: 'D', text: 'About how I make them feel ("You make me feel safe/happy")' },
      { key: 'E', text: 'About my intelligence or skills ("You\'re so smart/talented")' },
      { key: 'F', text: "I'm uncomfortable with compliments honestly" }
    ],
    maxSelections: 2,
    dayUnlocked: 4,
    weight: 7.5,
  },
  {
    questionNumber: 29,
    dimension: 'love_languages',
    questionText: "At home alone, how physically affectionate are you when you're NOT being sexual?",
    questionType: 'single_choice',
    options: [
      { key: 'A', text: 'Very affectionate - cuddling on couch, hand-holding while watching TV, etc.' },
      { key: 'B', text: 'Moderate - occasional hugs, kisses, touch but not constant' },
      { key: 'C', text: 'Minimal - I show love through conversation more than touch' },
      { key: 'D', text: 'It varies based on mood and stress levels' },
      { key: 'E', text: 'I need a lot of personal space even with a partner' }
    ],
    dayUnlocked: 4,
    weight: 8.0,
  },
  {
    questionNumber: 30,
    dimension: 'love_languages',
    questionText: "How do you communicate with a romantic partner during the day when you're apart?",
    questionType: 'single_choice',
    options: [
      { key: 'A', text: 'Constant texting throughout the day - I like staying connected' },
      { key: 'B', text: 'Good morning/good night plus occasional updates' },
      { key: 'C', text: 'Minimal texting - I prefer talking in person or calls' },
      { key: 'D', text: 'I send memes, articles, things that remind me of them' },
      { key: 'E', text: 'It depends on how busy I am / my mood' }
    ],
    dayUnlocked: 4,
    weight: 7.5,
  },
  {
    questionNumber: 31,
    dimension: 'love_languages',
    questionText: "What sounds like the ideal date to you?",
    questionType: 'single_choice',
    options: [
      { key: 'A', text: 'Nice dinner at a restaurant - classic romantic setting' },
      { key: 'B', text: 'Adventure activity - trek, escape room, something active' },
      { key: 'C', text: 'Cozy night at home - cook together, watch a movie' },
      { key: 'D', text: 'Cultural experience - museum, art gallery, live music' },
      { key: 'E', text: 'Spontaneous - see where the night takes us' },
      { key: 'F', text: "Simple walk and conversation - doesn't matter the setting" }
    ],
    dayUnlocked: 5,
    weight: 7.0,
  },

  // ============================================
  // DIMENSION 5: PHYSICAL & SEXUAL COMPATIBILITY (8 Questions)
  // ============================================
  {
    questionNumber: 32,
    dimension: 'physical_sexual',
    questionText: "In a healthy relationship where you're attracted to your partner, how often do you realistically see yourself wanting physical intimacy?",
    questionType: 'single_choice',
    options: [
      { key: 'A', text: 'Multiple times a day / very high drive' },
      { key: 'B', text: 'Once a day or almost daily' },
      { key: 'C', text: '3-4 times a week' },
      { key: 'D', text: 'Once or twice a week' },
      { key: 'E', text: 'A few times a month' },
      { key: 'F', text: 'It varies a lot based on stress/mood/connection' },
      { key: 'G', text: "I have a low sex drive / it's not a priority for me" }
    ],
    followUpQuestion: "If your partner wanted sex significantly more or less often than you, what happens?",
    followUpOptions: [
      { key: 'A', text: "We'd communicate and find a middle ground" },
      { key: 'B', text: "I'd feel pressured if they wanted more / rejected if they wanted less" },
      { key: 'C', text: "I'd probably go along with their preference to keep them happy" },
      { key: 'D', text: 'This would be a serious problem for me long-term' },
      { key: 'E', text: "I'd suggest we explore why the mismatch exists first" }
    ],
    dayUnlocked: 5,
    weight: 9.0,
  },
  {
    questionNumber: 33,
    dimension: 'physical_sexual',
    questionText: "During physical intimacy, if something doesn't feel good or you want to try something different, what do you actually do?",
    questionType: 'single_choice',
    options: [
      { key: 'A', text: 'I communicate in the moment - guide their hands, tell them what I like' },
      { key: 'B', text: "I subtly redirect but don't explicitly say anything" },
      { key: 'C', text: 'I let it happen and bring it up afterward' },
      { key: 'D', text: "I'd feel too awkward to say anything" },
      { key: 'E', text: 'I make pleasure sounds when something feels good to encourage that' },
      { key: 'F', text: "I'd probably just go with it and not mention it" }
    ],
    dayUnlocked: 5,
    weight: 8.5,
  },
  {
    questionNumber: 34,
    dimension: 'physical_sexual',
    questionText: "How do you feel about trying new things physically/sexually in a relationship?",
    questionType: 'single_choice',
    options: [
      { key: 'A', text: "I'm very open and adventurous - I like experimenting" },
      { key: 'B', text: "I'm open if my partner suggests something and it feels safe" },
      { key: 'C', text: 'I prefer what I know works - not interested in experimenting much' },
      { key: 'D', text: "I'd be willing to try things but I'd need a lot of trust first" },
      { key: 'E', text: "I have specific interests/kinks I'd want to explore with the right person" },
      { key: 'F', text: "I'm still figuring out what I like" }
    ],
    followUpQuestion: "If your partner has a kink/fantasy that doesn't appeal to you but is important to them:",
    followUpOptions: [
      { key: 'A', text: "I'd try it at least once with an open mind" },
      { key: 'B', text: "I'd try to find a compromise version we're both okay with" },
      { key: 'C', text: "I'd support them exploring it elsewhere (open arrangement)" },
      { key: 'D', text: "I'd feel pressured and uncomfortable even discussing it" },
      { key: 'E', text: "Hard boundary - I can't do things I'm not into" }
    ],
    dayUnlocked: 5,
    weight: 8.5,
  },
  {
    questionNumber: 35,
    dimension: 'physical_sexual',
    questionText: "You're walking down the street with your partner. What feels natural?",
    questionType: 'single_choice',
    options: [
      { key: 'A', text: 'Holding hands, arm around waist/shoulder - comfortable with PDA' },
      { key: 'B', text: 'Walking close but not really touching much in public' },
      { key: 'C', text: 'Very minimal - maybe holding hands briefly but that\'s it' },
      { key: 'D', text: 'Zero PDA - it makes me uncomfortable' },
      { key: 'E', text: "It depends on the neighborhood/who's around (family, conservative area)" }
    ],
    dayUnlocked: 5,
    weight: 7.5,
  },
  {
    questionNumber: 36,
    dimension: 'physical_sexual',
    questionText: "You've been dating someone for 3 weeks. There's strong chemistry. They invite you to their place for the first time. What feels right to you?",
    questionType: 'single_choice',
    options: [
      { key: 'A', text: "I'm comfortable with physical intimacy if the vibe is right" },
      { key: 'B', text: "I'd want to talk about boundaries and expectations first" },
      { key: 'C', text: "I'd prefer to wait until we're exclusive/more serious" },
      { key: 'D', text: "I'm waiting until marriage - that's non-negotiable for me" },
      { key: 'E', text: "I'd go but set clear boundaries on what I'm comfortable with" },
      { key: 'F', text: "I'd feel pressured and probably cancel" }
    ],
    dayUnlocked: 6,
    weight: 9.0,
  },
  {
    questionNumber: 37,
    dimension: 'physical_sexual',
    questionText: "What's a physical insecurity you have that you'd want a partner to know about early?",
    questionType: 'text',
    characterLimit: 200,
    followUpQuestion: "How would you want a partner to respond to that insecurity?",
    followUpOptions: [
      { key: 'A', text: "Reassure me it's not a big deal / I'm attractive anyway" },
      { key: 'B', text: 'Just listen and validate without trying to fix it' },
      { key: 'C', text: 'Help me work on it / be supportive of changes I want to make' },
      { key: 'D', text: 'Not make a big deal out of it / treat me normally' },
      { key: 'E', text: "I wouldn't share this / too vulnerable" }
    ],
    dayUnlocked: 6,
    weight: 8.0,
  },
  {
    questionNumber: 38,
    dimension: 'physical_sexual',
    questionText: "In past relationships or dating experiences, who usually initiated physical intimacy?",
    questionType: 'single_choice',
    options: [
      { key: 'A', text: "Usually me - I'm comfortable initiating" },
      { key: 'B', text: "Usually them - I'm more responsive than initiative" },
      { key: 'C', text: 'Pretty balanced - we both initiated' },
      { key: 'D', text: 'I wanted to but felt too nervous/shy' },
      { key: 'E', text: "I've never been in a situation where this was relevant" }
    ],
    followUpQuestion: "If you're in the mood but your partner isn't, how do you feel?",
    followUpOptions: [
      { key: 'A', text: "Totally fine - I respect their no and take care of myself" },
      { key: 'B', text: 'A bit disappointed but I understand' },
      { key: 'C', text: "Rejected and hurt, even if I know it's not personal" },
      { key: 'D', text: "I'd rarely be in this situation - my drive is pretty low" },
      { key: 'E', text: "I'd feel like something's wrong with me or the relationship" }
    ],
    dayUnlocked: 6,
    weight: 8.0,
  },
  {
    questionNumber: 39,
    dimension: 'physical_sexual',
    questionText: "What's a fantasy (romantic or sexual) you've never told anyone?",
    questionType: 'text',
    characterLimit: 200,
    followUpQuestion: "If a partner wanted to explore this with you, how would you feel?",
    followUpOptions: [
      { key: 'A', text: "Excited - I've been waiting for someone open-minded" },
      { key: 'B', text: "Nervous but willing if there's trust" },
      { key: 'C', text: "Embarrassed - I'd rather keep it fantasy only" },
      { key: 'D', text: 'It depends on how they brought it up' },
      { key: 'E', text: "I'd need to know they won't judge me first" }
    ],
    dayUnlocked: 6,
    weight: 7.5,
  },

  // ============================================
  // DIMENSION 6: LIFESTYLE & DAILY RHYTHMS (11 Questions)
  // ============================================
  {
    questionNumber: 40,
    dimension: 'lifestyle',
    questionText: "Think about last weekend (or your most recent 2 days off). What did you ACTUALLY do? Pick the 2 biggest chunks of time:",
    questionType: 'multiple_choice',
    options: [
      { key: 'A', text: 'Slept in / rested / watched TV or movies' },
      { key: 'B', text: 'Worked out / played sports / physical activity' },
      { key: 'C', text: 'Met friends / social plans' },
      { key: 'D', text: 'Worked on a side project / learned something new' },
      { key: 'E', text: 'Caught up on chores / errands / life admin' },
      { key: 'F', text: 'Spent time with family' },
      { key: 'G', text: 'Went on a date or spent time with partner' },
      { key: 'H', text: 'Traveled / explored the city' }
    ],
    maxSelections: 2,
    dayUnlocked: 6,
    weight: 7.5,
  },
  {
    questionNumber: 41,
    dimension: 'lifestyle',
    questionText: "It's Saturday morning. You have zero obligations. What sounds perfect?",
    questionType: 'single_choice',
    options: [
      { key: 'A', text: 'Sleep in, lazy breakfast, maybe a movie - recharge at home' },
      { key: 'B', text: 'Early morning run/gym, productive day, get stuff done' },
      { key: 'C', text: 'Brunch with friends, explore the city, be out and about' },
      { key: 'D', text: 'A mix - some alone time, some social time' },
      { key: 'E', text: 'Adventure activity - trek, road trip, something exciting' },
      { key: 'F', text: 'Working on a personal project or hobby' }
    ],
    dayUnlocked: 7,
    weight: 8.0,
  },
  {
    questionNumber: 42,
    dimension: 'lifestyle',
    questionText: "In your ideal week, how much time do you spend with your partner vs friends/family vs alone?",
    questionType: 'single_choice',
    options: [
      { key: 'A', text: "Mostly with partner - they're my best friend (70-80%)" },
      { key: 'B', text: 'Balanced split - partner, friends, alone time each get space (40-30-30%)' },
      { key: 'C', text: 'Highly social - partner, friends, family all get lots of time (40-40-20%)' },
      { key: 'D', text: 'I need a lot of alone time - partner gets quality time but I need space (30-30-40%)' },
      { key: 'E', text: 'It varies week to week based on energy and obligations' }
    ],
    followUpQuestion: "How often would you want solo friend time (without your partner)?",
    followUpOptions: [
      { key: 'A', text: 'Multiple times a week' },
      { key: 'B', text: 'Once a week' },
      { key: 'C', text: 'Few times a month' },
      { key: 'D', text: "Rarely - I'd want them included usually" },
      { key: 'E', text: 'Daily - I need lots of social independence' }
    ],
    dayUnlocked: 7,
    weight: 8.5,
  },
  {
    questionNumber: 43,
    dimension: 'lifestyle',
    questionText: "Your partner proposes a last-minute weekend trip - leaving tomorrow morning, no solid plans, just an adventure. How do you feel?",
    questionType: 'single_choice',
    options: [
      { key: 'A', text: 'HELL YES - spontaneity is exciting!' },
      { key: 'B', text: "I'd want more details first (where, budget, activities?)" },
      { key: 'C', text: "I'd probably say no - I like planning ahead" },
      { key: 'D', text: "I'd be stressed but would say yes to make them happy" },
      { key: 'E', text: "Spontaneous travel isn't my thing - I prefer planned trips" },
      { key: 'F', text: 'It depends on my mood and workload' }
    ],
    dayUnlocked: 7,
    weight: 8.0,
  },
  {
    questionNumber: 44,
    dimension: 'lifestyle',
    questionText: "On a normal workday, what time do you ACTUALLY wake up and what's the first thing you do?",
    questionType: 'text',
    characterLimit: 100,
    dayUnlocked: 7,
    weight: 7.0,
  },
  {
    questionNumber: 45,
    dimension: 'lifestyle',
    questionText: "What do you do in your free time that makes you lose track of time?",
    questionType: 'text',
    characterLimit: 150,
    followUpQuestion: "How would you feel if your partner didn't share or understand this interest?",
    followUpOptions: [
      { key: 'A', text: "That's fine - I like having my own thing" },
      { key: 'B', text: "I'd want them to at least appreciate why it matters to me" },
      { key: 'C', text: "I'd hope they'd try it with me occasionally" },
      { key: 'D', text: "It would be hard - I want to share my passions with them" },
      { key: 'E', text: 'This is such a core part of me, I\'d need them to engage with it' }
    ],
    dayUnlocked: 7,
    weight: 7.5,
  },
  {
    questionNumber: 46,
    dimension: 'lifestyle',
    questionText: "On a Sunday with no plans, by 2 PM you've done:",
    questionType: 'single_choice',
    options: [
      { key: 'A', text: 'Worked out, meal prepped, cleaned - productive morning' },
      { key: 'B', text: 'Slept in until noon, still in pajamas - full rest mode' },
      { key: 'C', text: 'Caught up on work or side project' },
      { key: 'D', text: 'Brunch with friends or family' },
      { key: 'E', text: 'A mix - some productive tasks, some relaxation' },
      { key: 'F', text: "Still deciding - I'm flexible about how the day unfolds" }
    ],
    dayUnlocked: 8,
    weight: 7.0,
  },
  {
    questionNumber: 47,
    dimension: 'lifestyle',
    questionText: "What does your ideal living space look like?",
    questionType: 'single_choice',
    options: [
      { key: 'A', text: 'Minimalist and organized - everything has a place' },
      { key: 'B', text: 'Cozy and lived-in - comfort over aesthetics' },
      { key: 'C', text: 'Clean but some organized chaos' },
      { key: 'D', text: 'Decorated and curated - reflects my personality' },
      { key: 'E', text: "Functional and practical - doesn't matter much to me" },
      { key: 'F', text: "I'm messy/cluttered honestly - cleaning isn't my priority" }
    ],
    dayUnlocked: 8,
    weight: 7.5,
  },
  {
    questionNumber: 48,
    dimension: 'lifestyle',
    questionText: "Honestly, how much time do you spend on your phone/screens in a day (outside of work)?",
    questionType: 'single_choice',
    options: [
      { key: 'A', text: "1-2 hours - I'm pretty disciplined" },
      { key: 'B', text: '3-4 hours - moderate use' },
      { key: 'C', text: "5-6 hours - more than I'd like" },
      { key: 'D', text: "7+ hours - I'm always on my phone" },
      { key: 'E', text: 'Varies wildly - some days a lot, some days very little' }
    ],
    followUpQuestion: "If your partner asked you to put your phone away during dinner/quality time, you'd feel:",
    followUpOptions: [
      { key: 'A', text: "Totally fine - that's reasonable" },
      { key: 'B', text: 'Agree but find it hard to actually do' },
      { key: 'C', text: "Defensive - they're being controlling" },
      { key: 'D', text: 'Grateful - I need that boundary' },
      { key: 'E', text: "It depends on what's happening (work emergency, etc.)" }
    ],
    dayUnlocked: 8,
    weight: 7.0,
  },
  {
    questionNumber: 49,
    dimension: 'lifestyle',
    questionText: "What's your relationship with alcohol/drinking in social settings?",
    questionType: 'single_choice',
    options: [
      { key: 'A', text: "I don't drink at all - personal/religious/health reasons" },
      { key: 'B', text: 'Rarely - maybe once a month or special occasions' },
      { key: 'C', text: 'Socially - 2-3 times a week when out with friends' },
      { key: 'D', text: 'Regularly - most weekends or unwinding after work' },
      { key: 'E', text: 'I drink more than I probably should' },
      { key: 'F', text: "I've had issues with alcohol/substances in the past" }
    ],
    followUpQuestion: "If your partner had a very different drinking habit than you, how would that work?",
    followUpOptions: [
      { key: 'A', text: "Wouldn't work - similar lifestyle is important" },
      { key: 'B', text: "I'd be fine as long as they respect my choices" },
      { key: 'C', text: "I'd be open but concerned if they drink a lot more than me" },
      { key: 'D', text: "No issue at all - everyone's different" },
      { key: 'E', text: "I'd probably adjust my habits to match theirs" }
    ],
    dayUnlocked: 8,
    weight: 8.5,
  },
  {
    questionNumber: 50,
    dimension: 'lifestyle',
    questionText: "It's a Saturday night in winter. You're at home with your partner. What's the ideal setup?",
    questionType: 'single_choice',
    options: [
      { key: 'A', text: 'AC on, light blanket, cool room' },
      { key: 'B', text: 'Heater on, warm and cozy, maybe cuddling' },
      { key: 'C', text: "Windows open, fresh air, doesn't matter the temperature" },
      { key: 'D', text: "I run cold, they run hot - we'd compromise" },
      { key: 'E', text: "We'd probably be doing different things in different rooms" }
    ],
    dayUnlocked: 8,
    weight: 7.0,
  },
];

// Seed function
const seedQuestions = async () => {
  try {
    console.log('🌱 Starting seed process...\n');

    // Clear existing questions
    const deleteResult = await Question.deleteMany({});
    console.log(`🗑️  Cleared ${deleteResult.deletedCount} existing questions\n`);

    // Insert all questions
    const insertedQuestions = await Question.insertMany(questions);
    console.log(`✅ Successfully seeded ${insertedQuestions.length} questions!\n`);

    // Display breakdown by dimension
    console.log('📊 Questions by Dimension:');
    const dimensionCounts = questions.reduce((acc, q) => {
      acc[q.dimension] = (acc[q.dimension] || 0) + 1;
      return acc;
    }, {});

    Object.entries(dimensionCounts).forEach(([dimension, count]) => {
      console.log(`   ${dimension}: ${count} questions`);
    });

    // Display unlock schedule
    console.log('\n📅 Unlock Schedule:');
    const unlockSchedule = questions.reduce((acc, q) => {
      acc[q.unlockDay] = (acc[q.unlockDay] || 0) + 1;
      return acc;
    }, {});

    Object.entries(unlockSchedule).sort((a, b) => a[0] - b[0]).forEach(([day, count]) => {
      const total = Object.entries(unlockSchedule)
        .filter(([d]) => d <= day)
        .reduce((sum, [, c]) => sum + c, 0);
      console.log(`   Day ${day}: +${count} questions (Total: ${total}/50)`);
    });

    // Display question types
    console.log('\n📝 Question Types:');
    const typeCounts = questions.reduce((acc, q) => {
      acc[q.questionType] = (acc[q.questionType] || 0) + 1;
      return acc;
    }, {});

    Object.entries(typeCounts).forEach(([type, count]) => {
      console.log(`   ${type}: ${count} questions`);
    });

    console.log('\n✨ Seed completed successfully!\n');
    console.log('Next steps:');
    console.log('1. Restart your server: npm run dev');
    console.log('2. Test endpoints on Postman');
    console.log('3. Verify progressive unlock logic');
    console.log('4. Test voice transcription\n');

  } catch (error) {
    console.error('❌ Error seeding questions:', error);
    process.exit(1);
  } finally {
    await mongoose.connection.close();
    console.log('🔌 Database connection closed');
  }
};

// Run seed
connectDB().then(seedQuestions);