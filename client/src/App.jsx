import React from 'react'
import { Routes, Route } from 'react-router-dom'
import Login from './pages/Login'
import EmailVerify from './pages/EmailVerify'
import ResetPassword from './pages/ResetPassword'
import {ToastContainer} from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';
import TrainerDashboard from './pages/TrainerDashboard';
import FresherDashboard from './pages/FresherDashboard'
import ProfileSettings from './pages/ProfileSettings'
import CVAnalyzer from './pages/CVAnalyzer'
import SignUp from './pages/SignUp'
import SkillAssessor from './pages/SkillAssessor'
import Interview from './pages/Interview'
import Notices from './pages/Notices'
import Trainings from './pages/Trainings'
// import TrainerDashboard from './pages/TrainerDashboard'
import AdminDashboard from './pages/AdminDashboard'
import TrainingDetailsPage from './pages/TrainingDetails';
import TrainingBookingPage from './pages/TrainingBooking';
import TrainingPaymentPage from './pages/TrainingPayment';
import TrainingSuccessPage from './pages/TrainingRegSuccess';
import TrainingPaymentOTP from './components/TrainingPaymentOTP';
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
        <Route path='/trainer-dashboard' element={<TrainerDashboard/>}/>
        <Route path='/fresher-dashboard' element={<FresherDashboard/>}/>
        <Route path='/profile-settings' element={<ProfileSettings/>}/>
        <Route path='/admin-dashboard' element={<AdminDashboard/>}/>
        
        {/* admin login */}
        <Route path='/admin-login' element={<AdminLogin/>}/>


      
        {/* Feature Routes */}
        <Route path='/cv-analyzer' element={<CVAnalyzer/>}/>
        <Route path='/swot' element={<SkillAssessor/>}/>
        <Route path='/interview' element={<Interview/>}/>
        <Route path='/notices' element={<Notices/>}/>
        <Route path='/trainings' element={<Trainings />} />
        {/* <Route path="/training-details/:id" element={<TrainingDetailsPage />} /> */}
        {/* <Route path='/events' element={<Notices/>}/> */}

        <Route path="/training-details/:id" element={<TrainingDetailsPage />} />
        <Route path="/training-booking/:id" element={<TrainingBookingPage />} />
        <Route path="/training-payment/:id" element={<TrainingPaymentPage />} />
        <Route path="/training-success" element={<TrainingSuccessPage />} />




        {/* Catch all route - redirect to login */}
        <Route path='*' element={<Login/>}/>
      </Routes>
    </div>
  )
}

export default App