import React, { useContext } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { AppContext } from './AppContext';
import { homeForRole } from '../utils/roles';
import Logo from '../components/Logo';
import { Button } from '../components/ui';

// Any URL the app does not know (including pages that were removed): a plain "page not found" with a way home.
// Signed-in users get a link to their own home; everyone else to the start page and the login.
const NotFound = () => {
  const { isLoggedin, role, authLoading } = useContext(AppContext);
  const { pathname } = useLocation();
  if (authLoading) return null;
  const signedIn = isLoggedin && role;
  return (
    <main className="flex min-h-screen flex-col bg-paper px-5 py-6 sm:px-10">
      <Link to="/" aria-label="PrepWise home" className="self-start"><Logo size={34} /></Link>
      <div className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center py-10">
        <div className="rounded-[2rem] border border-line bg-surface p-7 text-center shadow-card sm:p-9">
          <p className="font-display text-5xl font-semibold text-primary-700">404</p>
          <h1 className="mt-3 font-display text-2xl font-semibold text-ink">Page not found</h1>
          <p className="mt-2 break-words text-sm text-ink-2">
            There is no page at <code className="rounded bg-sand px-1.5 py-0.5 text-ink">{pathname}</code>. It may have moved or been removed.
          </p>
          <div className="mt-6 flex flex-col justify-center gap-3 sm:flex-row">
            {signedIn ? (
              <Button as={Link} to={homeForRole(role)}>Go to your home page</Button>
            ) : (
              <>
                <Button as={Link} to="/">Go to the start page</Button>
                <Button as={Link} to="/login" variant="secondary">Log in</Button>
              </>
            )}
          </div>
        </div>
      </div>
    </main>
  );
};

export default NotFound;
