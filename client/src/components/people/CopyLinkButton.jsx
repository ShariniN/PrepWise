import React from 'react';
import { toast } from 'react-toastify';
import { Copy } from 'lucide-react';

// Only rendered when the API returned an inviteLink (non-production servers).
const CopyLinkButton = ({ link, className = '' }) => {
  if (!link) return null;
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(link);
      toast.success('Invite link copied');
    } catch {
      window.prompt('Copy this invite link', link);
    }
  };
  return (
    <button type="button" onClick={copy} className={`inline-flex items-center gap-1 text-indigo-700 hover:underline text-sm ${className}`}>
      <Copy size={14} aria-hidden="true" /> Copy invite link
    </button>
  );
};

export default CopyLinkButton;
