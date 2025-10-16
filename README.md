🧾 Overview

PrepWise is an end-to-end career preparation platform built using the MERN (MongoDB, Express, React, Node.js) stack, integrating AI-driven resume analysis, skill assessment, and interview simulation.

It bridges the gap between candidates and job readiness by evaluating their CV, skills, and interview performance, then generating a personalized improvement report and training recommendations.

This platform is designed for students, job seekers, and professionals preparing for tech roles, with administrative and trainer functionalities to manage events, news, and training programs.

⚙️ Core Features

CV Checker: AI-driven document analysis for structure, strengths, and weaknesses.

Skill Assessor: Extracts skills from CVs and allows users to self-rate their proficiency.

Mock Interview Module:

10 dynamically generated questions (3 behavioral, 4 technical, 3 coding).

Coding questions run on JDoodle API for real-time debugging.

Voice-enabled answering using speech-to-text.

Performance Report: Generates analytical summaries and personalized feedback.

Training Recommendations: Suggests skill development paths and learning programs.

Notice Board: Displays local tech events (hackathons, meetups, competitions).

Tech News Feed: Fetches real-time global and Sri Lankan tech news from external APIs.

Admin Dashboard: Manage users and post event notices.

Trainer Dashboard: Manage training programs and monitor learners’ progress.

🧩 Tech Stack
Layer	Technology	Description
Frontend	React.js, state management, routing
Backend	Node.js, Express.js	REST API development
Database	MongoDB Atlas	Cloud database for users, CVs, and training data
Authentication	JWT	Secure login & access control
File Upload	Multer	CV upload and storage
Gemini API	CV analysis and skill extraction
Code Execution	JDoodle API	Live coding and debugging environment
Speech Recognition	Web Speech API	Enables voice-based interview responses
News API	NewsAPI.org	Fetching real-time tech news
Deployment	AWS and cloud hosting

🔍 Detailed Feature Breakdown
1️⃣ CV Checker

Upload your CV (PDF/DOCX) and Job Description.
The system analyzes and returns:

Strengths: Skills or keywords aligned with the job.

Weaknesses: Missing or irrelevant content.

Structure Analysis: Layout and formatting feedback.

Improvement Suggestions: Targeted edits for better job matching.

👉 Powered by NLP-based keyword extraction and semantic similarity checks.

2️⃣ Skill Assessor

Automatically extracts technical and soft skills from your CV.

Users rate themselves on a confidence scale (1–10).

Data used to personalize training recommendations later.

3️⃣ AI Interview Module

A dynamic mock interview simulator built for full-stack and technical roles.

Generates 10 questions:

🗣 3 Behavioral

💻 4 Technical

👨‍💻 3 Coding (via JDoodle live compiler)

Voice-based answering supported.

Real-time code execution & debugging feedback.

Each question graded based on:

Accuracy

Relevance

Communication clarity

Code efficiency (for coding questions)

4️⃣ Performance Report & Recommendations

After the interview:

A comprehensive report is generated including:

Score per question (0–100 scale)

Strengths and areas for improvement

Suggested next steps

Training Recommendations:

AI recommends trainings, bootcamps, or materials

Recommendations based on:

Skill gaps

Self-assessed confidence

5️⃣ Notice & News Feed

Notice Board: Admins can post updates about:

Tech events, hackathons, and workshops in Sri Lanka

Application deadlines and competitions

News Feed: Integrated Tech News API keeps users updated on the latest trends in AI, software development, and startups.

6️⃣ Admin & Trainer Dashboards

Admin Panel:

User management (view, delete, update)

Post and manage notices

Approve or moderate events

Trainer Panel:

Create and manage training sessions

Assign users to sessions

Monitor user engagement and performance
