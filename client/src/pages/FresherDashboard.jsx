import React, { useContext, useEffect, useState } from "react";
import NavBar from "../components/NavBar";
import { Link, useNavigate } from "react-router-dom";
import { FaRobot, FaFileAlt, FaBullhorn, FaChartBar, FaStar, FaTrophy, FaRocket } from "react-icons/fa";
import { AppContext } from "../context/AppContext";

const FresherDashboard = () => {
  const { isLoggedin, userData } = useContext(AppContext);
  const navigate = useNavigate();
  const [currentTime, setCurrentTime] = useState(new Date());

  useEffect(() => {
    if (!isLoggedin) {
      navigate("/login");
    }
  }, [isLoggedin, navigate]);

  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 60000);
    return () => clearInterval(timer);
  }, []);

  const getGreeting = () => {
    const hour = currentTime.getHours();
    if (hour < 12) return "Good Morning";
    if (hour < 17) return "Good Afternoon";
    return "Good Evening";
  };

  const motivationalQuotes = [
    "Your future is created by what you do today, not tomorrow.",
    "Success is where preparation and opportunity meet.",
    "The expert in anything was once a beginner.",
    "Every accomplishment starts with the decision to try.",
    "Your career is a marathon, not a sprint."
  ];

  const [currentQuote] = useState(
    motivationalQuotes[Math.floor(Math.random() * motivationalQuotes.length)]
  );

  const cards = [
    {
      title: "CV Analyzer",
      description: "Get instant AI-powered feedback on your resume and tailor it perfectly to job descriptions",
      icon: <FaFileAlt size={28} />,
      to: "/cv-analyzer",
      bg: "bg-purple-600",
      tag: "SMART",
      shadowColor: "shadow-purple-200",
    },
    {
      title: "Interview Bot",
      description: "Practice with our advanced AI interviewer and boost your confidence with personalized sessions",
      icon: <FaRobot size={28} />,
      to: "/interview",
      bg: "bg-emerald-500",
      tag: "POPULAR",
      shadowColor: "shadow-emerald-200",
    },
    {
      title: "Latest Notices",
      description: "Stay ahead with the latest job interview tips, exclusive workshops and career webinars",
      icon: <FaBullhorn size={28} />,
      to: "/Notices",
      bg: "bg-indigo-700",
      tag: "UPDATED",
      shadowColor: "shadow-indigo-200",
    },
    {
      title: "Skill Trainings",
      description: "Connect with industry professionals and accelerate your career growth with expert guidance",
      icon: <FaChartBar size={28} />,
      to: "/Trainings",
      bg: "bg-cyan-500",
      tag: "TRENDING",
      shadowColor: "shadow-cyan-200",
    }
  ];

  const achievements = [
    { icon: <FaTrophy className="text-cyan-500" />, text: "Profile Complete" },
    { icon: <FaStar className="text-emerald-500" />, text: "First Resume Upload" },
    { icon: <FaRocket className="text-purple-600" />, text: "Ready to Launch" }
  ];

  return (
    <div className="min-h-screen bg-gray-50">
      <NavBar />
      
      <div className="p-6 max-w-7xl mx-auto">
        <div className="text-center mb-8 py-8">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-purple-600 rounded-full mb-4 shadow-lg">
            <FaRocket size={24} className="text-white" />
          </div>
          <h1 className="text-4xl font-bold text-gray-800 mb-3">
            {getGreeting()}, {userData?.name || "Future Leader"}!
          </h1>
          <p className="text-lg text-gray-600 mb-6 max-w-2xl mx-auto">
            Ready to take your career to the next level? Your success journey starts here.
          </p>
          <div className="bg-white rounded-full px-6 py-3 inline-block shadow-md border border-gray-100">
            <p className="text-gray-700 font-medium italic">"{currentQuote}"</p>
          </div>
        </div>

        <div className="flex justify-center mb-10">
          <div className="flex space-x-6 bg-white rounded-xl p-4 shadow-md border border-gray-100">
            {achievements.map((achievement, idx) => (
              <div key={idx} className="flex items-center space-x-2 px-4">
                {achievement.icon}
                <span className="text-sm font-medium text-gray-700">{achievement.text}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-2 xl:grid-cols-4 gap-6 mb-8">
          {cards.map((card, idx) => (
            <Link to={card.to} key={idx} className="group">
              <div className={`relative rounded-xl p-6 h-64 ${card.bg} hover:scale-105 hover:-translate-y-1 transition-all duration-300 cursor-pointer shadow-lg ${card.shadowColor} hover:shadow-xl overflow-hidden`}>
                <div className="absolute top-4 right-4 bg-black/10 text-white text-xs font-medium px-3 py-1 rounded-full">
                  {card.tag}
                </div>
                
                <div className="relative z-10 h-full flex flex-col text-white">
                  <div className="mb-4 p-2 bg-white/15 rounded-lg w-fit group-hover:bg-white/20 transition-all duration-300">
                    <div className="group-hover:scale-110 transition-transform duration-300">
                      {card.icon}
                    </div>
                  </div>
                  
                  <h3 className="text-xl font-bold mb-3">
                    {card.title}
                  </h3>
                  
                  <p className="text-white/95 text-sm leading-relaxed flex-1">
                    {card.description}
                  </p>
                  
                  <div className="mt-4 flex items-center text-white/90 group-hover:translate-x-1 transition-all duration-300">
                    <span className="text-sm font-medium mr-2">Get Started</span>
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                    </svg>
                  </div>
                </div>
              </div>
            </Link>
          ))}
        </div>

        <div className="text-center bg-gradient-to-r from-slate-700 to-indigo-700 rounded-xl p-8 shadow-lg text-white">
          <h2 className="text-2xl font-bold mb-4">Ready to Launch Your Career?</h2>
          <p className="text-lg mb-6 text-slate-200">
            Join thousands of successful professionals who started their journey here
          </p>
          <div className="flex justify-center space-x-4">
            <Link to="/cv-analyzer" className="bg-white text-slate-700 px-6 py-3 rounded-lg font-semibold hover:bg-slate-50 transition-colors duration-300 shadow-md">
              Start with CV Analysis
            </Link>
            <Link to="/interview" className="bg-emerald-600 text-white px-6 py-3 rounded-lg font-semibold hover:bg-emerald-700 transition-colors duration-300 shadow-md border border-emerald-500">
              Practice Interview
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
};

export default FresherDashboard;