import React from "react";
import { AppContext } from "../context/AppContext.jsx";
import { useContext } from "react";
import { assets } from "../assets/assets";
import axios from "axios";
import { useNavigate } from "react-router-dom";
import { toast } from "react-toastify";

const NavBar = () => {
  const navigate = useNavigate()
  const { userData, backendUrl, setUserData, setIsLoggedin} = useContext(AppContext);

  const logout = async()=> {
    try {
      axios.defaults.withCredentials = true
      const {data} = await axios.post(backendUrl + '/api/auth/logout')
      data.success && setIsLoggedin(false)
      data.success && setUserData(false)
      navigate('/login')
    } catch (error) {
      toast.error(error.message)
    }
  }

  return (
    <div className="px-4 flex items-center justify-between sm:px-16 py-4 bg-white shadow-md">

      {/* Logo redirects to fresher dashboard */}
      <div 
        className="flex items-center gap-2 cursor-pointer"
        onClick={() => navigate('/fresher-dashboard')}
      >
        <img src={assets.logo} alt="Logo" className="h-20 w-20" />
        {/* <span className="text-sm font-semibold text-gray-800">Personalized Prep. Job-Ready Fast.</span> */}
      </div>

      <div className="flex items-center gap-4 text-gray-700 text-base font-medium">
        <div>
          {userData ? userData.name : "Guest"}
        </div>

        <div className="w-8 h-8 flex justify-center items-center rounded-full bg-blue-950 text-white relative group">
          {userData?.name?.[0]?.toUpperCase() || ''}
          <div className="absolute hidden group-hover:block top-0 right-0 z-10 text-black rounded pt-10 min-w-[150px]">
            <ul className="list-none m-0 p-2 bg-gray-100 text-sm rounded shadow-lg">
              <li onClick={() => navigate('/profile-settings')} className="py-1 px-2 hover:bg-gray-200 cursor-pointer">Profile Settings</li>
              <li onClick={logout} className="py-1 px-2 hover:bg-gray-200 cursor-pointer pr-10">Logout</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
};

export default NavBar;
