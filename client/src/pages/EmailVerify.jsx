import React, { useContext, useEffect } from "react";
import { AppContext } from "../context/AppContext";
import { toast } from "react-toastify";
import { useNavigate } from "react-router-dom";
import axios from 'axios';

const EmailVerify = () => {

  // Ensure credentials like cookies are included in all axios requests
  axios.defaults.withCredentials = true;

  // Extract values from context
  const {backendUrl, isLoggedin, userData, getUserData} = useContext(AppContext)

  const navigate = useNavigate()

  // Create a ref array to access each OTP input field
  const inputRefs = React.useRef([])

  // Automatically move to the next input field when a digit is entered
  const handleInput = (e, index)=>{
    if(e.target.value.length > 0 && index < inputRefs.current.length -1){
      inputRefs.current[index + 1].focus();
    }
  }

  // Handle backspace to move to the previous inpu
  const handleKeyDown = (e, index) => {
    if(e.key === 'Backspace' && e.target.value === '' && index > 0){
      inputRefs.current[index - 1].focus();
    }
  }

  // Handle OTP form submission
  const onSubmitHandler = async (e) => {
    try {
      e.preventDefault();
      // Collect the OTP digits from each input
      const otpArray = inputRefs.current.map(e => e.value)
      const otp = otpArray.join('')

      // Send OTP to backend for verification
      const {data} = await axios.post(backendUrl + '/api/auth/verify-account', {otp})

      if(data.success){
        toast.success(data.message)
        // Refresh user data after verification and redirect to login
        getUserData()
        navigate('/login')
      }
      else{
        toast.error(data.message)
      }
    } catch (error) {
      toast.error(error.message)
    }
  } 

  // Allow users to paste the OTP
  const handlePaste = (e, index) => {
    const paste = e.clipboardData.getData('text')
    const pasteArray = paste.split('');
    pasteArray.forEach((char, index) => {
      if(inputRefs.current[index]){
        inputRefs.current[index].value = char;
      }
    });
  }

  // Redirect if the user is already logged in and verified
  useEffect(() =>{
    isLoggedin && userData && userData.isAccountVerified && navigate('/login')
  }, [isLoggedin, userData])

  return (
    <div className="flex items-center justify-center min-h-screen bg-gradient-to-br from-blue-200 to-purple-400">
      <form
        onSubmit={onSubmitHandler}
        className="bg-slate-900 p-8 rounded-lg shadow-lg w-96 text-sm"
        action="">
        <h1 className="text-white text-2xl font-semibold text-center mb-4">
          Email Verification
        </h1>
        <p className="text-center mb-6 text-indigo-300">
          Enter the 6-digit OTP sent to your email
        </p>
        <div className="flex justify-between mb-8" onPaste={handlePaste}>
          {Array(6).fill(0).map((_, index) => (
              <input
                type="text"
                className="w-12 h-12 bg-[#333A5C] text-white text-center text-xl rounded-md"
                maxLength="1"
                key={index}
                required
                ref={e => inputRefs.current[index] = e}
                onInput={(e) => handleInput(e, index)}
                onKeyDown={(e) => handleKeyDown(e, index)}
              />
            ))}
        </div>
        <button className="w-full py-3 bg-gradient-to-r from-indigo-500 to-indigo-900 text-white rounded-full">Verify Email</button>
      </form>
    </div>
  );
};

export default EmailVerify;
