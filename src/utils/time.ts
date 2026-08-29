/**
 * Formats a crowd status timestamptz string into a human-friendly relative freshness string.
 *
 * Rules:
 * < 1 minute   -> "Updated just now"   (compact: "Just now")
 * 1–59 minutes -> "Updated X min ago"  (compact: "Xm ago")
 * 1 hour       -> "Updated 1 hr ago"   (compact: "1h ago")
 * 2–23 hours   -> "Updated X hrs ago"  (compact: "Xh ago")
 * 24–47 hours  -> "Updated yesterday"  (compact: "Yesterday")
 * 48+ hours    -> "Updated X days ago" (compact: "Xd ago")
 */
export function formatCrowdUpdatedAt(
  timestamp?: string | Date | null,
  options?: { compact?: boolean }
): string | null {
  if (!timestamp) return null;

  const date = new Date(timestamp);
  if (isNaN(date.getTime())) return null;

  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  if (diffMs < 0) {
    return options?.compact ? 'Just now' : 'Updated just now';
  }

  const diffMins = Math.floor(diffMs / (1000 * 60));
  const isCompact = options?.compact ?? false;

  if (diffMins < 1) {
    return isCompact ? 'Just now' : 'Updated just now';
  }

  if (diffMins < 60) {
    return isCompact ? `${diffMins}m ago` : `Updated ${diffMins} min ago`;
  }

  const diffHours = Math.floor(diffMins / 60);
  if (diffHours === 1) {
    return isCompact ? '1h ago' : 'Updated 1 hr ago';
  }
  if (diffHours < 24) {
    return isCompact ? `${diffHours}h ago` : `Updated ${diffHours} hrs ago`;
  }

  const diffDays = Math.floor(diffHours / 24);
  if (diffDays === 1) {
    return isCompact ? 'Yesterday' : 'Updated yesterday';
  }

  return isCompact ? `${diffDays}d ago` : `Updated ${diffDays} days ago`;
}
