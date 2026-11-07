import React, { useContext, useState } from "react";
import { useNavigate } from "react-router-dom";
import AuthLayout from '../components/AuthLayout';
import { Button, Field, Input } from '../components/ui';
import { Mail, Lock } from 'lucide-react';
import { AppContext } from "../context/AppContext";
import axios from "axios";
import { toast } from "react-toastify";
import { homeForRole } from "../utils/roles";

const Login = () => {
  const navigate = useNavigate();

  // Destructure values from context
  const { backendUrl, setIsLoggedin, getUserData, setAuth } = useContext(AppContext);

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
        setAuth(data);
        getUserData();

        // Navigate based on role
        navigate(homeForRole(data.role));
      }
    } catch (error) {
      // Handle errors from server or network
      const msg = error.response?.data?.message || error.message || "Login failed";
      toast.error(msg);
    }
  };

  return (
    <AuthLayout
      title="Login to Your Account"
      subtitle="Welcome back. Pick up where you left off."
      footer={<p>Your university invites you by email.</p>}
    >
      <form onSubmit={onSubmitHandler} className="space-y-4">
        {/* Email Field */}
        <Field label="Email">
          {(p) => (
            <Input
              {...p}
              icon={<Mail size={16} aria-hidden="true" />}
              onChange={(e) => setEmail(e.target.value)}
              value={email}
              type="email"
              placeholder="Enter your email address"
              required
              autoComplete="email"
            />
          )}
        </Field>

        {/* Password Field */}
        <Field label="Password">
          {(p) => (
            <Input
              {...p}
              icon={<Lock size={16} aria-hidden="true" />}
              onChange={(e) => setPassword(e.target.value)}
              value={password}
              type="password"
              placeholder="••••••••"
              required
              autoComplete="current-password"
            />
          )}
        </Field>

        {/* Forgot Password */}
        <div className="text-right">
          <button
            type="button"
            onClick={() => navigate("/reset-password")}
            className="rounded text-sm font-medium text-primary-700 hover:underline"
          >
            Forgot Password?
          </button>
        </div>

        {/* Submit Button */}
        <Button type="submit" block size="lg">
          {state}
        </Button>
      </form>
    </AuthLayout>
  );
};

export default Login;
