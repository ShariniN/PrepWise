import React from 'react';
import { ToastContainer } from 'react-toastify';

/** Drop-in replacement for <ToastContainer/> with PrepWise defaults. Skin lives in index.css (.Toastify__*). */
const Toaster = (props) => <ToastContainer position="top-right" autoClose={4500} hideProgressBar={false} newestOnTop closeOnClick pauseOnHover theme="light" {...props} />;

export default Toaster;
