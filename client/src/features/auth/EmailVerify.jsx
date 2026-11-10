import React, { useContext, useEffect } from "react";
import { AppContext } from "../../app/AppContext";
import { toast } from "react-toastify";
import { useNavigate } from "react-router-dom";
import axios from 'axios';
import AuthLayout from './components/AuthLayout';
import { Button } from '../../components/ui';

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
  const handlePaste = (e) => {
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
    <AuthLayout title="Email Verification" subtitle="Enter the 6-digit OTP sent to your email">
      <form onSubmit={onSubmitHandler} action="">
        <div className="flex justify-between gap-2 mb-8" onPaste={handlePaste}>
          {Array(6).fill(0).map((_, index) => (
              <input
                type="text"
                aria-label={`Digit ${index + 1}`}
                inputMode="numeric"
                autoComplete={index === 0 ? 'one-time-code' : 'off'}
                className="h-14 w-full min-w-0 rounded-2xl border border-line bg-surface text-center font-display text-2xl font-semibold text-ink transition hover:border-primary-300 focus:border-primary-600 focus:outline-none focus:ring-4 focus:ring-primary-600/15"
                maxLength="1"
                key={index}
                required
                ref={e => inputRefs.current[index] = e}
                onInput={(e) => handleInput(e, index)}
                onKeyDown={(e) => handleKeyDown(e, index)}
              />
            ))}
        </div>
        <Button type="submit" block size="lg">Verify Email</Button>
      </form>
    </AuthLayout>
  );
};

export default EmailVerify;
