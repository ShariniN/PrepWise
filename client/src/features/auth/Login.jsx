import React, { useContext, useState } from "react";
import { Link, Navigate, useNavigate } from "react-router-dom";
import AuthLayout from './components/AuthLayout';
import { Button, Field, Input } from '../../components/ui';
import { Mail, Lock } from 'lucide-react';
import { AppContext } from "../../app/AppContext";
import axios from "axios";
import { toast } from "react-toastify";
import { homeForRole } from "../../lib/roles";

const Login = () => {
  const navigate = useNavigate();

  // Destructure values from context
  const { backendUrl, setIsLoggedin, getUserData, setAuth, isLoggedin, role, authLoading } = useContext(AppContext);

  // UI button state
  const state = "Log in";

  // Form fields
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [needsVerify, setNeedsVerify] = useState(false);

  // Already signed in: go to your own home instead of seeing the login form again.
  if (!authLoading && isLoggedin && role) return <Navigate to={homeForRole(role)} replace />;

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
      setNeedsVerify(error.response?.data?.code === "EMAIL_NOT_VERIFIED");
      const msg = error.response?.data?.message || error.message || "Login failed";
      toast.error(msg);
    }
  };

  const resend = async () => {
    try {
      const { data } = await axios.post(backendUrl + "/api/auth/resend-verification", { email });
      toast.success(data.message);
    } catch (error) {
      toast.error(error.response?.data?.message || "Could not send a new link");
    }
  };

  return (
    <AuthLayout
      title="Login to Your Account"
      subtitle="Welcome back. Pick up where you left off."
      footer={<p>New here? <Link to="/signup" className="text-primary-700 font-medium hover:underline">Create an account</Link></p>}
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

        {needsVerify && (
          <p className="text-sm text-ink" role="status">
            Your email is not verified yet.{" "}
            <button type="button" onClick={resend} className="rounded font-medium text-primary-700 hover:underline">Send me a new link</button>
          </p>
        )}

        {/* Submit Button */}
        <Button type="submit" block size="lg">
          {state}
        </Button>
      </form>
    </AuthLayout>
  );
};

export default Login;
