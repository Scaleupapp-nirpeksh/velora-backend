// src/utils/apiResponse.js

/**
 * Standard API Response Utility
 * Can be used both as constructor and with static methods
 */
class ApiResponse {
  /**
   * Constructor for response object
   * @param {Number} statusCode - HTTP status code
   * @param {Object} data - Response data
   * @param {String} message - Response message
   */
  constructor(statusCode, data = null, message = 'Success') {
    this.success = statusCode < 400;
    this.statusCode = statusCode;
    this.message = message;
    this.data = data;
  }

  /**
   * Success response (Static method)
   * @param {Object} res - Express response object
   * @param {Number} statusCode - HTTP status code
   * @param {String} message - Success message
   * @param {Object} data - Response data
   */
  static success(res, statusCode = 200, message = 'Success', data = null) {
    const response = {
      success: true,
      statusCode,
      message,
      data,
    };

    return res.status(statusCode).json(response);
  }

  /**
   * Error response (Static method)
   * @param {Object} res - Express response object
   * @param {Number} statusCode - HTTP status code
   * @param {String} message - Error message
   * @param {Object} errors - Validation errors or additional error info
   */
  static error(res, statusCode = 500, message = 'Internal Server Error', errors = null) {
    const response = {
      success: false,
      statusCode,
      message,
    };

    if (errors) {
      response.errors = errors;
    }

    return res.status(statusCode).json(response);
  }

  /**
   * Validation error response (Static method)
   * @param {Object} res - Express response object
   * @param {Array} errors - Array of validation errors
   */
  static validationError(res, errors) {
    return this.error(res, 400, 'Validation Error', errors);
  }

  /**
   * Unauthorized response (Static method)
   * @param {Object} res - Express response object
   * @param {String} message - Error message
   */
  static unauthorized(res, message = 'Unauthorized') {
    return this.error(res, 401, message);
  }

  /**
   * Forbidden response (Static method)
   * @param {Object} res - Express response object
   * @param {String} message - Error message
   */
  static forbidden(res, message = 'Forbidden') {
    return this.error(res, 403, message);
  }

  /**
   * Not found response (Static method)
   * @param {Object} res - Express response object
   * @param {String} message - Error message
   */
  static notFound(res, message = 'Resource not found') {
    return this.error(res, 404, message);
  }

  /**
   * Paginated response (Static method)
   * @param {Object} res - Express response object
   * @param {Array} data - Array of data
   * @param {Number} page - Current page
   * @param {Number} limit - Items per page
   * @param {Number} total - Total items
   * @param {String} message - Success message
   */
  static paginated(res, data, page, limit, total, message = 'Success') {
    const totalPages = Math.ceil(total / limit);
    
    const response = {
      success: true,
      statusCode: 200,
      message,
      data,
      pagination: {
        currentPage: page,
        totalPages,
        totalItems: total,
        itemsPerPage: limit,
        hasNextPage: page < totalPages,
        hasPreviousPage: page > 1,
      },
    };

    return res.status(200).json(response);
  }
}

module.exports = ApiResponse;