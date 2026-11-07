import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import crypto from "crypto";
import userModel from "../models/userModel.js";
import transporter from "../config/nodemailer.js";
import { EMAIL_VERIFY_TEMPLATE, PASSWORD_RESET_TEMPLATE } from "../config/emailTemplates.js";
import { hashToken } from "../services/inviteTokens.js";
import { audit } from "../services/audit.js";

const cookieOptions = () => ({
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: process.env.NODE_ENV === "production" ? "none" : "strict",
});

const generateOtp = () => String(crypto.randomInt(100000, 1000000));

const signToken = (user) =>
  jwt.sign(
    {
      id: user._id,
      role: user.role,
      institutionId: user.institutionId,
      accountType: user.accountType,
      userType: "fresher",
    },
    process.env.JWT_SECRET,
    { expiresIn: "7d" }
  );

const PASSWORD_RULE = /^(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z0-9]).{6,}$/;

// Open registration no longer exists. People are invited by their university and activate the
// account here with the single-use token from the invitation link.
export const acceptInvite = async (req, res) => {
  const { token, password, name, phoneNumber } = req.body || {};

  if (typeof token !== "string" || !/^[a-f0-9]{64}$/i.test(token) || !password) {
    return res.status(400).json({ success: false, code: "INVITE_INVALID", message: "A valid invitation token and a password are required" });
  }
  if (typeof password !== "string" || !PASSWORD_RULE.test(password)) {
    return res.status(400).json({
      success: false,
      message: "Password must be at least 6 characters long, include one uppercase letter, one number, and one special character",
    });
  }
  if (phoneNumber !== undefined && phoneNumber !== "" && !/^\d{10}$/.test(String(phoneNumber))) {
    return res.status(400).json({ success: false, message: "Phone number must be exactly 10 digits" });
  }
  if (name !== undefined && (typeof name !== "string" || !name.trim() || name.trim().length > 100)) {
    return res.status(400).json({ success: false, message: "Name must be 1 to 100 characters" });
  }

  try {
    const user = await userModel.findOne({ inviteTokenHash: hashToken(token) });

    if (!user || user.status !== "invited") {
      return res.status(400).json({ success: false, code: "INVITE_INVALID", message: "This invitation is not valid. Ask your administrator to send a new one." });
    }
    if (!user.inviteExpiresAt || new Date(user.inviteExpiresAt).getTime() < Date.now()) {
      return res.status(400).json({ success: false, code: "INVITE_EXPIRED", message: "This invitation has expired. Ask your administrator to send a new one." });
    }

    user.password = await bcrypt.hash(password, 10);
    user.status = "active";
    user.inviteTokenHash = "";
    user.inviteExpiresAt = null;
    // The link was delivered to this mailbox, so the address counts as verified.
    user.isAccountVerified = true;
    if (name) user.name = name.trim();
    if (phoneNumber) user.phoneNumber = String(phoneNumber);
    await user.save();

    await audit({ actor: user._id, action: "user.invite_accept", target: user._id, institutionId: user.institutionId });

    res.cookie("token", signToken(user), { ...cookieOptions(), maxAge: 7 * 24 * 60 * 60 * 1000 });

    return res.json({
      success: true,
      message: "Your account is ready.",
      role: user.role,
      institutionId: user.institutionId,
      accountType: user.accountType,
      isAccountVerified: true,
      needsVerification: false,
      userType: "fresher",
    });
  } catch (error) {
    console.error("Accept invite error:", error);
    return res.status(500).json({ success: false, message: "Could not accept the invitation" });
  }
};

export const login = async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.json({
      success: false,
      message: "Email and password are required to login.",
    });
  }

  try {
    const user = await userModel.findOne({ email });
    const isMatch = user && user.password ? await bcrypt.compare(password, user.password) : false;

    if (!isMatch) {
      return res.status(401).json({
        success: false,
        message: "Invalid email or password. Please try again",
      });
    }

    // Checked after the password so the message only reaches someone who knows it
    if (user.status === "deactivated" || user.status === "invited") {
      return res.status(403).json({
        success: false,
        message: user.status === "deactivated"
          ? "This account has been deactivated. Contact your university administrator."
          : "This account has not been activated yet. Use the link in your invitation email.",
      });
    }

    res.cookie("token", signToken(user), {
      ...cookieOptions(),
      maxAge: 7 * 24 * 60 * 60 * 1000,
    });

    return res.json({
      success: true,
      role: user.role,
      institutionId: user.institutionId,
      accountType: user.accountType,
      isAccountVerified: user.isAccountVerified || false,
      needsVerification: !user.isAccountVerified,
      userType: "fresher",
    });
  } catch (error) {
    console.error("Login error:", error);
    res.json({ success: false, message: error.message });
  }
};

