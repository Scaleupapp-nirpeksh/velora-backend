// src/config/aws.js

const { S3Client } = require('@aws-sdk/client-s3');
const logger = require('../utils/logger');

/**
 * AWS S3 Configuration
 * 
 * This module configures the AWS S3 client for file storage.
 * All user-uploaded content (photos, audio) will be stored in S3.
 * 
 * Environment variables required:
 * - AWS_ACCESS_KEY_ID: Your AWS access key
 * - AWS_SECRET_ACCESS_KEY: Your AWS secret key
 * - AWS_REGION: AWS region (e.g., ap-south-1 for Mumbai)
 * - AWS_S3_BUCKET: Your S3 bucket name (e.g., velora)
 */

// Validate required environment variables
const requiredEnvVars = [
  'AWS_ACCESS_KEY_ID',
  'AWS_SECRET_ACCESS_KEY',
  'AWS_REGION',
  'AWS_S3_BUCKET'
];

const missingVars = requiredEnvVars.filter(varName => !process.env[varName]);

if (missingVars.length > 0) {
  logger.error(`Missing required AWS environment variables: ${missingVars.join(', ')}`);
  throw new Error(`Missing AWS configuration: ${missingVars.join(', ')}`);
}

// Configure S3 client
const s3Client = new S3Client({
  region: process.env.AWS_REGION,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY
  }
});

// Log configuration (without exposing credentials)
logger.info('AWS S3 configured', {
  region: process.env.AWS_REGION,
  bucket: process.env.AWS_S3_BUCKET
});

module.exports = {
  s3Client,
  bucketName: process.env.AWS_S3_BUCKET,
  region: process.env.AWS_REGION
};