import React, { Suspense, lazy } from 'react'
import { Routes, Route } from 'react-router-dom'
import Login from '../features/auth/Login'
import Landing from '../features/landing/Landing'
import EmailVerify from '../features/auth/EmailVerify'
import ResetPassword from '../features/auth/ResetPassword'
import Toaster from '../components/ui/Toaster';
import 'react-toastify/dist/ReactToastify.css';
import StudentHome from '../features/home/StudentHome'
import ProfileSettings from '../features/profile/ProfileSettings'
import CVAnalyzer from '../features/cv/CVAnalyzer'
import AcceptInvite from '../features/auth/AcceptInvite'
import Interview from '../features/interview/Interview'
import Dashboard from '../features/dashboard/Dashboard'
import ManagePeople from '../features/admin/ManagePeople'
import PracticeList from '../features/practice/PracticeList'
import PracticeQuestion from '../features/practice/PracticeQuestion'
import DemoBanner from './DemoBanner'
import ProtectedRoute from './ProtectedRoute'
import NotFound from './NotFound'
import { ROLES, STAFF_ROLES } from '../lib/roles'
import StudentProfile from '../features/dashboard/StudentProfile'
import StudentInterview from '../features/dashboard/StudentInterview'

// Dev-only component gallery; the import is dropped from production builds.
const UiKit = import.meta.env.DEV ? lazy(() => import('./UiKit')) : null;

const App = () => {
  return (
    <div>
      <DemoBanner/>
      <Toaster/>
      <Routes>
        {/* Authentication Routes */}
        <Route path='/' element={<Landing/>}/>
        <Route path='/accept-invite' element={<AcceptInvite/>}/>
        <Route path='/login' element={<Login/>}/>
        <Route path='/email-verify' element={<EmailVerify/>}/>
        <Route path='/reset-password' element={<ResetPassword/>}/>
        
        {/* Student routes */}
        <Route path='/fresher-dashboard' element={<ProtectedRoute allow={[ROLES.STUDENT]}><StudentHome/></ProtectedRoute>}/>
        <Route path='/cv-analyzer' element={<ProtectedRoute allow={[ROLES.STUDENT]}><CVAnalyzer/></ProtectedRoute>}/>
        <Route path='/interview' element={<ProtectedRoute allow={[ROLES.STUDENT]}><Interview/></ProtectedRoute>}/>

        <Route path='/practice' element={<ProtectedRoute allow={[ROLES.STUDENT]}><PracticeList/></ProtectedRoute>}/>
        <Route path='/practice/:id' element={<ProtectedRoute allow={[ROLES.STUDENT]}><PracticeQuestion/></ProtectedRoute>}/>

        {/* Staff and admin routes */}
        <Route path='/dashboard' element={<ProtectedRoute allow={STAFF_ROLES}><Dashboard/></ProtectedRoute>}/>
        <Route path='/dashboard/students/:id' element={<ProtectedRoute allow={STAFF_ROLES}><StudentProfile/></ProtectedRoute>}/>
        <Route path='/dashboard/students/:id/interviews/:interviewId' element={<ProtectedRoute allow={STAFF_ROLES}><StudentInterview/></ProtectedRoute>}/>
        <Route path='/manage-people' element={<ProtectedRoute allow={[ROLES.ADMIN]}><ManagePeople/></ProtectedRoute>}/>

        {/* Any signed-in role */}
        <Route path='/profile-settings' element={<ProtectedRoute><ProfileSettings/></ProtectedRoute>}/>

        {UiKit && <Route path='/ui-kit' element={<Suspense fallback={null}><UiKit/></Suspense>}/>}

        <Route path='*' element={<NotFound/>}/>
      </Routes>
    </div>
  )
}

export default App