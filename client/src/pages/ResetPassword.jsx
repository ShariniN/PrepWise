import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { assets } from "../assets/assets";
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
    <div className="flex items-center justify-center min-h-screen bg-gradient-to-br from-blue-200 to-purple-400">

      {/* Form to enter email address */}

      {!isEmailSent && 

      <form onSubmit={onSubmitEmail}
        className="bg-slate-900 p-8 rounded-lg shadow-lg w-96 text-sm"
        action=""
      >
        <h1 className="text-white text-2xl font-semibold text-center mb-4">
          Reset Password
        </h1>
        <p className="text-center mb-6 text-indigo-300">
          Enter your email address to receive an OTP
        </p>
        <div className="mb-4 flex items-center gap-3 w-full px-5 py-3 rounded-full bg-[#333A5C]">
          <img src={assets.mail_icon} className="w-3 h-3" />
          <input
            type="email"
            className="bg-transparent outline-none text-white"
            required
            placeholder="Email address"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </div>
        <button className="w-full py-3 bg-gradient-to-r from-indigo-500 to-indigo-900 text-white rounded-full">
          Submit
        </button>
      </form>
      }
      {/* Form to enter OTP */}

      {!isOtpSubmitted && isEmailSent &&
      <form onSubmit={onSubmitOtp}
        className="bg-slate-900 p-8 rounded-lg shadow-lg w-96 text-sm"
        action=""
      >
        <h1 className="text-white text-2xl font-semibold text-center mb-4">
          Reset Password
        </h1>
        <p className="text-center mb-6 text-indigo-300">
          Enter the 6-digit OTP sent to your email
        </p>
        <div className="flex justify-between mb-8" onPaste={handlePaste}>
          {Array(6)
            .fill(0)
            .map((_, index) => (
              <input
                type="text"
                className="w-12 h-12 bg-[#333A5C] text-white text-center text-xl rounded-md"
                maxLength="1"
                key={index}
                required
                ref={(e) => (inputRefs.current[index] = e)}
                onInput={(e) => handleInput(e, index)}
                onKeyDown={(e) => handleKeyDown(e, index)}
              />
            ))}
        </div>
        <button className="w-full py-3 bg-gradient-to-r from-indigo-500 to-indigo-900 text-white rounded-full">
          Submit OTP
        </button>
      </form>
      }

      {/* Form to enter new password */}

      {isOtpSubmitted && isEmailSent &&
      <form onSubmit={onSubmitNewPassword}
        className="bg-slate-900 p-8 rounded-lg shadow-lg w-96 text-sm"
        action=""
      >
        <h1 className="text-white text-2xl font-semibold text-center mb-4">
          Reset Password
        </h1>
        <p className="text-center mb-6 text-indigo-300">
          Enter your new password here
        </p>
        <div className="mb-4 flex items-center gap-3 w-full px-5 py-3 rounded-full bg-[#333A5C]">
          <img src={assets.lock_icon} className="w-3 h-3" />
          <input
            type="password"
            className="bg-transparent outline-none text-white"
            required
            placeholder="******"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
          />
        </div>
        <button className="w-full py-3 bg-gradient-to-r from-indigo-500 to-indigo-900 text-white rounded-full">
          Reset Password
        </button>
      </form>
      }
    </div>
  );
};

export default ResetPassword;
