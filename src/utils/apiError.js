/**
 * Custom API Error Class
 * Extends native Error class with statusCode and isOperational properties
 */
//src/utils/apiError.js
class ApiError extends Error {
    constructor(statusCode, message, isOperational = true, stack = '') {
      super(message);
      this.statusCode = statusCode;
      this.isOperational = isOperational;
      this.success = false;
      
      if (stack) {
        this.stack = stack;
      } else {
        Error.captureStackTrace(this, this.constructor);
      }
    }
  
    // Static methods for common errors
    static badRequest(message = 'Bad Request') {
      return new ApiError(400, message);
    }
  
    static unauthorized(message = 'Unauthorized') {
      return new ApiError(401, message);
    }
  
    static forbidden(message = 'Forbidden') {
      return new ApiError(403, message);
    }
  
    static notFound(message = 'Resource not found') {
      return new ApiError(404, message);
    }
  
    static conflict(message = 'Conflict') {
      return new ApiError(409, message);
    }
  
    static tooManyRequests(message = 'Too many requests') {
      return new ApiError(429, message);
    }
  
    static internal(message = 'Internal Server Error') {
      return new ApiError(500, message, false);
    }
  }
  
  module.exports = ApiError;