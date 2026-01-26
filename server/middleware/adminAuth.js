import jwt from 'jsonwebtoken';
import Admin from '../models/AdminModel.js';

// Protect admin routes
const protectAdmin = async (req, res, next) => {
  try {
    let token;

    // Get token from header
    if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
      token = req.headers.authorization.split(' ')[1];
    }

    if (!token) {
      return res.status(401).json({
        success: false,
        message: 'Access denied. No token provided.'
      });
    }

    // Verify token
    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'your-jwt-secret');

    // Check if admin exists
    const admin = await Admin.findById(decoded.adminId);

    if (!admin) {
      return res.status(401).json({
        success: false,
        message: 'Access denied. Admin not found.'
      });
    }

    // Add admin to request
    req.admin = {
      id: admin._id,
      name: admin.name,
      email: admin.email
    };

    next();

  } catch (error) {
    res.status(401).json({
      success: false,
      message: 'Access denied. Invalid token.'
    });
  }
};

export { protectAdmin };