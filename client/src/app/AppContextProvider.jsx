import React, { useEffect, useState } from "react";
import { toast } from "react-toastify";
import axios from 'axios';
import { AppContext } from "./AppContext.js";
import { backendUrl as apiOrigin } from '../lib/apiClient';

export const AppContextProvider = (props) => {
    axios.defaults.withCredentials = true;
    
    const backendUrl = apiOrigin;
    const [isLoggedin, setIsLoggedin] = useState(false);
    const [userData, setUserData] = useState(false);
    const [role, setRole] = useState(null);
    const [institutionId, setInstitutionId] = useState(null);
    const [authLoading, setAuthLoading] = useState(true);
    // null until the server has said whether this student still has to pick a target role.
    const [needsOnboarding, setNeedsOnboarding] = useState(null);
    const [targetRoleTitle, setTargetRoleTitle] = useState(null);

    const setOnboardingInfo = (user) => {
        setNeedsOnboarding(!!user?.needsOnboarding);
        setTargetRoleTitle(user?.targetRoleTitle || null);
    };

    // Called after the student picks a role (onboarding or profile settings).
    const setTargetRole = (title) => {
        setNeedsOnboarding(false);
        setTargetRoleTitle(title);
    };

    const setAuth = (info) => {
        setRole(info?.role || null);
        setInstitutionId(info?.institutionId || null);
        if (info?.needsOnboarding !== undefined) {
            setOnboardingInfo(info);
        } else if (info?.role === 'student') {
            // The login answer does not say whether a target role is chosen; ask who-am-I.
            setNeedsOnboarding(null);
            axios.get(backendUrl + '/api/auth/is-auth')
                .then(({ data }) => setOnboardingInfo(data.success ? data.user : null))
                .catch(() => setOnboardingInfo(null));
        } else {
            setOnboardingInfo(null);
        }
    };

    const clearAuth = () => {
        setIsLoggedin(false);
        setUserData(false);
        setRole(null);
        setInstitutionId(null);
        setNeedsOnboarding(null);
        setTargetRoleTitle(null);
    };

    const getAuthState = async () => {
        try {
            const { data } = await axios.get(backendUrl + '/api/auth/is-auth');
            if (data.success) {
                setIsLoggedin(true);
                setAuth(data.user || data);
                getUserData();
            } else {
                clearAuth();
            }
        } catch (error) {
            // Only show error toast if it's not a 401 (Unauthorized)
            if (error.response?.status !== 401) {
                toast.error(error.message);
            }

            // Ensure logout state is reflected in the UI
            clearAuth();
        } finally {
            setAuthLoading(false);
        }
    };

    const getUserData = async () => {
        try {
            const { data } = await axios.get(backendUrl + '/api/user/profile');
            if (data.success) {
                setUserData(data.data);
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
        getUserData,
        role,
        institutionId,
        authLoading,
        needsOnboarding,
        targetRoleTitle,
        setTargetRole,
        setAuth,
        clearAuth
    };

    return (
        <AppContext.Provider value={value}>
            {props.children}
        </AppContext.Provider>
    );
};