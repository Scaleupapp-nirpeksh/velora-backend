const logger = require('../utils/logger');

/**
 * Distance Service
 * Calculates geographic distance between two coordinates using Haversine formula
 */
class DistanceService {
  /**
   * Calculate distance between two geographic coordinates
   * Uses Haversine formula for accuracy on Earth's spherical surface
   * 
   * @param {Number} lat1 - Latitude of point 1
   * @param {Number} lon1 - Longitude of point 1
   * @param {Number} lat2 - Latitude of point 2
   * @param {Number} lon2 - Longitude of point 2
   * @returns {Number} - Distance in kilometers
   */
  static calculateDistance(lat1, lon1, lat2, lon2) {
    try {
      // Validate inputs
      if (!this._isValidCoordinate(lat1, lon1) || !this._isValidCoordinate(lat2, lon2)) {
        logger.warn('Invalid coordinates provided to calculateDistance', {
          lat1, lon1, lat2, lon2
        });
        return null;
      }

      // Earth's radius in kilometers
      const R = 6371;

      // Convert degrees to radians
      const dLat = this._toRadians(lat2 - lat1);
      const dLon = this._toRadians(lon2 - lon1);
      const radLat1 = this._toRadians(lat1);
      const radLat2 = this._toRadians(lat2);

      // Haversine formula
      const a =
        Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos(radLat1) * Math.cos(radLat2) *
        Math.sin(dLon / 2) * Math.sin(dLon / 2);

      const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

      // Distance in kilometers
      const distance = R * c;

      // Round to 2 decimal places
      return Math.round(distance * 100) / 100;
    } catch (error) {
      logger.error('Error calculating distance:', error);
      return null;
    }
  }

  /**
   * Calculate distance between two users
   * 
   * @param {Object} user1 - User 1 object with location.coordinates
   * @param {Object} user2 - User 2 object with location.coordinates
   * @returns {Number} - Distance in kilometers
   */
  static calculateDistanceBetweenUsers(user1, user2) {
    try {
      // Check if both users have location coordinates
      if (!user1?.location?.coordinates || !user2?.location?.coordinates) {
        logger.warn('Users missing location coordinates', {
          user1Id: user1?._id,
          user2Id: user2?._id,
          user1HasCoords: !!user1?.location?.coordinates,
          user2HasCoords: !!user2?.location?.coordinates
        });
        return null;
      }

      // MongoDB stores coordinates as [longitude, latitude]
      const [lon1, lat1] = user1.location.coordinates;
      const [lon2, lat2] = user2.location.coordinates;

      return this.calculateDistance(lat1, lon1, lat2, lon2);
    } catch (error) {
      logger.error('Error calculating distance between users:', error);
      return null;
    }
  }

  /**
   * Check if user is within distance limit
   * 
   * @param {Object} user1 - User 1 object
   * @param {Object} user2 - User 2 object
   * @param {Number} maxDistanceKm - Maximum distance in kilometers
   * @returns {Boolean} - True if within limit, false otherwise
   */
  static isWithinDistance(user1, user2, maxDistanceKm) {
    const distance = this.calculateDistanceBetweenUsers(user1, user2);
    
    if (distance === null) {
      // If we can't calculate distance, default to allowing the match
      // (Some users might not have set location yet)
      return true;
    }

    return distance <= maxDistanceKm;
  }

  /**
   * Get distance limit based on user's premium status
   * 
   * @param {Object} user - User object
   * @returns {Number} - Maximum distance in kilometers
   */
  static getDistanceLimit(user) {
    const isPremium = user.isPremium && user.premiumExpiry > new Date();
    
    // In development mode, allow manual premium testing
    if (process.env.NODE_ENV === 'development' && 
        process.env.PREMIUM_TESTING_ENABLED === 'true') {
      return isPremium ? 
        parseInt(process.env.MATCHING_PREMIUM_DISTANCE_KM || 100) : 
        parseInt(process.env.MATCHING_MAX_DISTANCE_KM || 50);
    }

    // Production limits
    return isPremium ? 100 : 50; // Premium: 100km, Basic: 50km
  }

