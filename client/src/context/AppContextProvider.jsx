import React, { useEffect, useState } from "react";
import { toast } from "react-toastify";
import axios from 'axios';
import { AppContext } from "./AppContext.jsx";

export const AppContextProvider = (props) => {
    axios.defaults.withCredentials = true;
    
    const backendUrl = import.meta.env.VITE_BACKEND_URL;
    const [isLoggedin, setIsLoggedin] = useState(false);
    const [userData, setUserData] = useState(false);

    const getAuthState = async () => {
        try {
            const { data } = await axios.get(backendUrl + '/api/auth/is-auth');
            if (data.success) {
                setIsLoggedin(true);
                getUserData();
            } else {
                setIsLoggedin(false);
                setUserData(null);
            }
        } catch (error) {
            // Only show error toast if it's not a 401 (Unauthorized)
            if (error.response?.status !== 401) {
                toast.error(error.message);
            }

            // Ensure logout state is reflected in the UI
            setIsLoggedin(false);
            setUserData(null);
        }
    };

    const getUserData = async () => {
        try {
            // FIXED: Changed from '/api/user/data' to '/api/user/profile'
            const { data } = await axios.get(backendUrl + '/api/user/profile');
            if (data.success) {
                setUserData(data.data); // FIXED: Use data.data instead of data.userData
            } else {
                toast.error(data.message);
                setUserData(null);
            }
        } catch (error) {
            console.error('getUserData error:', error);
            // Don't show toast for 401 errors (user not logged in)
            if (error.response?.status !== 401) {
                toast.error(error.response?.data?.message || error.message);
            }
            setUserData(null);
        }
    };

    useEffect(() => {
        getAuthState();
    }, []);

    const value = {
        backendUrl,
        isLoggedin, 
        setIsLoggedin,
        userData, 
        setUserData,
        getUserData
    };

    return (
        <AppContext.Provider value={value}>
            {props.children}
        </AppContext.Provider>
    );
};