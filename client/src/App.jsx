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
import AcceptInvite from './pages/AcceptInvite'
import SkillAssessor from './pages/SkillAssessor'
import Interview from './pages/Interview'
import StaffDashboard from './pages/StaffDashboard'
import ManagePeople from './pages/ManagePeople'
import DemoBanner from './components/DemoBanner'
import ProtectedRoute from './components/ProtectedRoute'
import { ROLES, STAFF_ROLES } from './utils/roles'



const App = () => {
  return (
    <div>
      <DemoBanner/>
      <ToastContainer/>
      <Routes>
        {/* Authentication Routes */}
        <Route path='/' element={<Login/>}/>
        <Route path='/accept-invite' element={<AcceptInvite/>}/>
        <Route path='/login' element={<Login/>}/>
        <Route path='/email-verify' element={<EmailVerify/>}/>
        <Route path='/reset-password' element={<ResetPassword/>}/>
        
        {/* Student routes */}
        <Route path='/fresher-dashboard' element={<ProtectedRoute allow={[ROLES.STUDENT]}><FresherDashboard/></ProtectedRoute>}/>
        <Route path='/cv-analyzer' element={<ProtectedRoute allow={[ROLES.STUDENT]}><CVAnalyzer/></ProtectedRoute>}/>
        <Route path='/swot' element={<ProtectedRoute allow={[ROLES.STUDENT]}><SkillAssessor/></ProtectedRoute>}/>
        <Route path='/interview' element={<ProtectedRoute allow={[ROLES.STUDENT]}><Interview/></ProtectedRoute>}/>

        {/* Staff and admin routes */}
        <Route path='/staff' element={<ProtectedRoute allow={STAFF_ROLES}><StaffDashboard/></ProtectedRoute>}/>
        <Route path='/manage-people' element={<ProtectedRoute allow={[ROLES.ADMIN]}><ManagePeople/></ProtectedRoute>}/>

        {/* Any signed-in role */}
        <Route path='/profile-settings' element={<ProtectedRoute><ProfileSettings/></ProtectedRoute>}/>

        <Route path='*' element={<Login/>}/>
      </Routes>
    </div>
  )
}

export default App