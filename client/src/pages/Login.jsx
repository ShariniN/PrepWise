import React, { useContext, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { assets } from "../assets/assets";
import { AppContext } from "../context/AppContext";
import axios from "axios";
import { toast } from "react-toastify";

const Login = () => {
  const navigate = useNavigate();

  // Destructure values from context
  const { backendUrl, setIsLoggedin, getUserData } = useContext(AppContext);

  // UI button state
  const [state, setState] = useState("Log in");

  // Form fields
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  // Handle form submission for logging in
  const onSubmitHandler = async (e) => {
    try {
      e.preventDefault();
      axios.defaults.withCredentials = true;

      // Send login request
      const { data } = await axios.post(backendUrl + "/api/auth/login", {
        email,
        password,
      });

      if (data.success) {
        // Update context and fetch user info
        setIsLoggedin(true);
        getUserData();

        // Navigate based on account type
        if (data.accountType === "Trainer") {
          navigate("/trainer-dashboard");
        } else if (data.accountType === "Fresher") {
          navigate("/fresher-dashboard");
        } else {
          toast.error(data.message || "Login unsuccessful");
        }
      }
    } catch (error) {
      // Handle errors from server or network
      const msg = error.response?.data?.message || error.message || "Login failed";
      toast.error(msg);
    }
  };

  return (
    <div className="min-h-screen bg-gray-100 flex items-center justify-center px-4">
      <div className="w-full max-w-md bg-white rounded-2xl shadow-lg p-8">
        <div className="flex justify-center mb-4">
          <img src={assets.logo} alt="Logo" className="w-16 h-16" />
        </div>
        <h2 className="text-2xl font-bold text-center text-gray-800 mb-6">
          Login to Your Account
        </h2>

        <form onSubmit={onSubmitHandler}>
          {/* Email Field */}
          <div className="mb-4">
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Email
            </label>
            <div className="flex items-center gap-2 bg-gray-100 rounded-md px-3 py-2">
              <img src={assets.mail_icon} alt="Email" className="w-5" />
              <input
                onChange={(e) => setEmail(e.target.value)}
                value={email}
                type="email"
                placeholder="Enter your email address"
                required
                className="bg-transparent w-full outline-none text-sm"
              />
            </div>
          </div>

          {/* Password Field */}
          <div className="mb-2">
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Password
            </label>
            <div className="flex items-center gap-2 bg-gray-100 rounded-md px-3 py-2">
              <img src={assets.lock_icon} alt="Password" className="w-5" />
              <input
                onChange={(e) => setPassword(e.target.value)}
                value={password}
                type="password"
                placeholder="••••••••"
                required
                className="bg-transparent w-full outline-none text-sm"
              />
            </div>
          </div>

          {/* Forgot Password */}
          <div className="text-right mb-4">
            <p
              onClick={() => navigate("/reset-password")}
              className="text-blue-600 text-sm hover:font-semibold cursor-pointer"
            >
              Forgot Password?
            </p>
          </div>

          {/* Submit Button */}
          <button
            type="submit"
            className="w-full py-2 rounded-lg bg-gradient-to-r from-indigo-500 to-indigo-900 text-white text-sm font-semibold"
          >
            {state}
          </button>
        </form>

        {/* Link to Register */}
        <p className="text-gray-700 text-center text-sm mt-6">
          Don’t have an account?{" "}
          <Link
            to="/register"
            className="text-blue-600 font-medium hover:underline"
          >
            Sign up here
          </Link>
        </p>
      </div>
    </div>
  );
};

export default Login;
