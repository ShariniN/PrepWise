//SignUp.jsx
import React, { useState, useContext } from 'react'
import { assets } from '../assets/assets'
import { useNavigate } from 'react-router-dom'
import axios from 'axios';
import { toast } from 'react-toastify';
import { AppContext } from '../context/AppContext.jsx'; 

const SignUp = () => {
  const navigate = useNavigate()
  // Access backend URL and login setter from context
  const {backendUrl, setIsLoggedin} = useContext(AppContext)

  // Component state
  const [state, setState] = useState('Sign Up')
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [phoneNumber, setPhoneNumber] = useState("");

  // Handles form submission - SIMPLIFIED TO JUST REGISTER AND AUTO-NAVIGATE
  const onSubmitHandler = async (e)=>{
    try {
        e.preventDefault();
        axios.defaults.withCredentials = true

        const {data} = await axios.post(backendUrl + '/api/auth/register', {
          name, 
          email, 
          password, 
          phoneNumber,
        })

        if(data.success){
          toast.success(data.message || "Registration successful! Check your email for verification OTP.");
          
          // Navigate directly to email verification page
          navigate('/email-verify');
        } else {
          toast.error(data.message)
        }

    } catch (error) {
        console.error("Registration error:", error);
        toast.error(error.response?.data?.message || error.message || "Registration failed");
    }
  }

  return (
    <div className="min-h-screen bg-gray-100 flex items-center justify-center px-4">
      <div className="w-full max-w-md bg-white rounded-2xl shadow-lg p-8">
        <div className="flex justify-center mb-4">
          <img src={assets.logo} alt="Logo" className="w-16 h-16" />
        </div>

        <h2 className="text-2xl font-bold text-center text-gray-800 mb-6">Create Your Account</h2>

        <form onSubmit={onSubmitHandler}>

          {/* Full Name */}
          <div className="mb-4">
            <label className="block text-sm font-medium text-gray-700 mb-1">Full Name</label>
            <div className="flex items-center gap-2 bg-gray-100 rounded-md px-3 py-2">
              <img src={assets.person_icon} alt="Name" className="w-5" />
              <input onChange={e =>setName(e.target.value)} value={name} type="text" placeholder="Ex: John Smith" required className="bg-transparent w-full outline-none text-sm" />
            </div>
          </div>

          {/* Email */}
          <div className="mb-4">
            <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
            <div className="flex items-center gap-2 bg-gray-100 rounded-md px-3 py-2">
              <img src={assets.mail_icon} alt="Email" className="w-5" />
              <input onChange={e =>setEmail(e.target.value)} value={email} type="email" placeholder="Enter your email address" required className="bg-transparent w-full outline-none text-sm" />
            </div>
          </div>

          {/* Password */}
          <div className="mb-4">
            <label className="block text-sm font-medium text-gray-700 mb-1">Password</label>
            <div className="flex items-center gap-2 bg-gray-100 rounded-md px-3 py-2">
              <img src={assets.lock_icon} alt="Password" className="w-5" />
              <input onChange={e =>setPassword(e.target.value)} value={password} type="password" placeholder="********" required className="bg-transparent w-full outline-none text-sm" />
            </div>
          </div>

          {/* Contact Number */}
          <div className="mb-4">
            <label className="block text-sm font-medium text-gray-700 mb-1">Contact Number</label>
            <div className="flex items-center gap-2 bg-gray-100 rounded-md px-3 py-2">
              <img src={assets.phone_icon || ""} alt="Phone" className="w-5" />
              <input 
                onChange={e =>setPhoneNumber(e.target.value)} 
                value={phoneNumber} 
                type="text" 
                placeholder="Enter your 10 digit contact number" 
                required 
                className="bg-transparent w-full outline-none text-sm" 
              />
            </div>
          </div>

          {/* Submit Button */}
          <button className="w-full py-2 bg-gradient-to-r from-indigo-500 to-indigo-900 text-white text-sm font-medium rounded-full transition duration-200 hover:opacity-90">
            {state}
          </button>
        </form>

        {/* Additional Info */}
        <div className="mt-4 text-center">
          <p className="text-xs text-gray-500">
            Complete your profile later with CV and additional details.
          </p>
        </div>
      </div>
    </div>
  )
}

export default SignUp