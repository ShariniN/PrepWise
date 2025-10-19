# 🚀 PrepWise – AI-Powered Career Preparation Platform  

PrepWise is an **end-to-end career preparation platform** built using the **MERN Stack (MongoDB, Express, React, Node.js)**.  
It integrates **AI-driven resume analysis, skill assessment, and mock interview simulation** to help students and job seekers become job-ready.  

The platform bridges the gap between **academic learning and industry expectations** by evaluating users’ CVs, skills, and interview performance, and then generating **personalized feedback and training recommendations**.  

---

## 🧾 Overview  

PrepWise is designed for **students, job seekers, and professionals** preparing for tech roles.  
It also includes **admin and trainer functionalities** to manage users, events, news, and training programs.  

---

## ⚙️ Core Features  

### 🧠 CV Checker  
- AI-driven document analysis for **structure, strengths, and weaknesses**.  
- Upload CV (PDF/DOCX) and one or more Job Descriptions (JDs).  
- Returns:
  - **Strengths:** Keywords matching the job role.  
  - **Weaknesses:** Missing or irrelevant content.  
  - **Structure Analysis:** Layout and formatting feedback.  
  - **Improvement Suggestions:** Targeted edits for better job matching.  
- ⚙️ *Powered by NLP-based keyword extraction and semantic similarity checks.*  

---

### 💪 Skill Assessor  
- Extracts **technical and soft skills** from the CV automatically.  
- Allows users to **self-rate** each skill on a **confidence scale (1–10)**.  
- Ratings are stored and used to personalize future **training recommendations**.  

---

### 🧑‍💻 AI Mock Interview Module  
- Simulates a realistic **technical job interview** experience.  
- Dynamically generates **10 questions**:
  - 🗣 **3 Behavioral**
  - 💻 **4 Technical**
  - 👨‍💻 **3 Coding** (executed live via JDoodle API)  
- **Voice-enabled answering** using the Web Speech API (speech-to-text).  
- **Real-time code execution** and debugging feedback.  
- Each question is graded based on:
  - Accuracy  
  - Relevance  
  - Communication clarity  
  - Code efficiency  

---

### 📊 Performance Report & Training Recommendations  
After the interview, users receive a **comprehensive performance report**:  
- Score breakdown per question (0–100 scale).  
- Identified strengths and areas for improvement.  
- Personalized **training recommendations** based on:
  - Skill gaps  
  - Self-assessed confidence levels  

---

### 🎯 Training Session Module  
- Suggests **personalized training programs** with industry experts.  
- Recommendations generated from **Skill Assessor ratings**.  
- One-time paid booking through **PayHere integration**.  
- Trainers manage their sessions and share links with participants.  

---

### 📰 Notice Board & Tech News Feed  
- **Notice Board:** Admins post updates about:
  - Hackathons, workshops, and tech events in Sri Lanka.  
  - Application deadlines and competitions.  
- **Tech News Feed:** Real-time news fetched via **NewsAPI.org** — keeping users updated on trends in AI, startups, and software development.  

---

### 🧑‍💼 Admin & Trainer Dashboards  

#### 🛠️ Admin Dashboard  
- Manage users and trainers.  
- Post and moderate event notices.  
- Monitor session bookings and activity metrics.  

#### 🎓 Trainer Dashboard  
- Create and manage training sessions.  
- Assign users and view their progress.  
- Collect feedback after sessions.  

---

## 🧩 Tech Stack  

| **Layer** | **Technology** | **Description** |
|------------|----------------|-----------------|
| **Frontend** | React.js | Dynamic and responsive UI with routing and state management |
| **Backend** | Node.js, Express.js | RESTful API development and business logic |
| **Database** | MongoDB Atlas | Cloud database for users, CVs, sessions, and reports |
| **Authentication** | JWT | Secure user authentication and session management |
| **File Upload** | Multer | CV upload and storage management |
| **AI Integration** | Gemini API | CV analysis and skill extraction |
| **Code Execution** | JDoodle API | Real-time coding and debugging environment |
| **Speech Recognition** | Web Speech API | Enables voice-based interview responses |
| **News Feed** | NewsAPI.org | Fetches real-time global tech news |
| **Payment Gateway** | PayHere | One-time payment and subscription handling |
| **Deployment** | AWS / Cloud Hosting | Scalable cloud deployment for frontend and backend |

---

## 🔒 Key Highlights  
- AI + NLP integration for CV and skill matching.  
- Real-time coding & voice-based interview simulation.  
- Role-based dashboards (Admin, Trainer, Fresher).  
- Personalized learning and upskilling recommendations.  
- Deployed on cloud infrastructure for scalability and reliability.  

---

## 📬 Contributors  
👩‍💻 **Development Team:**  
- **Scrum Master / QA:** Linuka Rodrigo  
- **Developer:** Shalindri  
- **Business Analyst:** Gimhan  
- **Quality Analyst:** Sharini  

---

## 🏁 Project Management  
- Managed under **Agile Scrum** methodology.  
- Used **Jira & Confluence** for sprint tracking, UAT, and documentation.  
- Delivered in 4 sprints:
  1. Authentication & CV Checker  
  2. SWOT Analysis & Training Module Design  
  3. Mock Interview & Feedback Reports  
  4. Admin Dashboard, Training Session Integration & Notices  

---

> 💡 *PrepWise redefines how freshers prepare for their careers — through AI, automation, and personalized learning.*

---