export const logout = async (req, res) => {
  try {
    res.clearCookie("token", cookieOptions());
    return res.json({ success: true, message: "Logged out successfully" });
  } catch (error) {
    res.json({ success: false, message: error.message });
  }
};

export const sendVerifyOtp = async (req, res) => {
  try {
    const user = await userModel.findById(req.user.id);

    if (!user) {
      return res.json({ success: false, message: "User not found" });
    }

    if (user.isAccountVerified) {
      return res.json({ success: false, message: "Account is already verified" });
    }

    const otp = generateOtp();
    user.verifyOtp = otp;
    user.verifyOtpExpireAt = Date.now() + 24 * 60 * 60 * 1000;
    await user.save();

    await transporter.sendMail({
      from: process.env.SENDER_EMAIL,
      to: user.email,
      subject: "OTP to Verify Account",
      html: EMAIL_VERIFY_TEMPLATE.replace("{{otp}}", otp).replace("{{email}}", user.email),
    });

    res.json({ success: true, message: "Verification OTP sent" });
  } catch (error) {
    console.error("Send OTP error:", error);
    res.json({ success: false, message: error.message });
  }
};

export const verifyEmail = async (req, res) => {
  const { otp } = req.body;

  if (!req.user.id || !otp) {
    return res.json({ success: false, message: "Missing details" });
  }

  try {
    const user = await userModel.findById(req.user.id);

    if (!user) {
      return res.json({ success: false, message: "User not found" });
    }

    if (user.verifyOtp === "" || user.verifyOtp !== otp) {
      return res.json({ success: false, message: "Invalid OTP" });
    }

    if (user.verifyOtpExpireAt < Date.now()) {
      return res.json({ success: false, message: "OTP expired" });
    }

    user.isAccountVerified = true;
    user.verifyOtp = "";
    user.verifyOtpExpireAt = 0;
    await user.save();

    return res.json({ success: true, message: "Email verified successfully" });
  } catch (error) {
    return res.json({ success: false, message: error.message });
  }
};

export const isAuthenticated = async (req, res) => {
  try {
    const user = await userModel.findById(req.user.id);

    if (!user) {
      return res.json({ success: false, message: "User not found" });
    }

    return res.json({
      success: true,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        accountType: user.accountType,
        role: user.role,
        institutionId: user.institutionId,
        status: user.status,
        isAccountVerified: user.isAccountVerified || false,
        phoneNumber: user.phoneNumber,
        lastActive: user.lastActive || user.updatedAt,
        createdAt: user.createdAt,
        updatedAt: user.updatedAt,
        userType: "fresher",
      },
    });
  } catch (error) {
    console.error("Auth check error:", error);
    return res.json({ success: false, message: error.message });
  }
};

export const sendResetOtp = async (req, res) => {
  const { email } = req.body;

  if (!email) {
    return res.json({ success: false, message: "Email is required" });
  }

  try {
    const user = await userModel.findOne({ email });

    if (!user || user.status === "deactivated" || user.status === "invited") {
      return res.json({ success: false, message: "User not found" });
    }

    const otp = generateOtp();
    user.resetOtp = otp;
    user.resetOtpExpireAt = Date.now() + 15 * 60 * 1000;
    await user.save();

    await transporter.sendMail({
      from: process.env.SENDER_EMAIL,
      to: user.email,
      subject: "OTP to Reset Password",
      html: PASSWORD_RESET_TEMPLATE.replace("{{otp}}", otp).replace("{{email}}", user.email),
    });

    res.json({ success: true, message: "Reset OTP sent" });
  } catch (error) {
    return res.json({ success: false, message: error.message });
  }
};

export const resetPassword = async (req, res) => {
  const { email, otp, newPassword } = req.body;

  if (!email || !otp || !newPassword) {
    return res.json({
      success: false,
      message: "Email, OTP and the new password are required",
    });
  }

  try {
    const user = await userModel.findOne({ email });

    if (!user || user.status === "deactivated" || user.status === "invited") {
      return res.json({ success: false, message: "User not found" });
    }

    if (user.resetOtp === "" || user.resetOtp !== otp) {
      return res.json({ success: false, message: "Invalid OTP" });
    }

    if (user.resetOtpExpireAt < Date.now()) {
      return res.json({ success: false, message: "OTP expired" });
    }

    user.password = await bcrypt.hash(newPassword, 10);
    user.resetOtp = "";
    user.resetOtpExpireAt = 0;
    await user.save();

    return res.json({
      success: true,
      message: "Password has been reset successfully",
    });
  } catch (error) {
    return res.json({ success: false, message: error.message });
  }
};
