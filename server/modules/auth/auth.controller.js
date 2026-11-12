import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import crypto from "crypto";
import userModel from "../../models/User.js";
import transporter from "../../config/nodemailer.js";
import { PASSWORD_RESET_TEMPLATE } from "../../config/emailTemplates.js";
import { hashToken } from "../../services/inviteTokens.js";
import { audit } from "../../services/audit.js";
import { isKnownRole } from "../../config/roles.js";
import { passwordOk, PASSWORD_MESSAGE } from "../../services/accountRules.js";
import { startSignup, resendVerification, completeVerification, exposeVerifyLinks, SignupError, SIGNUP_MESSAGE, RESEND_MESSAGE } from "./auth.signup.js";
import { targetRoleTitleFor } from "../institution/institution.service.js";

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

const INVITE_INVALID_MESSAGE = "This invitation is not valid. Ask your administrator to send a new one.";

// Open registration no longer exists. People are invited by their university and activate the
// account here with the single-use token from the invitation link.
export const acceptInvite = async (req, res) => {
  const { token, password, name, phoneNumber } = req.body || {};

  if (typeof token !== "string" || !/^[a-f0-9]{64}$/i.test(token)) {
    return res.status(400).json({ success: false, code: "INVITE_INVALID", message: INVITE_INVALID_MESSAGE });
  }
  if (!password) {
    return res.status(400).json({ success: false, message: "Choose a password to finish setting up your account." });
  }
  if (!passwordOk(password)) {
    return res.status(400).json({ success: false, message: PASSWORD_MESSAGE });
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
      return res.status(400).json({ success: false, code: "INVITE_INVALID", message: INVITE_INVALID_MESSAGE });
    }
    if (!user.inviteExpiresAt || new Date(user.inviteExpiresAt).getTime() < Date.now()) {
      return res.status(400).json({ success: false, code: "INVITE_EXPIRED", message: "This invitation has expired. Ask your administrator to send a new one." });
    }
    if (!isKnownRole(user.role)) {
      return res.status(403).json({ success: false, code: "ROLE_NOT_SUPPORTED", message: "This invitation is for a role PrepWise no longer has. Ask your administrator to change it." });
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

const sessionBody = (user) => ({
  success: true,
  role: user.role,
  institutionId: user.institutionId,
  accountType: user.accountType,
  isAccountVerified: user.isAccountVerified || false,
  needsVerification: !user.isAccountVerified,
  userType: "fresher",
});

export const signup = async (req, res) => {
  try {
    // A `password` field from older clients is accepted and ignored: it is chosen at verify.
    const { name, email } = req.body || {};
    const { link } = await startSignup({ name, email });
    return res.json({ success: true, message: SIGNUP_MESSAGE, ...(link && exposeVerifyLinks() ? { devVerificationLink: link } : {}) });
  } catch (error) {
    if (error instanceof SignupError) return res.status(error.status).json({ success: false, code: error.code, message: error.message });
    console.error("Signup error:", error);
    return res.status(500).json({ success: false, message: "Could not sign you up" });
  }
};

export const verifyEmailLink = async (req, res) => {
  try {
    const { token, password } = req.body || {};
    const user = await completeVerification(token, password);
    res.cookie("token", signToken(user), { ...cookieOptions(), maxAge: 7 * 24 * 60 * 60 * 1000 });
    return res.json(sessionBody(user));
  } catch (error) {
    if (error instanceof SignupError) return res.status(error.status).json({ success: false, code: error.code, message: error.message });
    console.error("Verify email error:", error);
    return res.status(500).json({ success: false, message: "Could not verify your email" });
  }
};

export const resendVerificationLink = async (req, res) => {
  try {
    await resendVerification((req.body || {}).email);
  } catch (error) {
    console.error("Resend verification error:", error);
  }
  return res.json({ success: true, message: RESEND_MESSAGE });
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
    if (user.status === "unverified") {
      return res.status(403).json({ success: false, code: "EMAIL_NOT_VERIFIED", message: "Verify your email first. We can send a new link." });
    }
    if (user.status === "deactivated" || user.status === "invited") {
      return res.status(403).json({
        success: false,
        message: user.status === "deactivated"
          ? "This account has been deactivated. Contact your university administrator."
          : "This account has not been activated yet. Use the link in your invitation email.",
      });
    }

    // Accounts that still carry a removed role (career_officer) get no session at all.
    if (!isKnownRole(user.role)) {
      return res.status(403).json({
        success: false,
        code: "ROLE_NOT_SUPPORTED",
        message: "Your account has no role with access to PrepWise. Ask your university administrator to assign one.",
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

export const isAuthenticated = async (req, res) => {
  try {
    const user = await userModel.findById(req.user.id);

    if (!user) {
      return res.json({ success: false, message: "User not found" });
    }

    const targetRoleId = user.targetRoleId || null;

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
        targetRoleId,
        targetRoleTitle: await targetRoleTitleFor(user),
        needsOnboarding: user.role === "student" && !targetRoleId,
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
