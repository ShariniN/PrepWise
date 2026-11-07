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
import PracticeList from './pages/PracticeList'
import PracticeQuestion from './pages/PracticeQuestion'
import QuestionBank from './pages/QuestionBank'
import QuestionEditor from './pages/QuestionEditor'
import DemoBanner from './components/DemoBanner'
import ProtectedRoute from './components/ProtectedRoute'
import { ROLES, ASSESSMENT_ROLES, INTEGRITY_ROLES, STAFF_ROLES, QUESTION_ROLES, GRADING_ROLES, CAREER_ROLES } from './utils/roles'
import GradingQueue from './pages/GradingQueue'
import CareerReadiness from './pages/CareerReadiness'
import AdminOverview from './pages/AdminOverview'
import AssessmentList from './pages/AssessmentList'
import AssessmentIntro from './pages/AssessmentIntro'
import AssessmentSession from './pages/AssessmentSession'
import AssessmentResults from './pages/AssessmentResults'
import AssessmentManage from './pages/AssessmentManage'
import AssessmentEditor from './pages/AssessmentEditor'
import IntegrityQueue from './pages/IntegrityQueue'



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

        <Route path='/practice' element={<ProtectedRoute allow={[ROLES.STUDENT]}><PracticeList/></ProtectedRoute>}/>
        <Route path='/practice/:id' element={<ProtectedRoute allow={[ROLES.STUDENT]}><PracticeQuestion/></ProtectedRoute>}/>

        <Route path='/assessments' element={<ProtectedRoute allow={[ROLES.STUDENT]}><AssessmentList/></ProtectedRoute>}/>
        <Route path='/assessments/session/:sessionId' element={<ProtectedRoute allow={[ROLES.STUDENT]}><AssessmentSession/></ProtectedRoute>}/>
        <Route path='/assessments/session/:sessionId/results' element={<ProtectedRoute allow={[ROLES.STUDENT]}><AssessmentResults/></ProtectedRoute>}/>
        <Route path='/assessments/:id' element={<ProtectedRoute allow={[ROLES.STUDENT]}><AssessmentIntro/></ProtectedRoute>}/>

        {/* Staff and admin routes */}
        <Route path='/staff' element={<ProtectedRoute allow={STAFF_ROLES}><StaffDashboard/></ProtectedRoute>}/>
        <Route path='/manage-people' element={<ProtectedRoute allow={[ROLES.ADMIN]}><ManagePeople/></ProtectedRoute>}/>

        <Route path='/assessments/manage' element={<ProtectedRoute allow={ASSESSMENT_ROLES}><AssessmentManage/></ProtectedRoute>}/>

        <Route path='/assessments/manage/new' element={<ProtectedRoute allow={ASSESSMENT_ROLES}><AssessmentEditor/></ProtectedRoute>}/>
        <Route path='/assessments/manage/:id' element={<ProtectedRoute allow={ASSESSMENT_ROLES}><AssessmentEditor/></ProtectedRoute>}/>

        <Route path='/integrity' element={<ProtectedRoute allow={INTEGRITY_ROLES}><IntegrityQueue/></ProtectedRoute>}/>

        <Route path='/grading' element={<ProtectedRoute allow={GRADING_ROLES}><GradingQueue/></ProtectedRoute>}/>
        <Route path='/careers' element={<ProtectedRoute allow={CAREER_ROLES}><CareerReadiness/></ProtectedRoute>}/>
        <Route path='/admin-overview' element={<ProtectedRoute allow={[ROLES.ADMIN]}><AdminOverview/></ProtectedRoute>}/>

        <Route path='/questions' element={<ProtectedRoute allow={QUESTION_ROLES}><QuestionBank/></ProtectedRoute>}/>
        <Route path='/questions/new' element={<ProtectedRoute allow={QUESTION_ROLES}><QuestionEditor/></ProtectedRoute>}/>
        <Route path='/questions/:id' element={<ProtectedRoute allow={QUESTION_ROLES}><QuestionEditor/></ProtectedRoute>}/>

        {/* Any signed-in role */}
        <Route path='/profile-settings' element={<ProtectedRoute><ProfileSettings/></ProtectedRoute>}/>

        <Route path='*' element={<Login/>}/>
      </Routes>
    </div>
  )
}

export default App