  /**
   * Filter users by distance
   * 
   * @param {Object} currentUser - Current user object
   * @param {Array} candidateUsers - Array of candidate user objects
   * @returns {Array} - Filtered users within distance limit
   */
  static filterByDistance(currentUser, candidateUsers) {
    const maxDistance = this.getDistanceLimit(currentUser);

    return candidateUsers.filter(candidate => {
      const distance = this.calculateDistanceBetweenUsers(currentUser, candidate);
      
      if (distance === null) {
        // Include users without location (they can set it later)
        return true;
      }

      return distance <= maxDistance;
    }).map(candidate => {
      // Attach distance to candidate for later use
      candidate.distanceKm = this.calculateDistanceBetweenUsers(currentUser, candidate);
      return candidate;
    });
  }

  /**
   * Format distance for display
   * 
   * @param {Number} distanceKm - Distance in kilometers
   * @returns {String} - Formatted distance string
   */
  static formatDistance(distanceKm) {
    if (distanceKm === null || distanceKm === undefined) {
      return 'Distance unknown';
    }

    if (distanceKm < 1) {
      return `${Math.round(distanceKm * 1000)}m away`;
    }

    if (distanceKm < 10) {
      return `${distanceKm.toFixed(1)}km away`;
    }

    return `${Math.round(distanceKm)}km away`;
  }

  // ==================== HELPER METHODS ====================

  /**
   * Convert degrees to radians
   * @private
   */
  static _toRadians(degrees) {
    return degrees * (Math.PI / 180);
  }

  /**
   * Validate coordinate values
   * @private
   */
  static _isValidCoordinate(lat, lon) {
    return (
      typeof lat === 'number' &&
      typeof lon === 'number' &&
      lat >= -90 && lat <= 90 &&
      lon >= -180 && lon <= 180 &&
      !isNaN(lat) && !isNaN(lon)
    );
  }

  /**
   * Calculate bounding box for efficient database queries
   * Returns min/max lat/lon for a given radius around a point
   * 
   * @param {Number} lat - Center latitude
   * @param {Number} lon - Center longitude
   * @param {Number} radiusKm - Radius in kilometers
   * @returns {Object} - Bounding box { minLat, maxLat, minLon, maxLon }
   */
  static getBoundingBox(lat, lon, radiusKm) {
    try {
      // Earth's radius in km
      const R = 6371;

      // Angular distance in radians
      const radDist = radiusKm / R;

      const minLat = lat - (radDist * 180 / Math.PI);
      const maxLat = lat + (radDist * 180 / Math.PI);

      // Account for longitude convergence at poles
      const minLon = lon - (radDist * 180 / Math.PI) / Math.cos(this._toRadians(lat));
      const maxLon = lon + (radDist * 180 / Math.PI) / Math.cos(this._toRadians(lat));

      return {
        minLat: Math.max(minLat, -90),
        maxLat: Math.min(maxLat, 90),
        minLon: Math.max(minLon, -180),
        maxLon: Math.min(maxLon, 180)
      };
    } catch (error) {
      logger.error('Error calculating bounding box:', error);
      return null;
    }
  }

  /**
   * Get MongoDB geospatial query for nearby users
   * Useful for optimizing database queries
   * 
   * @param {Object} user - User object with location
   * @param {Number} maxDistanceKm - Maximum distance in kilometers
   * @returns {Object} - MongoDB query object
   */
  static getNearbyQuery(user, maxDistanceKm) {
    if (!user?.location?.coordinates) {
      return {};
    }

    const [lon, lat] = user.location.coordinates;

    return {
      'location.coordinates': {
        $near: {
          $geometry: {
            type: 'Point',
            coordinates: [lon, lat]
          },
          $maxDistance: maxDistanceKm * 1000 // Convert km to meters
        }
      }
    };
  }
}

module.exports = DistanceService;