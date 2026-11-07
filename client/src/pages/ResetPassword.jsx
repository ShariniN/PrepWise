import React, { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import AuthLayout from '../components/AuthLayout';
import { Button, Field, Input } from '../components/ui';
import { Mail, Lock } from 'lucide-react';
import { useContext } from "react";
import { AppContext } from "../context/AppContext";
import axios from "axios";
import { toast } from "react-toastify";

const ResetPassword = () => {

  // Get backend URL from context
  const {backendUrl} = useContext(AppContext)
  // Send cookies with requests
  axios.defaults.withCredentials = true

  const navigate = useNavigate();

  // Form states
  const [email, setEmail] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [isEmailSent, setIsEmailSent] = useState("");
  const [otp, setOtp] = useState(0);
  const [isOtpSubmitted, setIsOtpSubmitted] = useState(false);

  // Refs for each OTP input field
  const inputRefs = React.useRef([]);

  // Automatically focus next input field when a digit is entered
  const handleInput = (e, index) => {
    if (e.target.value.length > 0 && index < inputRefs.current.length - 1) {
      inputRefs.current[index + 1].focus();
    }
  };

  // Automatically focus previous field if backspace is pressed and input is empty
  const handleKeyDown = (e, index) => {
    if (e.key === "Backspace" && e.target.value === "" && index > 0) {
      inputRefs.current[index - 1].focus();
    }
  };

  // Handles pasting of OTP digits into inputs
  const handlePaste = (e, index) => {
    const paste = e.clipboardData.getData('text')
    const pasteArray = paste.split('');
    pasteArray.forEach((char, index) => {
      if(inputRefs.current[index]){
        inputRefs.current[index].value = char;
      }
    });
  }

  // Handles submission of email to receive OTP
  const onSubmitEmail = async (e) => {
    e.preventDefault();
    try {
      const {data} = await axios.post(backendUrl + '/api/auth/send-reset-otp', {email})
      data.success ? toast.success(data.message) : toast.error(data.message)
      data.success && setIsEmailSent(true)
    } catch (error) {
      toast.error(error.message)
    }
    
  }

  // Handles OTP input form submission
  const onSubmitOtp = async (e) => {
    e.preventDefault();
    const otpArray = inputRefs.current.map(e => e.value)
    setOtp(otpArray.join(''))
    setIsOtpSubmitted(true)
  }

  // Handles new password reset submission
  const onSubmitNewPassword = async (e) => {
    e.preventDefault();
    try {
      const {data} = await axios.post(backendUrl + '/api/auth/reset-password', {email, otp, newPassword})
      data.success ? toast.success(data.message) : toast.error(data.message)
      // Redirect to login
      data.success && navigate('/login')
    } catch (error) {
      toast.error(error.message)
    }
  }

  return (
    <>
      {/* Form to enter email address */}

      {!isEmailSent &&

      <AuthLayout title="Reset Password" subtitle="Enter your email address to receive an OTP" footer={<Link to="/login" className="font-medium text-primary-700 hover:underline">Back to login</Link>}>
        <form onSubmit={onSubmitEmail} className="space-y-4" action="">
          <Field label="Email">
            {(p) => (
              <Input
                {...p}
                icon={<Mail size={16} aria-hidden="true" />}
                type="email"
                required
                placeholder="Email address"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            )}
          </Field>
          <Button type="submit" block size="lg">Submit</Button>
        </form>
      </AuthLayout>
      }
      {/* Form to enter OTP */}

      {!isOtpSubmitted && isEmailSent &&
      <AuthLayout title="Reset Password" subtitle="Enter the 6-digit OTP sent to your email">
        <form onSubmit={onSubmitOtp} action="">
          <div className="flex justify-between gap-2 mb-8" onPaste={handlePaste}>
            {Array(6)
              .fill(0)
              .map((_, i) => (
                <input
                  type="text"
                  aria-label={`Digit ${i + 1}`}
                  inputMode="numeric"
                  className="h-14 w-full min-w-0 rounded-2xl border border-line bg-surface text-center font-display text-2xl font-semibold text-ink transition hover:border-primary-300 focus:border-primary-600 focus:outline-none focus:ring-4 focus:ring-primary-600/15"
                  maxLength="1"
                  key={i}
                  required
                  ref={(e) => (inputRefs.current[i] = e)}
                  onInput={(e) => handleInput(e, i)}
                  onKeyDown={(e) => handleKeyDown(e, i)}
                />
              ))}
          </div>
          <Button type="submit" block size="lg">Submit OTP</Button>
        </form>
      </AuthLayout>
      }

      {/* Form to enter new password */}

      {isOtpSubmitted && isEmailSent &&
      <AuthLayout title="Reset Password" subtitle="Enter your new password here">
        <form onSubmit={onSubmitNewPassword} className="space-y-4" action="">
          <Field label="New password">
            {(p) => (
              <Input
                {...p}
                icon={<Lock size={16} aria-hidden="true" />}
                type="password"
                required
                placeholder="******"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
              />
            )}
          </Field>
          <Button type="submit" block size="lg">Reset Password</Button>
        </form>
      </AuthLayout>
      }
    </>
  );
};

export default ResetPassword;
