import React, { useEffect, useRef, useState } from "react";
import { AppContext } from "../app/AppContext.js";
import { useContext } from "react";
import axios from "axios";
import { useNavigate, NavLink, useLocation } from "react-router-dom";
import { Menu, X, LogOut, Settings, ChevronDown } from "lucide-react";
import { homeForRole, ROLES, ROLE_LABELS } from "../utils/roles";
import { toast } from "react-toastify";
import Logo from "./Logo";

const linkCls = ({ isActive }) =>
  `whitespace-nowrap rounded-full px-3 py-2 text-[13px] font-semibold transition duration-200 ${
    isActive ? 'bg-ink-deep text-white shadow-soft' : 'text-ink-2 hover:bg-sand hover:text-ink'
  }`;

const NavBar = () => {
  const navigate = useNavigate()
  const location = useLocation();
  const { userData, backendUrl, clearAuth, role } = useContext(AppContext);
  const [menuOpen, setMenuOpen] = useState(false);
  const [sheetOpen, setSheetOpen] = useState(false);
  const menuRef = useRef(null);

  // Close menus on navigation, outside click and Escape.
  useEffect(() => { setMenuOpen(false); setSheetOpen(false); }, [location.pathname]);
  useEffect(() => {
    if (!menuOpen) return undefined;
    const onDown = (e) => { if (menuRef.current && !menuRef.current.contains(e.target)) setMenuOpen(false); };
    const onKey = (e) => { if (e.key === 'Escape') setMenuOpen(false); };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('mousedown', onDown); document.removeEventListener('keydown', onKey); };
  }, [menuOpen]);

  const logout = async()=> {
    try {
      axios.defaults.withCredentials = true
      const {data} = await axios.post(backendUrl + '/api/auth/logout')
      data.success && clearAuth()
      navigate('/login')
    } catch (error) {
      toast.error(error.message)
    }
  }

  // Student-only tools (CV analyzer, skills, interview) are hidden from staff.
  const links = role === ROLES.ADMIN
    ? [
        { to: '/manage-people', label: 'Manage people' },
        { to: '/staff', label: 'Students' },
        { to: '/admin-overview', label: 'Overview' },
        { to: '/grading', label: 'Grading' },
        { to: '/questions', label: 'Questions' },
      ]
    : role === ROLES.STUDENT
      ? [
          { to: '/fresher-dashboard', label: 'Dashboard' },
          { to: '/cv-analyzer', label: 'CV analyzer' },
          { to: '/swot', label: 'Skills' },
          { to: '/practice', label: 'Practice' },
          { to: '/interview', label: 'Interview' },
        ]
      : role === ROLES.LECTURER
        ? [
            { to: '/staff', label: 'Dashboard' },
            { to: '/grading', label: 'Grading' },
            { to: '/questions', label: 'Questions' },
          ]
        : [];

  const initial = userData?.name?.[0]?.toUpperCase() || '';

  return (
    <div className="sticky top-3 z-40 px-3 pt-3 sm:px-6">
      <div className="mx-auto max-w-7xl">
        <div className="flex items-center justify-between gap-3 rounded-full border border-white/70 bg-white/80 py-2 pl-4 pr-2 shadow-pill backdrop-blur-xl">

          {/* Logo redirects to the role home */}
          <button type="button" aria-label="PrepWise home" className="shrink-0 rounded-full" onClick={() => navigate(homeForRole(role))}>
            <Logo size={32} />
          </button>

          <nav aria-label="Main" className="hidden min-w-0 items-center gap-1 lg:flex">
            {links.map((l) => (
              <NavLink key={l.to} to={l.to} className={linkCls}>
                {l.label}
              </NavLink>
            ))}
          </nav>

          <div className="flex items-center gap-2">
            <div className="relative" ref={menuRef}>
              <button
                type="button"
                aria-haspopup="menu"
                aria-expanded={menuOpen}
                onClick={() => setMenuOpen((o) => !o)}
                className="flex items-center gap-2 rounded-full border border-line bg-surface py-1 pl-1 pr-3 text-sm font-medium text-ink transition hover:border-primary-300"
              >
                <span className="grid h-8 w-8 place-items-center rounded-full bg-primary-600 text-sm font-semibold text-white">{initial}</span>
                <span className="hidden max-w-[9rem] truncate sm:inline">{userData ? userData.name : "Guest"}</span>
                <ChevronDown size={14} aria-hidden="true" className={`hidden text-ink-muted transition sm:block ${menuOpen ? 'rotate-180' : ''}`} />
              </button>
              {menuOpen && (
                <div role="menu" className="absolute right-0 top-full z-50 mt-2 w-60 animate-sheet-in rounded-3xl border border-line bg-surface p-2 shadow-float">
                  <div className="px-3 pb-2 pt-2">
                    <p className="truncate text-sm font-semibold text-ink">{userData ? userData.name : "Guest"}</p>
                    {role && role !== ROLES.STUDENT && (
                      <span className="mt-1 inline-block rounded-full bg-primary-100 px-2.5 py-0.5 text-xs font-semibold text-primary-800">{ROLE_LABELS[role]}</span>
                    )}
                  </div>
                  <div className="my-1 h-px bg-line" />
                  <button role="menuitem" type="button" onClick={() => navigate('/profile-settings')} className="flex w-full items-center gap-2.5 rounded-2xl px-3 py-2.5 text-left text-sm text-ink transition hover:bg-sand">
                    <Settings size={16} aria-hidden="true" /> Profile Settings
                  </button>
                  <button role="menuitem" type="button" onClick={logout} className="flex w-full items-center gap-2.5 rounded-2xl px-3 py-2.5 text-left text-sm text-danger-700 transition hover:bg-danger-50">
                    <LogOut size={16} aria-hidden="true" /> Logout
                  </button>
                </div>
              )}
            </div>

            <button
              type="button"
              className="grid h-10 w-10 place-items-center rounded-full bg-sand text-ink transition hover:bg-primary-100 lg:hidden"
              aria-label={sheetOpen ? 'Close menu' : 'Open menu'}
              aria-expanded={sheetOpen}
              aria-controls="mobile-sheet"
              onClick={() => setSheetOpen((o) => !o)}
            >
              {sheetOpen ? <X size={18} aria-hidden="true" /> : <Menu size={18} aria-hidden="true" />}
            </button>
          </div>
        </div>

        {/* Mobile sheet */}
        {sheetOpen && (
          <nav id="mobile-sheet" aria-label="Mobile" className="mt-2 animate-sheet-in rounded-[2rem] border border-line bg-surface/95 p-3 shadow-float backdrop-blur-xl lg:hidden">
            <ul className="m-0 grid list-none gap-1 p-0">
              {links.map((l) => (
                <li key={l.to}>
                  <NavLink to={l.to} className={({ isActive }) => `block rounded-2xl px-4 py-3 text-sm font-semibold transition ${isActive ? 'bg-ink-deep text-white' : 'text-ink hover:bg-sand'}`}>
                    {l.label}
                  </NavLink>
                </li>
              ))}
            </ul>
          </nav>
        )}
      </div>
    </div>
  );
};

export default NavBar;
