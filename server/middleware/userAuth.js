
import jwt from "jsonwebtoken";
import userModel from "../models/userModel.js";
import trainerModel from "../models/TrainerModel.js";

const userAuth = async (req, res, next) => {
  const token = req.cookies.token;
  
  if (!token) {
    return res.status(401).json({ 
      success: false, 
      message: "Not Authorized. Please login again" 
    });
  }

  try {
    // Verify the token
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    
    if (!decoded.id) {
      return res.status(401).json({ 
        success: false, 
        message: "Invalid token. Please login again" 
      });
    }

    // Determine user type from token or try to find user
    let user;
    let userType = decoded.userType; // This should be set during login/register

    if (userType === 'trainer') {
      user = await trainerModel.findById(decoded.id).select('+password');
    } else if (userType === 'fresher') {
      user = await userModel.findById(decoded.id);
    } else {
      // Fallback: try both models if userType is not specified
      user = await userModel.findById(decoded.id);
      if (user) {
        userType = 'fresher';
      } else {
        user = await trainerModel.findById(decoded.id).select('+password');
        if (user) {
          userType = 'trainer';
        }
      }
    }

    if (!user) {
      return res.status(401).json({ 
        success: false, 
        message: "User not found. Please login again" 
      });
    }

    // Attach user info to request
    req.user = {
      id: user._id,
      userType: userType,
      accountType: user.accountType || 'Trainer',
      email: user.email,
      name: user.name,
      isAccountVerified: user.isAccountVerified || false,
      // Include the full user object for controllers that need it
      ...user.toObject()
    };

    next();
  } catch (error) {
    console.error("Auth middleware error:", error);
    if (error.name === 'JsonWebTokenError') {
      return res.status(401).json({ 
        success: false, 
        message: "Invalid token. Please login again" 
      });
    } else if (error.name === 'TokenExpiredError') {
      return res.status(401).json({ 
        success: false, 
        message: "Token expired. Please login again" 
      });
    } else {
      return res.status(500).json({ 
        success: false, 
        message: "Authentication failed" 
      });
    }
  }
};

export default userAuth;