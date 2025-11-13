const twilio = require('twilio');
const logger = require('../utils/logger');

const client = twilio(
  process.env.TWILIO_ACCOUNT_SID,
  process.env.TWILIO_AUTH_TOKEN
);

/**
 * Twilio Service for OTP operations
 */
class TwilioService {
  /**
   * Generate 6-digit OTP
   */
  static generateOTP() {
    return Math.floor(100000 + Math.random() * 900000).toString();
  }

  /**
   * Send OTP via SMS
   * @param {String} phone - Phone number with country code
   * @param {String} otp - OTP code
   * @returns {Promise<Object>} - Twilio response
   */
  static async sendOTP(phone, otp) {
    try {
      const message = `Your Velora verification code is: ${otp}. Valid for ${process.env.OTP_EXPIRY_MINUTES || 10} minutes. Do not share this code with anyone.`;

      const response = await client.messages.create({
        body: message,
        from: process.env.TWILIO_PHONE_NUMBER,
        to: phone,
      });

      logger.info(`OTP sent to ${phone}`, { messageId: response.sid });
      return response;
    } catch (error) {
      logger.error('Error sending OTP via Twilio:', error);
      throw new Error('Failed to send OTP. Please try again.');
    }
  }

  /**
   * Validate phone number format
   * @param {String} phone - Phone number
   * @returns {Boolean}
   */
  static validatePhoneNumber(phone) {
    // E.164 format: +[country code][number]
    const phoneRegex = /^\+[1-9]\d{1,14}$/;
    return phoneRegex.test(phone);
  }

  /**
   * Format phone number to E.164 format (for India)
   * @param {String} phone - Phone number
   * @returns {String} - Formatted phone number
   */
  static formatPhoneNumber(phone) {
    // Remove all non-digit characters
    let cleaned = phone.replace(/\D/g, '');

    // If starts with 0, remove it (Indian mobile numbers)
    if (cleaned.startsWith('0')) {
      cleaned = cleaned.substring(1);
    }

    // Add country code if not present
    if (!cleaned.startsWith('91') && cleaned.length === 10) {
      cleaned = '91' + cleaned;
    }

    return '+' + cleaned;
  }
}

module.exports = TwilioService;