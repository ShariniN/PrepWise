import jwt from "jsonwebtoken";
import userModel from "../models/userModel.js";
import { runWithTenant } from "./tenancy.js";

const userAuth = async (req, res, next) => {
  const token = req.cookies.token;

  if (!token) {
    return res.status(401).json({
      success: false,
      message: "Not Authorized. Please login again",
    });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    if (!decoded.id) {
      return res.status(401).json({
        success: false,
        message: "Invalid token. Please login again",
      });
    }

    const user = await userModel.findById(decoded.id);

    if (!user) {
      return res.status(401).json({
        success: false,
        message: "User not found. Please login again",
      });
    }

    // Role, institution and status always come from the database, never from the token,
    // so deactivation and role changes take effect immediately.
    if (user.status === "deactivated" || user.status === "invited") {
      return res.status(401).json({
        success: false,
        message: "This account is not active.",
      });
    }

    // Spread first so the explicit fields below cannot be overwritten
    req.user = {
      ...user.toObject(),
      id: user._id,
      userType: "fresher",
      accountType: user.accountType,
      role: user.role,
      institutionId: user.institutionId,
      status: user.status,
      email: user.email,
      name: user.name,
      isAccountVerified: user.isAccountVerified || false,
    };

    return runWithTenant(user.institutionId, () => next());
  } catch (error) {
    if (error.name === "JsonWebTokenError") {
      return res.status(401).json({
        success: false,
        message: "Invalid token. Please login again",
      });
    }
    if (error.name === "TokenExpiredError") {
      return res.status(401).json({
        success: false,
        message: "Token expired. Please login again",
      });
    }
    console.error("Auth middleware error:", error);
    return res.status(500).json({
      success: false,
      message: "Authentication failed",
    });
  }
};

export default userAuth;
