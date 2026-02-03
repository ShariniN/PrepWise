import React from 'react'
import { Routes, Route } from 'react-router-dom'
import Login from './pages/Login'
import EmailVerify from './pages/EmailVerify'
import ResetPassword from './pages/ResetPassword'
import {ToastContainer} from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';
import FresherDashboard from './pages/FresherDashboard'
import ProfileSettings from './pages/ProfileSettings'
import CVAnalyzer from './pages/CVAnalyzer'
import SignUp from './pages/SignUp'
import SkillAssessor from './pages/SkillAssessor'
import Interview from './pages/Interview'
import AdminDashboard from './pages/AdminDashboard'
import AdminLogin from './pages/AdminLogin';



const App = () => {
  return (
    <div>
      <ToastContainer/>
      <Routes>
        {/* Authentication Routes */}
        <Route path='/' element={<Login/>}/>
        <Route path='/register' element={<SignUp/>}/>
        <Route path='/login' element={<Login/>}/>
        <Route path='/email-verify' element={<EmailVerify/>}/>
        <Route path='/reset-password' element={<ResetPassword/>}/>
        
        {/* Dashboard Routes */}
        <Route path='/fresher-dashboard' element={<FresherDashboard/>}/>
        <Route path='/profile-settings' element={<ProfileSettings/>}/>
        <Route path='/admin-dashboard' element={<AdminDashboard/>}/>
        
        <Route path='/admin-login' element={<AdminLogin/>}/>

        <Route path='/cv-analyzer' element={<CVAnalyzer/>}/>
        <Route path='/swot' element={<SkillAssessor/>}/>
        <Route path='/interview' element={<Interview/>}/>

        <Route path='*' element={<Login/>}/>
      </Routes>
    </div>
  )
}

export default App