import mongoose from "mongoose";

// Validation middleware factory
export const validateRequest = (validationRules) => {
  return (req, res, next) => {
    const errors = [];

    for (const rule of validationRules) {
      const { field, type, required, minLength, maxLength, location = 'body', message } = rule;
      
      // Get value from appropriate location (body, params, query)
      let value;
      switch (location) {
        case 'params':
          value = req.params[field];
          break;
        case 'query':
          value = req.query[field];
          break;
        default:
          value = req.body[field];
      }

      // Check if required field is present
      if (required && (value === undefined || value === null || value === '')) {
        errors.push(message || `${field} is required`);
        continue;
      }

      // Skip validation if field is not required and not present
      if (!required && (value === undefined || value === null || value === '')) {
        continue;
      }

      // Type validation
      switch (type) {
        case 'string':
          if (typeof value !== 'string') {
            errors.push(message || `${field} must be a string`);
          } else {
            if (minLength && value.length < minLength) {
              errors.push(message || `${field} must be at least ${minLength} characters long`);
            }
            if (maxLength && value.length > maxLength) {
              errors.push(message || `${field} must be no more than ${maxLength} characters long`);
            }
          }
          break;

        case 'number':
          if (typeof value !== 'number' || isNaN(value)) {
            errors.push(message || `${field} must be a valid number`);
          }
          break;

        case 'array':
          if (!Array.isArray(value)) {
            errors.push(message || `${field} must be an array`);
          } else {
            if (minLength && value.length < minLength) {
              errors.push(message || `${field} must contain at least ${minLength} items`);
            }
            if (maxLength && value.length > maxLength) {
              errors.push(message || `${field} must contain no more than ${maxLength} items`);
            }
          }
          break;

        case 'boolean':
          if (typeof value !== 'boolean') {
            errors.push(message || `${field} must be a boolean`);
          }
          break;

        case 'mongoId':
          if (!mongoose.Types.ObjectId.isValid(value)) {
            errors.push(message || `${field} must be a valid MongoDB ObjectId`);
          }
          break;

        case 'email':
          const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
          if (typeof value !== 'string' || !emailRegex.test(value)) {
            errors.push(message || `${field} must be a valid email address`);
          }
          break;

        default:
          // No specific type validation
          break;
      }
    }

    if (errors.length > 0) {
      return res.status(400).json({
        message: 'Validation failed',
        errors
      });
    }

    next();
  };
};

// Specific validation functions for common use cases
export const validateTechnologyRating = (req, res, next) => {
  const { technologies } = req.body;

  if (!Array.isArray(technologies)) {
    return res.status(400).json({
      message: 'Technologies must be an array'
    });
  }

  const errors = [];

  technologies.forEach((tech, index) => {
    if (!tech.name || typeof tech.name !== 'string' || tech.name.trim().length === 0) {
      errors.push(`Technology at index ${index} must have a valid name`);
    }

    if (typeof tech.rating !== 'number' || tech.rating < 1 || tech.rating > 10) {
      errors.push(`Technology "${tech.name || `at index ${index}`}" must have a rating between 1 and 10`);
    }

    if (tech.category && typeof tech.category !== 'string') {
      errors.push(`Technology "${tech.name || `at index ${index}`}" category must be a string`);
    }
  });

  if (errors.length > 0) {
    return res.status(400).json({
      message: 'Technology validation failed',
      errors
    });
  }

  next();
};

// Middleware to sanitize input data
export const sanitizeInput = (req, res, next) => {
  // Recursively sanitize object
  const sanitize = (obj) => {
    if (typeof obj === 'string') {
      return obj.trim();
    }
    if (Array.isArray(obj)) {
      return obj.map(sanitize);
    }
    if (obj && typeof obj === 'object') {
      const sanitized = {};
      for (const key in obj) {
        if (obj.hasOwnProperty(key)) {
          sanitized[key] = sanitize(obj[key]);
        }
      }
      return sanitized;
    }
    return obj;
  };

  req.body = sanitize(req.body);
  req.query = sanitize(req.query);
  req.params = sanitize(req.params);

  next();
};

// Rate limiting middleware for SWOT generation (prevent abuse)
const swotGenerationAttempts = new Map();

export const rateLimitSWOTGeneration = (req, res, next) => {
  const userId = req.user.id;
  const now = Date.now();
  const windowMs = 60 * 60 * 1000; // 1 hour
  const maxAttempts = 10; // Max 10 SWOT generations per hour

  // Clean old entries
  for (const [key, value] of swotGenerationAttempts.entries()) {
    if (now - value.firstAttempt > windowMs) {
      swotGenerationAttempts.delete(key);
    }
  }

  const userAttempts = swotGenerationAttempts.get(userId);

  if (userAttempts) {
    if (userAttempts.count >= maxAttempts) {
      return res.status(429).json({
        message: 'Too many SWOT generation requests. Please try again later.',
        retryAfter: Math.ceil((userAttempts.firstAttempt + windowMs - now) / 1000)
      });
    }
    userAttempts.count++;
  } else {
    swotGenerationAttempts.set(userId, {
      count: 1,
      firstAttempt: now
    });
  }

  next();
};

export default {
  validateRequest,
  validateTechnologyRating,
  sanitizeInput,
  rateLimitSWOTGeneration
};