import React, { useContext, useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { FileText, Mic, Code2, ArrowRight } from "lucide-react";
import AppShell from "../../components/AppShell";
import { Card, Reveal } from "../../components/ui";
import { AppContext } from "../../app/AppContext";

const StudentHome = () => {
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
      title: "Practice",
      description: "Work through coding and written questions and get instant feedback on your answers.",
      icon: <Code2 size={24} aria-hidden="true" />,
      to: "/practice",
      tint: "bg-primary-50 text-primary-600",
    },
    {
      title: "Mock interview",
      description: "Rehearse an interview with an AI interviewer and review a report afterwards.",
      icon: <Mic size={24} aria-hidden="true" />,
      to: "/interview",
      tint: "bg-sun-100 text-sun-700",
    },
    {
      title: "CV Analyzer",
      description: "Get feedback on your resume and tailor it to a job description.",
      icon: <FileText size={24} aria-hidden="true" />,
      to: "/cv-analyzer",
      tint: "bg-success-100 text-success-700",
    },
  ];

  return (
    <AppShell
      eyebrow={getGreeting()}
      title={`Welcome back, ${userData?.name || "Future Leader"}`}
      subtitle="Ready to take your career to the next level? Pick up where you left off."
    >
      <Reveal>
        <p className="mb-8 rounded-3xl bg-sand px-6 py-4 font-display text-lg italic text-ink-2">"{currentQuote}"</p>
      </Reveal>

      <Reveal delay={80}>
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 xl:grid-cols-3">
          {cards.map((card) => (
            <Link to={card.to} key={card.to} className="group block rounded-3xl focus:outline-none focus-visible:ring-4 focus-visible:ring-primary-600/25">
              <Card lift className="flex h-full flex-col">
                <div className={`mb-4 grid h-12 w-12 place-items-center rounded-2xl ${card.tint}`}>{card.icon}</div>
                <h2 className="font-display text-xl font-semibold text-ink">{card.title}</h2>
                <p className="mt-2 flex-1 text-sm text-ink-2">{card.description}</p>
                <span className="mt-5 inline-flex items-center gap-1.5 text-sm font-semibold text-primary-700 transition group-hover:gap-2.5">
                  Open <ArrowRight size={16} aria-hidden="true" />
                </span>
              </Card>
            </Link>
          ))}
        </div>
      </Reveal>
    </AppShell>
  );
};

export default StudentHome;
