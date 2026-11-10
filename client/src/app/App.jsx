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
import SkillAssessor from '../features/skills/SkillAssessor'
import Interview from '../features/interview/Interview'
import StaffDashboard from '../features/staff/StaffDashboard'
import ManagePeople from '../features/admin/ManagePeople'
import PracticeList from '../pages/PracticeList'
import PracticeQuestion from '../pages/PracticeQuestion'
import QuestionBank from '../features/questions/QuestionBank'
import QuestionEditor from '../features/questions/QuestionEditor'
import DemoBanner from './DemoBanner'
import ProtectedRoute from './ProtectedRoute'
import NotFound from './NotFound'
import { ROLES, STAFF_ROLES, QUESTION_ROLES, GRADING_ROLES } from '../utils/roles'
import GradingQueue from '../features/grading/GradingQueue'
import AdminOverview from '../features/admin/AdminOverview'
import StudentProfile from '../features/staff/StudentProfile'
import StudentInterview from '../features/staff/StudentInterview'

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

        <Route path='*' element={<NotFound/>}/>
      </Routes>
    </div>
  )
}

export default App