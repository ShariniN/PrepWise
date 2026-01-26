import Admin from '../models/AdminModel.js';
import jwt from 'jsonwebtoken';

// Generate JWT token
const generateToken = (adminId) => {
  return jwt.sign(
    { adminId, type: 'admin' },
    process.env.JWT_SECRET || 'your-jwt-secret',
    { expiresIn: '24h' }
  );
};

// @desc    Admin login
// @route   POST /api/admin/login
// @access  Public
const loginAdmin = async (req, res) => {
  try {
    const { email, password } = req.body;

    // Check if email and password are provided
    if (!email || !password) {
      return res.status(400).json({
        success: false,
        message: 'Please provide email and password'
      });
    }

    // Find admin and include password field
    const admin = await Admin.findOne({ email }).select('+password');

    if (!admin) {
      return res.status(401).json({
        success: false,
        message: 'Invalid credentials'
      });
    }

    // Check password
    const isPasswordValid = await admin.comparePassword(password);

    if (!isPasswordValid) {
      return res.status(401).json({
        success: false,
        message: 'Invalid credentials'
      });
    }

    // Generate token
    const token = generateToken(admin._id);

    // Send response with token
    res.status(200).json({
      success: true,
      message: 'Login successful',
      token,
      admin: {
        id: admin._id,
        name: admin.name,
        email: admin.email
      }
    });

  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Server error',
      error: error.message
    });
  }
};

// @desc    Get admin profile
// @route   GET /api/admin/profile
// @access  Private
const getAdminProfile = async (req, res) => {
  try {
    const admin = await Admin.findById(req.admin.id);

    if (!admin) {
      return res.status(404).json({
        success: false,
        message: 'Admin not found'
      });
    }

    res.status(200).json({
      success: true,
      admin: {
        id: admin._id,
        name: admin.name,
        email: admin.email
      }
    });

  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Server error',
      error: error.message
    });
  }
};

export { loginAdmin, getAdminProfile };