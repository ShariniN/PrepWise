import React, { Suspense, lazy } from 'react'
import { Routes, Route } from 'react-router-dom'
import Login from './pages/Login'
import Landing from './pages/Landing'
import EmailVerify from './pages/EmailVerify'
import ResetPassword from './pages/ResetPassword'
import Toaster from './components/ui/Toaster';
import 'react-toastify/dist/ReactToastify.css';
import FresherDashboard from './pages/FresherDashboard'
import ProfileSettings from './pages/ProfileSettings'
import CVAnalyzer from './pages/CVAnalyzer'
import AcceptInvite from './pages/AcceptInvite'
import SkillAssessor from './pages/SkillAssessor'
import Interview from './pages/Interview'
import StaffDashboard from './pages/StaffDashboard'
import ManagePeople from './pages/ManagePeople'
import PracticeList from './pages/PracticeList'
import PracticeQuestion from './pages/PracticeQuestion'
import QuestionBank from './pages/QuestionBank'
import QuestionEditor from './pages/QuestionEditor'
import DemoBanner from './components/DemoBanner'
import ProtectedRoute from './components/ProtectedRoute'
import UnknownRoute from './components/UnknownRoute'
import { ROLES, STAFF_ROLES, QUESTION_ROLES, GRADING_ROLES } from './utils/roles'
import GradingQueue from './pages/GradingQueue'
import AdminOverview from './pages/AdminOverview'
import StudentProfile from './pages/StudentProfile'
import StudentInterview from './pages/StudentInterview'

// Dev-only component gallery; the import is dropped from production builds.
const UiKit = import.meta.env.DEV ? lazy(() => import('./pages/UiKit')) : null;

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
        <Route path='/fresher-dashboard' element={<ProtectedRoute allow={[ROLES.STUDENT]}><FresherDashboard/></ProtectedRoute>}/>
        <Route path='/cv-analyzer' element={<ProtectedRoute allow={[ROLES.STUDENT]}><CVAnalyzer/></ProtectedRoute>}/>
        <Route path='/swot' element={<ProtectedRoute allow={[ROLES.STUDENT]}><SkillAssessor/></ProtectedRoute>}/>
        <Route path='/interview' element={<ProtectedRoute allow={[ROLES.STUDENT]}><Interview/></ProtectedRoute>}/>

        <Route path='/practice' element={<ProtectedRoute allow={[ROLES.STUDENT]}><PracticeList/></ProtectedRoute>}/>
        <Route path='/practice/:id' element={<ProtectedRoute allow={[ROLES.STUDENT]}><PracticeQuestion/></ProtectedRoute>}/>

        {/* Staff and admin routes */}
        <Route path='/staff' element={<ProtectedRoute allow={STAFF_ROLES}><StaffDashboard/></ProtectedRoute>}/>
        <Route path='/staff/students/:id' element={<ProtectedRoute allow={STAFF_ROLES}><StudentProfile/></ProtectedRoute>}/>
        <Route path='/staff/students/:id/interviews/:interviewId' element={<ProtectedRoute allow={STAFF_ROLES}><StudentInterview/></ProtectedRoute>}/>
        <Route path='/manage-people' element={<ProtectedRoute allow={[ROLES.ADMIN]}><ManagePeople/></ProtectedRoute>}/>
        <Route path='/grading' element={<ProtectedRoute allow={GRADING_ROLES}><GradingQueue/></ProtectedRoute>}/>
        <Route path='/admin-overview' element={<ProtectedRoute allow={[ROLES.ADMIN]}><AdminOverview/></ProtectedRoute>}/>

        <Route path='/questions' element={<ProtectedRoute allow={QUESTION_ROLES}><QuestionBank/></ProtectedRoute>}/>
        <Route path='/questions/new' element={<ProtectedRoute allow={QUESTION_ROLES}><QuestionEditor/></ProtectedRoute>}/>
        <Route path='/questions/:id' element={<ProtectedRoute allow={QUESTION_ROLES}><QuestionEditor/></ProtectedRoute>}/>

        {/* Any signed-in role */}
        <Route path='/profile-settings' element={<ProtectedRoute><ProfileSettings/></ProtectedRoute>}/>

        {UiKit && <Route path='/ui-kit' element={<Suspense fallback={null}><UiKit/></Suspense>}/>}

        <Route path='*' element={<UnknownRoute/>}/>
      </Routes>
    </div>
  )
}

export default App